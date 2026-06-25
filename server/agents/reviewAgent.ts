import { appendMessage, getOrCreateConversation, listMessages } from "../db";
import type { Message, Transaction } from "../../drizzle/schema";
import { buildInitialMessages } from "./contextBuilder";
import { deepseekProvider } from "./providers/deepseek";
import {
  type ChatMessage,
  type ChatProvider,
  ProviderError,
} from "./providers/types";
import { getProviderApiKey, getProviderBaseUrl } from "./secrets";

const DEFAULT_PROVIDER: ChatProvider = deepseekProvider;

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

async function resolveProvider(userId: number): Promise<ResolvedProvider> {
  const provider = DEFAULT_PROVIDER;
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
 * Open a per-trade conversation. The caller must have already verified that
 * `transaction` belongs to `userId`. Returns the existing thread on
 * subsequent opens; seeds a fresh thread (system + user context + initial
 * assistant reply) on the first call.
 */
export async function openConversation(params: {
  userId: number;
  transaction: Transaction;
}): Promise<{ conversationId: number; messages: ReviewMessage[] }> {
  const handle = await resolveProvider(params.userId);

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

/**
 * Append a user turn, ask the provider for a reply, append it, return the
 * full thread. Caller must have already verified that `conversationId`
 * belongs to `userId` (e.g. via the router's ownership guard).
 */
export async function sendUserMessage(params: {
  userId: number;
  conversationId: number;
  userText: string;
}): Promise<{ messages: ReviewMessage[] }> {
  const handle = await resolveProvider(params.userId);

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
