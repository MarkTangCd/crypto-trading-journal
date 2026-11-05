import {
  appendMessage,
  getConversationByTrade,
  getOrCreateConversation,
} from "../db";
import type { Conversation, Trade } from "../../drizzle/schema";
import { buildInitialMessages } from "./contextBuilder";
import {
  type AgentMessage,
  type ResolvedProvider,
  loadThread,
  resolveDefaultProvider,
  resolveProviderById,
  serialize,
} from "./agentCore";

// Re-export shared conversation-turn primitives so existing importers
// (routers.ts, reviewAgentSseRoute.ts) don't need to change their import
// paths. Reviews and pre-trades share the same message shape and stream
// wire format.
export type { AgentMessage as ReviewMessage, StreamEvent } from "./agentCore";
export {
  listAgentMessages as listReviewMessages,
  sendUserMessage,
  streamUserMessage,
} from "./agentCore";

/**
 * Look up an existing conversation for a trade without creating one.
 */
export async function getActiveConversation(params: {
  userId: number;
  tradeId: number;
}): Promise<{
  conversation: Conversation;
  messages: AgentMessage[];
} | null> {
  const conversation = await getConversationByTrade(
    params.userId,
    params.tradeId
  );
  if (!conversation) return null;
  return {
    conversation,
    messages: await loadThread(conversation.id, params.userId),
  };
}

/**
 * Open a per-trade conversation. The caller must have already verified that
 * `trade` belongs to `userId`. Returns the existing thread on
 * subsequent opens; seeds a fresh thread (system + user context + initial
 * assistant reply) on the first call.
 */
export async function openConversation(params: {
  userId: number;
  trade: Trade;
  providerId?: string;
}): Promise<{ conversationId: number; messages: AgentMessage[] }> {
  const existingConversation = await getConversationByTrade(
    params.userId,
    params.trade.id
  );

  const handle: ResolvedProvider = existingConversation
    ? await resolveProviderById(params.userId, existingConversation.providerId)
    : params.providerId
      ? await resolveProviderById(params.userId, params.providerId)
      : await resolveDefaultProvider(params.userId);

  const conversation = await getOrCreateConversation({
    userId: params.userId,
    tradeId: params.trade.id,
    providerId: handle.provider.id,
    model: handle.provider.defaultModel,
  });

  const existing = await loadThread(conversation.id, params.userId);
  if (existing.length > 0) {
    return { conversationId: conversation.id, messages: existing };
  }

  const { system, user } = await buildInitialMessages({
    userId: params.userId,
    trade: params.trade,
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
