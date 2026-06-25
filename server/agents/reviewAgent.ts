import {
  appendMessage,
  getAgentSettings,
  getConversationById,
  getConversationByTransaction,
  getOrCreateConversation,
  listMessages,
} from "../db";
import type { Conversation, Message, Transaction } from "../../drizzle/schema";
import { buildInitialMessages } from "./contextBuilder";
import { getProvider } from "./providers/registry";
import {
  type ChatMessage,
  type ChatProvider,
  ProviderError,
} from "./providers/types";
import { getProviderApiKey, getProviderBaseUrl } from "./secrets";

const FALLBACK_PROVIDER_ID = "deepseek";

export interface ReviewMessage {
  id: number;
  role: Message["role"];
  text: string;
  createdAt: number;
}

interface ResolvedProvider {
  provider: ChatProvider;
  apiKey: string;
  baseUrl?: string;
}

// Resolve a provider strictly by id. Throws ProviderError("AUTH", ...) when
// the id is missing from the registry or the user has no key configured for
// it; the router maps that to TRPCError("BAD_REQUEST", ...).
async function resolveProviderById(
  userId: number,
  providerId: string
): Promise<ResolvedProvider> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new ProviderError(
      "AUTH",
      `未知的 provider "${providerId}"，请在 Settings 页重新选择。`
    );
  }

  const apiKey = await getProviderApiKey(userId, provider.id);
  if (!apiKey) {
    throw new ProviderError(
      "AUTH",
      `未配置 ${provider.id} 的 api key。请在 Settings 页填写后再试。`
    );
  }
  return {
    provider,
    apiKey,
    baseUrl: await getProviderBaseUrl(userId, provider.id),
  };
}

// Resolve the user's default provider from agent_settings, falling back to
// FALLBACK_PROVIDER_ID. Used as the implicit choice when no explicit
// providerId is supplied at conversation-open time.
async function resolveDefaultProvider(
  userId: number
): Promise<ResolvedProvider> {
  const settings = await getAgentSettings(userId);
  const requestedId = settings?.defaultProvider ?? FALLBACK_PROVIDER_ID;

  try {
    return await resolveProviderById(userId, requestedId);
  } catch (error) {
    // Unknown id in agent_settings (e.g. a removed provider) → fall back.
    if (
      error instanceof ProviderError &&
      error.code === "AUTH" &&
      requestedId !== FALLBACK_PROVIDER_ID &&
      !getProvider(requestedId)
    ) {
      console.warn(
        `[ReviewAgent] unknown provider "${requestedId}" in agent_settings; falling back to ${FALLBACK_PROVIDER_ID}.`
      );
      return resolveProviderById(userId, FALLBACK_PROVIDER_ID);
    }
    throw error;
  }
}

function serialize(text: string): string {
  return JSON.stringify({ text });
}

function toReviewMessage(message: Message): ReviewMessage {
  let text = message.content;
  try {
    const parsed = JSON.parse(message.content) as { text?: string };
    if (typeof parsed.text === "string") text = parsed.text;
  } catch {
    // raw string fallback
  }
  return {
    id: message.id,
    role: message.role,
    text,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.getTime()
        : Number(message.createdAt),
  };
}

function toChatHistory(rows: ReviewMessage[]): ChatMessage[] {
  return rows.map(row => ({ role: row.role, content: row.text }));
}

async function loadThread(
  conversationId: number,
  userId: number
): Promise<ReviewMessage[]> {
  const rows = await listMessages({ conversationId, userId });
  return rows.map(toReviewMessage);
}

/**
 * Look up an existing conversation for a trade without creating one. Returns
 * `{ conversation, messages }` or null. Used by the client to render the
 * provider picker before the first turn commits.
 */
export async function getActiveConversation(params: {
  userId: number;
  transactionId: number;
}): Promise<{
  conversation: Conversation;
  messages: ReviewMessage[];
} | null> {
  const conversation = await getConversationByTransaction(
    params.userId,
    params.transactionId
  );
  if (!conversation) return null;
  return {
    conversation,
    messages: await loadThread(conversation.id, params.userId),
  };
}

/**
 * Open a per-trade conversation. The caller must have already verified that
 * `transaction` belongs to `userId`. Returns the existing thread on
 * subsequent opens; seeds a fresh thread (system + user context + initial
 * assistant reply) on the first call.
 *
 * Provider precedence:
 *   1. existing conversation → `conversation.providerId` (locked per-trade)
 *   2. caller-supplied `params.providerId` (explicit override on first open)
 *   3. `agent_settings.defaultProvider` (implicit fallback)
 */
export async function openConversation(params: {
  userId: number;
  transaction: Transaction;
  providerId?: string;
}): Promise<{ conversationId: number; messages: ReviewMessage[] }> {
  const existingConversation = await getConversationByTransaction(
    params.userId,
    params.transaction.id
  );

  const handle = existingConversation
    ? await resolveProviderById(params.userId, existingConversation.providerId)
    : params.providerId
      ? await resolveProviderById(params.userId, params.providerId)
      : await resolveDefaultProvider(params.userId);

  const conversation = await getOrCreateConversation({
    userId: params.userId,
    transactionId: params.transaction.id,
    providerId: handle.provider.id,
    model: handle.provider.defaultModel,
  });

  const existing = await loadThread(conversation.id, params.userId);
  if (existing.length > 0) {
    return { conversationId: conversation.id, messages: existing };
  }

  const { system, user } = await buildInitialMessages({
    userId: params.userId,
    transaction: params.transaction,
  });

  await appendMessage({
    conversationId: conversation.id,
    role: "system",
    content: serialize(system.content),
  });
  await appendMessage({
    conversationId: conversation.id,
    role: "user",
    content: serialize(user.content),
  });

  const assistant = await handle.provider.chat(
    { model: conversation.model, messages: [system, user] },
    { apiKey: handle.apiKey, baseUrl: handle.baseUrl }
  );

  await appendMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: serialize(assistant.content),
  });

  return {
    conversationId: conversation.id,
    messages: await loadThread(conversation.id, params.userId),
  };
}

async function resolveConversationProvider(
  userId: number,
  conversationId: number
): Promise<{ handle: ResolvedProvider; conversation: Conversation }> {
  const conversation = await getConversationById(conversationId, userId);
  if (!conversation) {
    throw new ProviderError("AUTH", "对话不存在或不属于当前用户。");
  }
  return {
    handle: await resolveProviderById(userId, conversation.providerId),
    conversation,
  };
}

/**
 * Append a user turn, ask the provider for a reply, append it, return the
 * full thread. Caller must have already verified that `conversationId`
 * belongs to `userId` (e.g. via the router's ownership guard).
 *
 * Provider is resolved from `conversation.providerId` so an old conversation
 * keeps streaming via its original provider even if the user later changed
 * their default in Settings.
 */
export async function sendUserMessage(params: {
  userId: number;
  conversationId: number;
  userText: string;
}): Promise<{ messages: ReviewMessage[] }> {
  const { handle } = await resolveConversationProvider(
    params.userId,
    params.conversationId
  );

  const existing = await loadThread(params.conversationId, params.userId);
  if (existing.length === 0) {
    throw new ProviderError("AUTH", "对话不存在或不属于当前用户。");
  }

  await appendMessage({
    conversationId: params.conversationId,
    role: "user",
    content: serialize(params.userText),
  });

  const history: ChatMessage[] = [
    ...toChatHistory(existing),
    { role: "user", content: params.userText },
  ];

  const assistant = await handle.provider.chat(
    { model: handle.provider.defaultModel, messages: history },
    { apiKey: handle.apiKey, baseUrl: handle.baseUrl }
  );

  await appendMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: serialize(assistant.content),
  });

  return { messages: await loadThread(params.conversationId, params.userId) };
}

export async function listReviewMessages(params: {
  userId: number;
  conversationId: number;
}): Promise<ReviewMessage[]> {
  return loadThread(params.conversationId, params.userId);
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: number }
  | { type: "error"; message: string };

/**
 * Streaming counterpart to `sendUserMessage`. Persists the user turn BEFORE
 * opening the upstream stream so a mid-stream client disconnect still
 * preserves what the user typed. On stream-end success the assembled
 * assistant turn is persisted and a final `done` event is yielded; on
 * upstream failure no assistant turn is persisted and a single `error` event
 * is yielded instead.
 *
 * The caller (Express SSE handler) is expected to pass an `AbortSignal`
 * that fires when the client disconnects, so the upstream fetch is
 * cancelled rather than billed to completion.
 */
export async function* streamUserMessage(params: {
  userId: number;
  conversationId: number;
  userText: string;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { handle } = await resolveConversationProvider(
    params.userId,
    params.conversationId
  );

  const existing = await loadThread(params.conversationId, params.userId);
  if (existing.length === 0) {
    throw new ProviderError("AUTH", "对话不存在或不属于当前用户。");
  }

  // Persist user turn FIRST so it survives a mid-stream disconnect.
  await appendMessage({
    conversationId: params.conversationId,
    role: "user",
    content: serialize(params.userText),
  });

  const history: ChatMessage[] = [
    ...toChatHistory(existing),
    { role: "user", content: params.userText },
  ];

  let assembled = "";
  try {
    for await (const chunk of handle.provider.chatStream(
      { model: handle.provider.defaultModel, messages: history },
      { apiKey: handle.apiKey, baseUrl: handle.baseUrl, signal: params.signal }
    )) {
      assembled += chunk.delta;
      yield { type: "delta", text: chunk.delta };
    }
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? error.message
        : "助手回复失败，请稍后再试。";
    yield { type: "error", message };
    return;
  }

  if (assembled.length === 0) {
    yield { type: "error", message: "助手没有返回任何内容，请稍后再试。" };
    return;
  }

  const persisted = await appendMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: serialize(assembled),
  });

  yield { type: "done", messageId: persisted.id };
}
