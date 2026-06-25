/**
 * Cross-provider chat shapes. v1 is non-streaming and tool-free, but the
 * tool fields are reserved here so Phase 4 can light them up without touching
 * call sites.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  /** Plain text for user/assistant/system; JSON-stringified tool result for role=tool. */
  content: string;
  /** Present on assistant turns that asked the model to call a tool. */
  toolCalls?: ToolCall[];
  /** Present on role=tool turns; ties the result back to the assistant's tool call. */
  toolCallId?: string;
  /** Optional speaker name (used by some providers for tool turns). */
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Reserved for Phase 4. */
  tools?: ToolDeclaration[];
  temperature?: number;
}

export interface ProviderCallOptions {
  apiKey: string;
  baseUrl?: string;
  /** Aborts the upstream fetch (and any in-flight stream) when triggered. */
  signal?: AbortSignal;
}

export interface ChatStreamChunk {
  delta: string;
}

export interface ChatProvider {
  /** Stable provider id, e.g. "deepseek". */
  id: string;
  /** Default model id used when caller doesn't specify one. */
  defaultModel: string;
  /**
   * One-shot non-streaming chat completion. Implementations are expected to
   * be a thin drain-and-concat of `chatStream` — keeping a single source of
   * truth for the upstream call. MUST throw `ProviderError` (typed below) on
   * upstream failures so the orchestrator can map them to safe TRPCError
   * codes without leaking raw payloads.
   */
  chat(req: ChatRequest, options: ProviderCallOptions): Promise<ChatMessage>;
  /**
   * Streaming chat completion. Yields incremental text deltas as they arrive
   * from the upstream provider. Throws `ProviderError` (typed below) on any
   * upstream failure, both before the stream opens and during iteration.
   */
  chatStream(
    req: ChatRequest,
    options: ProviderCallOptions
  ): AsyncIterable<ChatStreamChunk>;
}

export type ProviderErrorCode =
  | "AUTH"
  | "RATE_LIMIT"
  | "NETWORK"
  | "UPSTREAM"
  | "INVALID_RESPONSE";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    /** User-facing message (Chinese) — safe to surface directly to the UI. */
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
