import {
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ChatStreamChunk,
  type ProviderCallOptions,
  ProviderError,
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

interface StreamDelta {
  choices?: Array<{ delta?: { content?: string } }>;
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
    return { role: message.role, content: message.content };
  });
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

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseSseFrames(buffer);
      buffer = parsed.remainder;

      for (const frame of parsed.frames) {
        let payload: StreamDelta;
        try {
          payload = JSON.parse(frame.data) as StreamDelta;
        } catch {
          // Skip malformed frames rather than aborting the whole stream —
          // upstream occasionally interleaves diagnostic data.
          continue;
        }
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { delta };
        }
      }

      if (parsed.done) return;
    }

    // Flush any tail bytes (defensive — providers always end with \n\n).
    if (buffer.length > 0) {
      const tail = parseSseFrames(buffer + "\n\n");
      for (const frame of tail.frames) {
        try {
          const payload = JSON.parse(frame.data) as StreamDelta;
          const delta = payload.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield { delta };
          }
        } catch {
          // ignore
        }
      }
    }
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
      for await (const chunk of this.chatStream(req, options)) {
        assembled += chunk.delta;
      }
      if (assembled.length === 0) {
        throw new ProviderError(
          "INVALID_RESPONSE",
          `${config.errorBrand} 返回为空，请稍后重试。`
        );
      }
      return { role: "assistant", content: assembled };
    },
  };
}
