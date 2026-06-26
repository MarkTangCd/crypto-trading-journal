import {
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ChatStreamChunk,
  type ProviderCallOptions,
  ProviderError,
  type ToolCall,
} from "./types";
import { parseSseFrames } from "./sseParser";

const REQUEST_TIMEOUT_MS = 60_000;

export interface OpenAICompatibleProviderConfig {
  /** Stable provider id, mirrored onto the returned ChatProvider. */
  id: string;
  /** Base URL used when the caller does not override via ProviderCallOptions. */
  defaultBaseUrl: string;
  /** Default model id used when the request does not specify one. */
  defaultModel: string;
  /** Brand string interpolated into user-facing error messages. */
  errorBrand: string;
}

interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface StreamDelta {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: ToolCallDelta[] };
    finish_reason?: string | null;
  }>;
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map(message => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.name,
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      // Replay assistant tool-call turns with the wire shape the upstream
      // expects (id + function.name + function.arguments). Required so the
      // model can correlate prior tool_result turns to their originating call.
      return {
        role: "assistant" as const,
        content: message.content,
        tool_calls: message.toolCalls.map(call => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAITools(req: ChatRequest) {
  if (!req.tools?.length) return undefined;
  return req.tools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function buildBody(
  req: ChatRequest,
  defaultModel: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model || defaultModel,
    messages: toOpenAIMessages(req.messages),
    stream: true,
  };
  if (typeof req.temperature === "number") {
    body.temperature = req.temperature;
  }
  const tools = toOpenAITools(req);
  if (tools) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  return body;
}

// Compose an AbortSignal that fires when either the per-request timeout
// elapses OR the caller's signal aborts. AbortSignal.any keeps the upstream
// fetch cancellable in both directions without leaking the timer.
function composeSignal(external: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}

function mapHttpStatus(
  status: number,
  upstreamText: string,
  errorBrand: string
): ProviderError {
  // Don't echo upstream payload to the UI — keep it for server logs only.
  console.warn(
    `[ReviewAgent] ${errorBrand} upstream ${status}: ${upstreamText.slice(0, 200)}`
  );

  if (status === 401 || status === 403) {
    return new ProviderError(
      "AUTH",
      `${errorBrand} api key 无效，请到 Settings 重新填写。`
    );
  }
  if (status === 429) {
    return new ProviderError(
      "RATE_LIMIT",
      `${errorBrand} 接口限流，请稍后再试。`
    );
  }
  return new ProviderError(
    "UPSTREAM",
    `${errorBrand} 接口异常（状态码 ${status}）。`
  );
}

async function openStream(
  req: ChatRequest,
  { apiKey, baseUrl, signal }: ProviderCallOptions,
  config: OpenAICompatibleProviderConfig
): Promise<Response> {
  if (!apiKey) {
    throw new ProviderError(
      "AUTH",
      `未配置 ${config.errorBrand} api key。请到 Settings 填写。`
    );
  }

  const url = `${(baseUrl || config.defaultBaseUrl).replace(/\/$/, "")}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(buildBody(req, config.defaultModel)),
      signal: composeSignal(signal),
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new ProviderError("NETWORK", "请求已被中断。", error);
    }
    throw new ProviderError(
      "NETWORK",
      `无法连接 ${config.errorBrand}。请检查网络或代理配置。`,
      error
    );
  }

  if (!response.ok) {
    const upstreamText = await response.text().catch(() => "");
    throw mapHttpStatus(response.status, upstreamText, config.errorBrand);
  }

  return response;
}

interface ToolCallBufferEntry {
  id: string;
  name: string;
  argumentsBuffer: string;
}

// Merge an incoming streaming tool_calls delta array into the per-index buffer.
// OpenAI streams `function.arguments` as concatenable substrings; we accumulate
// until finish_reason="tool_calls" or end-of-stream, then emit completed calls.
function mergeToolCallDeltas(
  buffer: Map<number, ToolCallBufferEntry>,
  deltas: ToolCallDelta[]
): void {
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    const existing = buffer.get(index);
    if (existing) {
      if (delta.id) existing.id = delta.id;
      if (delta.function?.name) existing.name = delta.function.name;
      if (delta.function?.arguments) {
        existing.argumentsBuffer += delta.function.arguments;
      }
    } else {
      buffer.set(index, {
        id: delta.id ?? "",
        name: delta.function?.name ?? "",
        argumentsBuffer: delta.function?.arguments ?? "",
      });
    }
  }
}

function flushToolCalls(
  buffer: Map<number, ToolCallBufferEntry>
): ToolCall[] | undefined {
  if (buffer.size === 0) return undefined;
  const calls: ToolCall[] = [];
  // Emit in index order so concurrent tool_calls keep their declared sequence.
  const indices = Array.from(buffer.keys()).sort((a, b) => a - b);
  for (const index of indices) {
    const entry = buffer.get(index)!;
    if (entry.id && entry.name) {
      calls.push({
        id: entry.id,
        name: entry.name,
        arguments: entry.argumentsBuffer,
      });
    }
  }
  buffer.clear();
  return calls.length > 0 ? calls : undefined;
}

async function* iterateStream(
  response: Response,
  errorBrand: string
): AsyncGenerator<ChatStreamChunk> {
  const body = response.body;
  if (!body) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      `${errorBrand} 流式响应为空，请稍后重试。`
    );
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const toolCallBuffer = new Map<number, ToolCallBufferEntry>();

  function* processFrames(
    frames: ReturnType<typeof parseSseFrames>["frames"]
  ): Generator<ChatStreamChunk> {
    for (const frame of frames) {
      let payload: StreamDelta;
      try {
        payload = JSON.parse(frame.data) as StreamDelta;
      } catch {
        continue;
      }
      const choice = payload.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield { delta };
      }
      if (choice?.delta?.tool_calls?.length) {
        mergeToolCallDeltas(toolCallBuffer, choice.delta.tool_calls);
      }
      if (choice?.finish_reason === "tool_calls") {
        const calls = flushToolCalls(toolCallBuffer);
        if (calls) yield { toolCalls: calls };
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseSseFrames(buffer);
      buffer = parsed.remainder;

      yield* processFrames(parsed.frames);

      if (parsed.done) {
        const trailing = flushToolCalls(toolCallBuffer);
        if (trailing) yield { toolCalls: trailing };
        return;
      }
    }

    // Flush any tail bytes (defensive — providers always end with \n\n).
    if (buffer.length > 0) {
      const tail = parseSseFrames(buffer + "\n\n");
      yield* processFrames(tail.frames);
    }
    // Stream closed without [DONE]; emit any remaining buffered tool_calls so
    // the caller still receives a complete ToolCall[] (kimi/glm occasionally
    // skip the finish_reason frame).
    const trailing = flushToolCalls(toolCallBuffer);
    if (trailing) yield { toolCalls: trailing };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as { name?: string })?.name === "AbortError") {
      throw new ProviderError("NETWORK", "请求已被中断。", error);
    }
    throw new ProviderError(
      "UPSTREAM",
      `${errorBrand} 流式响应解析失败。`,
      error
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Build a ChatProvider that targets any openai-compatible /chat/completions
 * endpoint with SSE streaming. Phase 3 providers (deepseek, kimi, glm, openai
 * itself) all share this wire shape — only branding and defaults differ.
 */
export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig
): ChatProvider {
  return {
    id: config.id,
    defaultModel: config.defaultModel,

    async *chatStream(req, options) {
      const response = await openStream(req, options, config);
      yield* iterateStream(response, config.errorBrand);
    },

    async chat(req, options) {
      let assembled = "";
      let toolCalls: ToolCall[] | undefined;
      for await (const chunk of this.chatStream(req, options)) {
        if (typeof chunk.delta === "string") assembled += chunk.delta;
        if (chunk.toolCalls?.length) toolCalls = chunk.toolCalls;
      }
      if (assembled.length === 0 && !toolCalls) {
        throw new ProviderError(
          "INVALID_RESPONSE",
          `${config.errorBrand} 返回为空，请稍后重试。`
        );
      }
      const message: ChatMessage = { role: "assistant", content: assembled };
      if (toolCalls) message.toolCalls = toolCalls;
      return message;
    },
  };
}
