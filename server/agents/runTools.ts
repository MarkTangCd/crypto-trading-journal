import {
  type ChatMessage,
  type ChatProvider,
  type ProviderCallOptions,
  ProviderError,
  type ToolCall,
} from "./providers/types";
import { getSkill, listEnabledSkillDeclarations } from "./skillRegistry";

/**
 * Max chat→tool→chat steps before forcing a tool-free final answer.
 * Picked to bound runaway loops without strangling multi-step research.
 */
export const MAX_STEPS = 12;
/** Max invocations per tool per run; same loop-breaking purpose. */
export const MAX_PER_TOOL = 5;
/** Hard ceiling on total wall-clock for the entire orchestration. */
export const TIME_BUDGET_MS = 60_000;
/** Truncation budget for SSE event field sizes (full data stays in DB). */
const SUMMARY_MAX_CHARS = 200;

export type RunToolsEvent =
  | { type: "delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      /** Truncated args preview for UI; full string lives in messages.toolCalls. */
      argsSummary: string;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      /** Truncated result preview; full payload lives in messages.content. */
      summary: string;
    };

export interface RunToolsResult {
  /**
   * Messages produced during the run, in append order. Caller persists each
   * one and uses the final assistant id as the SSE `done.messageId`.
   */
  appended: ChatMessage[];
}

export interface RunToolsParams {
  provider: ChatProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** Conversation history (system + prior turns + current user turn). */
  messages: ChatMessage[];
  /** Caller abort — typically the SSE client-disconnect signal. */
  signal?: AbortSignal;
  /** Forwarded into tool.run() so tools can scope reads to the user. */
  userId?: number;
  /**
   * Skill ids (== skill.name) the agent is allowed to invoke this turn.
   * Empty / undefined → every registered skill is exposed (the zero-config
   * default that preserves Phase 4 behavior). Non-empty → only skills whose
   * id is in the set get advertised in the provider `tools[]` payload AND
   * are accepted in the post-validation execution gate.
   */
  enabledSkillIds?: string[];
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

function composeSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 0) return new AbortController().signal;
  if (live.length === 1) return live[0];
  return AbortSignal.any(live);
}

/**
 * Drive one chatStream call. Yields delta events to the parent generator and
 * returns the assembled text plus any tool_calls the model emitted.
 *
 * Streaming errors propagate; the caller wraps the loop in try/catch so
 * mid-stream provider failures surface as `error` SSE events.
 */
async function* runOneChatStep(
  params: RunToolsParams,
  messages: ChatMessage[],
  withTools: boolean,
  signal: AbortSignal
): AsyncGenerator<
  { type: "delta"; text: string },
  { content: string; toolCalls?: ToolCall[] }
> {
  const options: ProviderCallOptions = {
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    signal,
  };
  let assembled = "";
  let toolCalls: ToolCall[] | undefined;
  const stream = params.provider.chatStream(
    {
      model: params.model,
      messages,
      tools: withTools
        ? listEnabledSkillDeclarations(params.enabledSkillIds ?? [])
        : undefined,
    },
    options
  );
  for await (const chunk of stream) {
    if (typeof chunk.delta === "string" && chunk.delta.length > 0) {
      assembled += chunk.delta;
      yield { type: "delta", text: chunk.delta };
    }
    if (chunk.toolCalls?.length) toolCalls = chunk.toolCalls;
  }
  return { content: assembled, toolCalls };
}

interface ToolRunOutcome {
  call: ToolCall;
  ok: boolean;
  /** Full payload to persist as the role="tool" message content. */
  content: string;
}

async function executeToolCall(
  call: ToolCall,
  userId: number | undefined,
  signal: AbortSignal,
  enabledSkillIds: string[]
): Promise<ToolRunOutcome> {
  // Defense-in-depth: declarations are already filtered upstream, but if a
  // provider hallucinates a skill name outside the advertised set we still
  // refuse to execute it rather than silently widen the surface.
  if (enabledSkillIds.length > 0 && !enabledSkillIds.includes(call.name)) {
    return {
      call,
      ok: false,
      content: JSON.stringify({ error: `skill not enabled: ${call.name}` }),
    };
  }
  const tool = getSkill(call.name);
  if (!tool) {
    return {
      call,
      ok: false,
      content: JSON.stringify({ error: `unknown tool: ${call.name}` }),
    };
  }
  let parsedArgs: unknown;
  try {
    parsedArgs = call.arguments.length > 0 ? JSON.parse(call.arguments) : {};
  } catch {
    return {
      call,
      ok: false,
      content: JSON.stringify({ error: "invalid JSON arguments" }),
    };
  }
  try {
    const validated = tool.parameters.parse(parsedArgs);
    const result = await tool.run(validated, { userId, signal });
    return { call, ok: true, content: JSON.stringify(result ?? null) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "tool execution failed";
    return { call, ok: false, content: JSON.stringify({ error: message }) };
  }
}

/**
 * Orchestrate a tool-calling loop. Each step asks the provider for a reply
 * with `tools` enabled; if the model emits ToolCall[], the orchestrator runs
 * each one (parallel), appends a `role="tool"` message, and loops. The loop
 * ends when (a) the model returns text without tool_calls, or (b) any of the
 * three guards trips — at which point a tool-free fallback chat produces the
 * final answer.
 */
export async function* runTools(
  params: RunToolsParams
): AsyncGenerator<RunToolsEvent, RunToolsResult> {
  const appended: ChatMessage[] = [];
  const working: ChatMessage[] = [...params.messages];
  const usage = new Map<string, number>();

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), TIME_BUDGET_MS);
  const externalSignals: AbortSignal[] = [budget.signal];
  if (params.signal) externalSignals.push(params.signal);
  const combinedSignal = composeSignals(externalSignals);

  let guardReason: string | null = null;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (combinedSignal.aborted) {
        if (budget.signal.aborted) guardReason = "time-budget";
        break;
      }

      let stepResult: { content: string; toolCalls?: ToolCall[] };
      try {
        stepResult = yield* runOneChatStep(
          params,
          working,
          true,
          combinedSignal
        );
      } catch (err) {
        // Re-throwing lets the upstream SSE handler yield an `error` event for
        // genuine provider failures. The budget timer is the one exception:
        // an abort fired by our own timeout should drop into the guard
        // fallback rather than surface as a user-facing error.
        if (budget.signal.aborted) {
          guardReason = "time-budget";
          break;
        }
        throw err;
      }

      if (!stepResult.toolCalls || stepResult.toolCalls.length === 0) {
        const finalTurn: ChatMessage = {
          role: "assistant",
          content: stepResult.content,
        };
        appended.push(finalTurn);
        return { appended };
      }

      const assistantTurn: ChatMessage = {
        role: "assistant",
        content: stepResult.content,
        toolCalls: stepResult.toolCalls,
      };
      appended.push(assistantTurn);
      working.push(assistantTurn);

      // Per-tool guard: detect overflow BEFORE running so the 6th invocation
      // never reaches its tool — preserves the ≤ 5 invariant precisely.
      const allowed: ToolCall[] = [];
      const overflow: ToolCall[] = [];
      for (const call of stepResult.toolCalls) {
        const next = (usage.get(call.name) ?? 0) + 1;
        if (next > MAX_PER_TOOL) {
          overflow.push(call);
        } else {
          allowed.push(call);
          usage.set(call.name, next);
        }
      }

      // Emit tool_call events for everything the model requested — UI shows
      // overflow attempts too so the user understands why nothing ran.
      for (const call of stepResult.toolCalls) {
        yield {
          type: "tool_call",
          id: call.id,
          name: call.name,
          argsSummary: truncate(call.arguments, SUMMARY_MAX_CHARS),
        };
      }

      const enabledSkillIds = params.enabledSkillIds ?? [];
      const outcomes = await Promise.all(
        allowed.map(call =>
          executeToolCall(call, params.userId, combinedSignal, enabledSkillIds)
        )
      );

      // Synthetic outcomes for overflow calls — keep wire shape uniform so
      // the model + UI see one tool_result per requested tool_call.
      for (const call of overflow) {
        outcomes.push({
          call,
          ok: false,
          content: JSON.stringify({ error: "per-tool call limit reached" }),
        });
      }

      // Persist + emit in the original request order so the wire trace makes
      // sense regardless of which calls ran in parallel.
      const byId = new Map(outcomes.map(o => [o.call.id, o]));
      for (const call of stepResult.toolCalls) {
        const outcome = byId.get(call.id)!;
        const toolTurn: ChatMessage = {
          role: "tool",
          content: outcome.content,
          toolCallId: outcome.call.id,
          name: outcome.call.name,
        };
        working.push(toolTurn);
        appended.push(toolTurn);
        yield {
          type: "tool_result",
          id: outcome.call.id,
          name: outcome.call.name,
          ok: outcome.ok,
          summary: truncate(outcome.content, SUMMARY_MAX_CHARS),
        };
      }

      if (overflow.length > 0) {
        guardReason = "per-tool-limit";
        break;
      }

      if (combinedSignal.aborted) {
        if (budget.signal.aborted) guardReason = "time-budget";
        break;
      }
    }

    if (!guardReason && appended.length > 0) {
      // Loop ran to MAX_STEPS without the model deciding to stop.
      const last = appended[appended.length - 1];
      if (last.role !== "assistant" || last.toolCalls) {
        guardReason = "max-steps";
      }
    }

    if (guardReason) {
      const notice = guardNotice(guardReason);
      yield { type: "delta", text: notice };
      // Caller signal alone (no timer abort) means client disconnected — let
      // the fallback chat use a fresh signal so we still complete the reply.
      const fallbackSignal = params.signal ?? new AbortController().signal;
      const fallback = yield* runOneChatStep(
        params,
        working,
        false,
        fallbackSignal
      );
      const text = notice + fallback.content;
      appended.push({ role: "assistant", content: text });
    }

    return { appended };
  } finally {
    clearTimeout(timer);
  }
}

function guardNotice(reason: string): string {
  switch (reason) {
    case "time-budget":
      return "（工具调用时间预算已耗尽，将直接回答）\n";
    case "per-tool-limit":
      return "（单工具调用次数已达上限，将直接回答）\n";
    case "max-steps":
    default:
      return "（工具调用步数已达上限，将直接回答）\n";
  }
}

// Re-export ProviderError so callers that catch this generator can identify
// upstream failures with a single import.
export { ProviderError };
