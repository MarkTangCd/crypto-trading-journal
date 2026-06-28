import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  MAX_PER_TOOL,
  MAX_STEPS,
  TIME_BUDGET_MS,
  type RunToolsEvent,
  runTools,
} from "./runTools";
import { register, unregisterForTest } from "./skillRegistry";
import type {
  ChatProvider,
  ChatRequest,
  ChatStreamChunk,
  ProviderCallOptions,
  ToolCall,
} from "./providers/types";

interface ScriptedTurn {
  /** Text deltas emitted before the toolCalls chunk (may be empty). */
  deltas?: string[];
  /** Tool calls the model "decides" to make on this turn. */
  toolCalls?: ToolCall[];
  /** Optional sleep before yielding — supports the time-budget test. */
  delayMs?: number;
}

/**
 * Build a provider whose chatStream replays a scripted sequence, one turn per
 * invocation. Each runTools step pops the next script entry; tests assert on
 * what gets yielded back through the orchestrator.
 */
function buildScriptedProvider(turns: ScriptedTurn[]): ChatProvider {
  let cursor = 0;
  return {
    id: "scripted",
    defaultModel: "scripted-model",
    async *chatStream(
      _req: ChatRequest,
      options: ProviderCallOptions
    ): AsyncIterable<ChatStreamChunk> {
      const turn = turns[cursor];
      cursor++;
      if (!turn) {
        throw new Error(`scripted provider ran out of turns at step ${cursor}`);
      }
      if (turn.delayMs && turn.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, turn.delayMs);
          options.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      }
      for (const delta of turn.deltas ?? []) {
        yield { delta };
      }
      if (turn.toolCalls?.length) {
        yield { toolCalls: turn.toolCalls };
      }
    },
    async chat() {
      throw new Error("not used in tests");
    },
  };
}

async function drain(
  generator: AsyncGenerator<RunToolsEvent, { appended: unknown[] }>
): Promise<{ events: RunToolsEvent[]; appended: unknown[] }> {
  const events: RunToolsEvent[] = [];
  while (true) {
    const { value, done } = await generator.next();
    if (done) return { events, appended: value.appended };
    events.push(value);
  }
}

const TOOL_FOO = "__test_foo";
const TOOL_BAR = "__test_bar";
// Three extra tools so max-steps (12) can be hit without first tripping the
// per-tool guard (5 calls per tool).
const ROTATING_TOOLS = ["__test_r0", "__test_r1", "__test_r2"];

const fooRun = vi.fn();
const barRun = vi.fn();
const rotatingRun = vi.fn();

beforeEach(() => {
  fooRun.mockReset().mockResolvedValue({ ok: true });
  barRun.mockReset().mockResolvedValue({ ok: true });
  rotatingRun.mockReset().mockResolvedValue({ ok: true });
  register({
    name: TOOL_FOO,
    description: "test tool foo",
    parameters: z.object({ x: z.number().optional() }),
    run: fooRun,
  });
  register({
    name: TOOL_BAR,
    description: "test tool bar",
    parameters: z.object({}),
    run: barRun,
  });
  for (const name of ROTATING_TOOLS) {
    register({
      name,
      description: `rotating tool ${name}`,
      parameters: z.object({}),
      run: rotatingRun,
    });
  }
});

afterEach(() => {
  unregisterForTest(TOOL_FOO);
  unregisterForTest(TOOL_BAR);
  for (const name of ROTATING_TOOLS) unregisterForTest(name);
  vi.useRealTimers();
});

describe("runTools", () => {
  it("single step without tool calls returns the assistant text as the final turn", async () => {
    const provider = buildScriptedProvider([{ deltas: ["hello ", "world"] }]);

    const { events, appended } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "hi" }],
      })
    );

    expect(events).toEqual([
      { type: "delta", text: "hello " },
      { type: "delta", text: "world" },
    ]);
    expect(appended).toEqual([{ role: "assistant", content: "hello world" }]);
  });

  it("runs a single tool then loops; emits tool_call + tool_result(ok=true)", async () => {
    const call: ToolCall = {
      id: "call-1",
      name: TOOL_FOO,
      arguments: JSON.stringify({ x: 1 }),
    };
    const provider = buildScriptedProvider([
      { toolCalls: [call] },
      { deltas: ["done"] },
    ]);

    const { events, appended } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
      })
    );

    expect(fooRun).toHaveBeenCalledOnce();
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_call",
        id: "call-1",
        name: TOOL_FOO,
      }),
      expect.objectContaining({
        type: "tool_result",
        id: "call-1",
        name: TOOL_FOO,
        ok: true,
      }),
      { type: "delta", text: "done" },
    ]);
    expect(appended).toEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [call],
      },
      {
        role: "tool",
        content: JSON.stringify({ ok: true }),
        toolCallId: "call-1",
        name: TOOL_FOO,
      },
      { role: "assistant", content: "done" },
    ]);
  });

  it("tool throwing surfaces tool_result.ok=false with the error message", async () => {
    fooRun.mockRejectedValueOnce(new Error("boom"));
    const call: ToolCall = {
      id: "call-1",
      name: TOOL_FOO,
      arguments: JSON.stringify({}),
    };
    const provider = buildScriptedProvider([
      { toolCalls: [call] },
      { deltas: ["recovered"] },
    ]);

    const { events, appended } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
      })
    );

    const result = events.find(e => e.type === "tool_result");
    expect(result).toMatchObject({ ok: false });
    expect(result).toMatchObject({ summary: expect.stringContaining("boom") });
    // appended should still include the failed tool message so the model can
    // observe the failure on the next loop iter.
    const toolMessages = (appended as Array<{ role: string }>).filter(
      m => m.role === "tool"
    );
    expect(toolMessages).toHaveLength(1);
  });

  it("per-tool limit: 6th invocation of the same tool triggers the guard fallback", async () => {
    const turns: ScriptedTurn[] = [];
    for (let i = 0; i < MAX_PER_TOOL + 1; i++) {
      turns.push({
        toolCalls: [
          { id: `call-${i}`, name: TOOL_FOO, arguments: JSON.stringify({}) },
        ],
      });
    }
    turns.push({ deltas: ["fallback answer"] });

    const provider = buildScriptedProvider(turns);

    const { events, appended } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
      })
    );

    // 5 successful invocations + 1 synthetic failure for the 6th request.
    expect(fooRun).toHaveBeenCalledTimes(MAX_PER_TOOL);
    const results = events.filter(e => e.type === "tool_result");
    expect(results.at(-1)).toMatchObject({ ok: false });
    // Guard notice was injected as a delta before the fallback chat replied.
    const deltas = events.filter(e => e.type === "delta");
    expect(deltas.some(d => "text" in d && /单工具/.test(d.text))).toBe(true);
    expect(deltas.at(-1)).toMatchObject({ text: "fallback answer" });
    // Final appended assistant carries notice + fallback content.
    const last = appended.at(-1) as { role: string; content: string };
    expect(last.role).toBe("assistant");
    expect(last.content).toMatch(/单工具[\s\S]*fallback answer/);
  });

  it("max steps: 13th turn forces fallback without making the model produce content", async () => {
    const turns: ScriptedTurn[] = [];
    for (let i = 0; i < MAX_STEPS; i++) {
      turns.push({
        toolCalls: [
          {
            id: `call-${i}`,
            name: ROTATING_TOOLS[i % ROTATING_TOOLS.length],
            arguments: JSON.stringify({}),
          },
        ],
      });
    }
    turns.push({ deltas: ["forced answer"] });

    const provider = buildScriptedProvider(turns);

    const { events } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
      })
    );

    const deltas = events.filter(e => e.type === "delta");
    expect(deltas.some(d => "text" in d && /步数/.test(d.text))).toBe(true);
    expect(deltas.at(-1)).toMatchObject({ text: "forced answer" });
  });

  it("time budget: when a step exceeds TIME_BUDGET_MS the orchestrator falls back", async () => {
    vi.useFakeTimers();
    const provider = buildScriptedProvider([
      { delayMs: TIME_BUDGET_MS + 1_000, deltas: ["never seen"] },
      { deltas: ["fallback after timeout"] },
    ]);

    const generator = runTools({
      provider,
      model: "scripted-model",
      apiKey: "k",
      messages: [{ role: "user", content: "go" }],
    });

    // Kick off the run, then advance past the budget to trigger the AbortSignal.
    const runPromise = drain(generator);
    await vi.advanceTimersByTimeAsync(TIME_BUDGET_MS + 100);
    vi.useRealTimers();
    const { events } = await runPromise;

    const deltas = events.filter(e => e.type === "delta");
    expect(deltas.some(d => "text" in d && /时间预算/.test(d.text))).toBe(true);
    expect(deltas.at(-1)).toMatchObject({
      text: "fallback after timeout",
    });
  });
});

describe("runTools enabledSkillIds", () => {
  it("non-empty enabledSkillIds advertises only the listed skills to the provider", async () => {
    const observed: Array<ChatRequest["tools"]> = [];
    const provider: ChatProvider = {
      id: "observer",
      defaultModel: "observer-model",
      async *chatStream(req: ChatRequest) {
        observed.push(req.tools);
        yield { delta: "done" };
      },
      async chat() {
        throw new Error("not used in tests");
      },
    };

    await drain(
      runTools({
        provider,
        model: "observer-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
        enabledSkillIds: [TOOL_FOO],
      })
    );

    expect(observed).toHaveLength(1);
    const names = (observed[0] ?? []).map(t => t.name).sort();
    expect(names).toEqual([TOOL_FOO]);
  });

  it("blocks execution of a skill the provider names outside enabledSkillIds", async () => {
    const call: ToolCall = {
      id: "call-bar",
      name: TOOL_BAR,
      arguments: "{}",
    };
    const provider = buildScriptedProvider([
      { toolCalls: [call] },
      { deltas: ["done"] },
    ]);

    const { events } = await drain(
      runTools({
        provider,
        model: "scripted-model",
        apiKey: "k",
        messages: [{ role: "user", content: "go" }],
        enabledSkillIds: [TOOL_FOO],
      })
    );

    expect(barRun).not.toHaveBeenCalled();
    const result = events.find(
      e => e.type === "tool_result" && e.id === "call-bar"
    );
    expect(result).toMatchObject({
      type: "tool_result",
      ok: false,
      summary: expect.stringContaining("skill not enabled"),
    });
  });
});
