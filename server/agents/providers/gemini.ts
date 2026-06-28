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
import {
  type GeminiToolsBlock,
  parseGeminiFunctionCalls,
  translateToGeminiTools,
} from "./geminiToolSchema";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 60_000;

interface GeminiTextPart {
  text: string;
}

interface GeminiFunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> };
}

interface GeminiFunctionResponsePart {
  functionResponse: { name: string; response: { content: unknown } };
}

type GeminiPart =
  | GeminiTextPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiStreamPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
  generationConfig?: { temperature: number };
  tools?: GeminiToolsBlock[];
}

/**
 * Best-effort JSON parse for replaying prior tool messages. Real production
 * tools always return JSON-stringified payloads (see runTools.executeToolCall),
 * but defensive parsing keeps a malformed message from poisoning the contents
 * array — we fall back to the raw string instead.
 */
function parseToolContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/**
 * Walk the chat history once, extracting system messages into a single
 * `systemInstruction` block (joined by newlines) and mapping the remaining
 * turns into google genai `contents[]`:
 *   - user        -> { role: "user",  parts: [text] }
 *   - assistant   -> { role: "model", parts: [text and/or functionCall] }
 *   - tool        -> { role: "user",  parts: [functionResponse] }   (google's
 *                    contract: functionResponse lives under role=user, NOT
 *                    role=function)
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
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name ?? "",
              response: { content: parseToolContent(message.content) },
            },
          },
        ],
      });
      continue;
    }

    if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (message.content.length > 0) parts.push({ text: message.content });
      if (message.toolCalls?.length) {
        for (const call of message.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            const parsed =
              call.arguments.length > 0 ? JSON.parse(call.arguments) : {};
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            // Malformed args replay shouldn't crash the chat — fall back to {}
            // so the model still sees a functionCall part.
          }
          parts.push({ functionCall: { name: call.name, args } });
        }
      }
      // Defensive: a model turn must have at least one part. An empty assistant
      // turn (no text, no toolCalls) shouldn't happen but if it does, emit a
      // single empty-text part rather than letting gemini 400.
      if (parts.length === 0) parts.push({ text: "" });
      contents.push({ role: "model", parts });
      continue;
    }

    contents.push({ role: "user", parts: [{ text: message.content }] });
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
  if (req.tools?.length) {
    body.tools = [translateToGeminiTools(req.tools)];
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
  const toolCallBuffer: ToolCall[] = [];

  function* processBuffer(): Generator<ChatStreamChunk> {
    const parsed = parseSseFrames(buffer);
    buffer = parsed.remainder;
    for (const frame of parsed.frames) {
      const payload = parsePayload(frame.data);
      if (!payload) continue;
      const delta = extractDelta(payload);
      if (delta) yield { delta };
      const calls = parseGeminiFunctionCalls(payload);
      if (calls) toolCallBuffer.push(...calls);
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* processBuffer();
      // gemini never sends a `[DONE]` sentinel — stream end is signalled by
      // the reader closing, so we ignore parsed.done here.
    }

    // Flush any tail bytes (defensive — providers normally end with \n\n).
    if (buffer.length > 0) {
      buffer += "\n\n";
      yield* processBuffer();
    }

    if (toolCallBuffer.length > 0) {
      yield { toolCalls: toolCallBuffer.splice(0) };
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

function parsePayload(rawData: string): GeminiStreamPayload | undefined {
  try {
    return JSON.parse(rawData) as GeminiStreamPayload;
  } catch {
    // Skip malformed frames rather than aborting the whole stream —
    // upstream occasionally interleaves diagnostic data.
    return undefined;
  }
}

function extractDelta(payload: GeminiStreamPayload): string | undefined {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  let text = "";
  for (const part of parts) {
    if (typeof part.text === "string") text += part.text;
  }
  return text.length > 0 ? text : undefined;
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
    let toolCalls: ToolCall[] | undefined;
    for await (const chunk of this.chatStream(req, options)) {
      if (typeof chunk.delta === "string") assembled += chunk.delta;
      if (chunk.toolCalls?.length) toolCalls = chunk.toolCalls;
    }
    if (assembled.length === 0 && !toolCalls) {
      throw new ProviderError(
        "INVALID_RESPONSE",
        "gemini 返回为空，请稍后重试。"
      );
    }
    const message: ChatMessage = { role: "assistant", content: assembled };
    if (toolCalls) message.toolCalls = toolCalls;
    return message;
  },
};
