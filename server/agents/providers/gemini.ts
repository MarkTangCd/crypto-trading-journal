import {
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ChatStreamChunk,
  type ProviderCallOptions,
  ProviderError,
} from "./types";
import { parseSseFrames } from "./sseParser";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 60_000;

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiStreamPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: { temperature: number };
}

/**
 * Walk the chat history once, extracting system messages into a single
 * `systemInstruction` block (joined by newlines) and mapping the remaining
 * user/assistant turns into google genai `contents[]` with `role: "model"`
 * for assistant. Tool turns are dropped — Phase 4 will light them up via
 * `tools: [{ functionDeclarations }]`.
 */
function splitMessages(messages: ChatMessage[]): {
  contents: GeminiContent[];
  systemText: string;
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === "tool") {
      // TODO(phase-4): map tool turns to google genai functionResponse parts.
      continue;
    }
    const role: GeminiContent["role"] =
      message.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: message.content }] });
  }

  return { contents, systemText: systemParts.join("\n") };
}

function buildBody(req: ChatRequest): GeminiRequestBody {
  const { contents, systemText } = splitMessages(req.messages);
  const body: GeminiRequestBody = { contents };
  if (systemText.length > 0) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }
  if (typeof req.temperature === "number") {
    body.generationConfig = { temperature: req.temperature };
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

function buildUrl(baseUrl: string | undefined, model: string, apiKey: string) {
  const trimmed = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  // apiKey goes in the query string per google genai contract; keep it out of
  // log lines and never echo it back from error mappers.
  return `${trimmed}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
}

async function openStream(
  req: ChatRequest,
  { apiKey, baseUrl, signal }: ProviderCallOptions
): Promise<Response> {
  if (!apiKey) {
    throw new ProviderError(
      "AUTH",
      "未配置 gemini api key。请到 Settings 填写。"
    );
  }

  const url = buildUrl(baseUrl, req.model || DEFAULT_MODEL, apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(buildBody(req)),
      signal: composeSignal(signal),
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new ProviderError("NETWORK", "请求已被中断。", error);
    }
    throw new ProviderError(
      "NETWORK",
      "无法连接 gemini。请检查网络或代理配置。",
      error
    );
  }

  if (!response.ok) {
    const upstreamText = await response.text().catch(() => "");
    throw mapHttpStatus(response.status, upstreamText);
  }

  return response;
}

async function* iterateStream(
  response: Response
): AsyncGenerator<ChatStreamChunk> {
  const body = response.body;
  if (!body) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "gemini 流式响应为空，请稍后重试。"
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
        const delta = extractDelta(frame.data);
        if (delta) yield { delta };
      }
      // gemini never sends a `[DONE]` sentinel — stream end is signalled by
      // the reader closing, so we ignore parsed.done here.
    }

    // Flush any tail bytes (defensive — providers normally end with \n\n).
    if (buffer.length > 0) {
      const tail = parseSseFrames(buffer + "\n\n");
      for (const frame of tail.frames) {
        const delta = extractDelta(frame.data);
        if (delta) yield { delta };
      }
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as { name?: string })?.name === "AbortError") {
      throw new ProviderError("NETWORK", "请求已被中断。", error);
    }
    throw new ProviderError("UPSTREAM", "gemini 流式响应解析失败。", error);
  } finally {
    reader.releaseLock();
  }
}

function extractDelta(rawData: string): string | undefined {
  let payload: GeminiStreamPayload;
  try {
    payload = JSON.parse(rawData) as GeminiStreamPayload;
  } catch {
    // Skip malformed frames rather than aborting the whole stream —
    // upstream occasionally interleaves diagnostic data.
    return undefined;
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" && text.length > 0 ? text : undefined;
}

function mapHttpStatus(status: number, upstreamText: string): ProviderError {
  // Don't echo the apiKey (which lives in the request URL, not in this text)
  // or upstream payload to the UI — keep it for server logs only.
  console.warn(
    `[ReviewAgent] gemini upstream ${status}: ${upstreamText.slice(0, 200)}`
  );

  if (status === 401 || status === 403) {
    return new ProviderError(
      "AUTH",
      "gemini api key 无效，请到 Settings 重新填写。"
    );
  }
  if (status === 429) {
    return new ProviderError("RATE_LIMIT", "gemini 接口限流，请稍后再试。");
  }
  return new ProviderError("UPSTREAM", `gemini 接口异常（状态码 ${status}）。`);
}

export const geminiProvider: ChatProvider = {
  id: "gemini",
  defaultModel: DEFAULT_MODEL,

  async *chatStream(req, options) {
    const response = await openStream(req, options);
    yield* iterateStream(response);
  },

  async chat(req, options) {
    let assembled = "";
    for await (const chunk of this.chatStream(req, options)) {
      assembled += chunk.delta;
    }
    if (assembled.length === 0) {
      throw new ProviderError(
        "INVALID_RESPONSE",
        "gemini 返回为空，请稍后重试。"
      );
    }
    return { role: "assistant", content: assembled };
  },
};
