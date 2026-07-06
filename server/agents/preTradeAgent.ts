import {
  appendMessage,
  createPreTrade,
  getConversationByPreTrade,
  getOrCreateConversationForPreTrade,
  getPreTradeById,
} from "../db";
import type { Conversation, PreTrade } from "../../drizzle/schema";
import { buildInitialMessages } from "./preTradeContextBuilder";
import {
  type AgentMessage,
  type ResolvedProvider,
  loadThread,
  resolveDefaultProvider,
  resolveProviderById,
  serialize,
} from "./agentCore";

// Re-export shared conversation-turn primitives so consumers can import
// pre-trade turn machinery from one place. Behavior is identical to review;
// only the initial-message seeding differs.
export type { AgentMessage as PreTradeMessage, StreamEvent } from "./agentCore";
export {
  listAgentMessages as listPreTradeMessages,
  sendUserMessage,
  streamUserMessage,
} from "./agentCore";

export interface CreatePreTradeInput {
  userId: number;
  tradingPair: string;
  direction: "long" | "short" | null;
  primaryTimeFrame: string;
  primaryCandleCount: number;
  contextTimeframes: Array<{ tf: string; candleCount: number }>;
  anchorMs: number | null;
  idea: string;
  providerId?: string;
}

/**
 * Look up an existing pre-trade conversation without creating one. Returns
 * null when the pre-trade row exists but no conversation has been opened yet
 * (should not happen in the current flow — sessions and conversations are
 * created atomically — but the shape mirrors reviewAgent for symmetry).
 */
export async function getActiveConversation(params: {
  userId: number;
  preTradeId: number;
}): Promise<{
  preTrade: PreTrade;
  conversation: Conversation;
  messages: AgentMessage[];
} | null> {
  const preTrade = await getPreTradeById(params.preTradeId, params.userId);
  if (!preTrade) return null;
  const conversation = await getConversationByPreTrade(
    params.userId,
    params.preTradeId
  );
  if (!conversation) return null;
  return {
    preTrade,
    conversation,
    messages: await loadThread(conversation.id, params.userId),
  };
}

/**
 * Create a pre-trade session AND open its conversation atomically from the
 * caller's perspective: inserts the pre_trades row, resolves the provider,
 * creates the conversation, seeds system + user context + first assistant
 * reply. The caller sees a fully-formed thread on the very first response.
 */
export async function createSession(input: CreatePreTradeInput): Promise<{
  preTradeId: number;
  conversationId: number;
  messages: AgentMessage[];
}> {
  const handle: ResolvedProvider = input.providerId
    ? await resolveProviderById(input.userId, input.providerId)
    : await resolveDefaultProvider(input.userId);

  const preTrade = await createPreTrade({
    userId: input.userId,
    tradingPair: input.tradingPair,
    direction: input.direction,
    primaryTimeFrame: input.primaryTimeFrame,
    primaryCandleCount: input.primaryCandleCount,
    contextTimeframes: input.contextTimeframes,
    anchorMs: input.anchorMs,
    idea: input.idea,
  });

  const conversation = await getOrCreateConversationForPreTrade({
    userId: input.userId,
    preTradeId: preTrade.id,
    providerId: handle.provider.id,
    model: handle.provider.defaultModel,
  });

  const { system, user } = await buildInitialMessages({ preTrade });

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
    preTradeId: preTrade.id,
    conversationId: conversation.id,
    messages: await loadThread(conversation.id, input.userId),
  };
}
