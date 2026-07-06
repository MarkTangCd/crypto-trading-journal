import {
  appendMessage,
  getAgentSettings,
  getConversationById,
  listMessages,
} from "../db";
import type { Conversation, Message } from "../../drizzle/schema";
import { getProvider } from "./providers/registry";
import {
  type ChatMessage,
  type ChatProvider,
  ProviderError,
  type ToolCall,
} from "./providers/types";
import { getProviderApiKey, getProviderBaseUrl } from "./secrets";
import { runTools } from "./runTools";
// Side-effect import: triggers boot-time skill registration so every agent can
// surface tools to the model on first request.
import "./skills";

export const FALLBACK_PROVIDER_ID = "deepseek";

/**
 * Unified conversation-turn shape shared by review & pre-trade agents. The
 * frontend consumes the same tRPC-inferred type via both routers.
 */
export interface AgentMessage {
  id: number;
  role: Message["role"];
  text: string;
  createdAt: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ResolvedProvider {
  provider: ChatProvider;
  apiKey: string;
  baseUrl?: string;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      argsSummary: string;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
    }
  | { type: "done"; messageId: number }
  | { type: "error"; message: string };

// ============ provider resolution ============

export async function resolveProviderById(
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

export async function resolveDefaultProvider(
  userId: number
): Promise<ResolvedProvider> {
  const settings = await getAgentSettings(userId);
  const requestedId = settings?.defaultProvider ?? FALLBACK_PROVIDER_ID;
  try {
    return await resolveProviderById(userId, requestedId);
  } catch (error) {
    if (
      error instanceof ProviderError &&
      error.code === "AUTH" &&
      requestedId !== FALLBACK_PROVIDER_ID &&
      !getProvider(requestedId)
    ) {
      console.warn(
        `[agentCore] unknown provider "${requestedId}" in agent_settings; falling back to ${FALLBACK_PROVIDER_ID}.`
      );
      return resolveProviderById(userId, FALLBACK_PROVIDER_ID);
    }
    throw error;
  }
}

export async function resolveConversationProvider(
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

// ============ message (de)serialization ============

export function serialize(text: string): string {
  return JSON.stringify({ text });
}

export function toAgentMessage(message: Message): AgentMessage {
  let text = message.content;
  try {
    const parsed = JSON.parse(message.content) as { text?: string };
    if (typeof parsed.text === "string") text = parsed.text;
  } catch {
    // raw string fallback
  }

  let toolCalls: ToolCall[] | undefined;
  if (message.toolCalls) {
    try {
      const parsed = JSON.parse(message.toolCalls) as unknown;
      if (Array.isArray(parsed)) toolCalls = parsed as ToolCall[];
    } catch {
      // unparseable — drop silently; the renderer hides empty tool rows.
    }
  }

  return {
    id: message.id,
    role: message.role,
    text,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.getTime()
        : Number(message.createdAt),
    ...(toolCalls ? { toolCalls } : {}),
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
  };
}

export function toChatHistory(rows: AgentMessage[]): ChatMessage[] {
  // Recover tool names from prior assistant tool_calls so an openai-compatible
  // `tool` message can be replayed with its `name` field intact.
  const idToName = new Map<string, string>();
  for (const row of rows) {
    if (row.toolCalls?.length) {
      for (const call of row.toolCalls) idToName.set(call.id, call.name);
    }
  }
  return rows.map(row => {
    const message: ChatMessage = { role: row.role, content: row.text };
    if (row.toolCalls?.length) message.toolCalls = row.toolCalls;
    if (row.toolCallId) {
      message.toolCallId = row.toolCallId;
      const name = idToName.get(row.toolCallId);
      if (name) message.name = name;
    }
    return message;
  });
}

export async function loadThread(
  conversationId: number,
  userId: number
): Promise<AgentMessage[]> {
  const rows = await listMessages({ conversationId, userId });
  return rows.map(toAgentMessage);
}

// ============ conversation turns (generic — driven by conversationId) ============

export async function listAgentMessages(params: {
  userId: number;
  conversationId: number;
}): Promise<AgentMessage[]> {
  return loadThread(params.conversationId, params.userId);
}

export async function sendUserMessage(params: {
  userId: number;
  conversationId: number;
  userText: string;
}): Promise<{ messages: AgentMessage[] }> {
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

  // Persist the user turn BEFORE opening the upstream stream so a mid-stream
  // client disconnect still preserves what the user typed.
  await appendMessage({
    conversationId: params.conversationId,
    role: "user",
    content: serialize(params.userText),
  });

  const history: ChatMessage[] = [
    ...toChatHistory(existing),
    { role: "user", content: params.userText },
  ];

  const settings = await getAgentSettings(params.userId);
  const enabledSkillIds = settings?.enabledSkillIds ?? [];

  const generator = runTools({
    provider: handle.provider,
    model: handle.provider.defaultModel,
    apiKey: handle.apiKey,
    baseUrl: handle.baseUrl,
    messages: history,
    signal: params.signal,
    userId: params.userId,
    enabledSkillIds,
  });

  let appended: ChatMessage[] = [];
  try {
    while (true) {
      const { value, done } = await generator.next();
      if (done) {
        appended = value.appended;
        break;
      }
      yield value;
    }
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? error.message
        : "助手回复失败，请稍后再试。";
    yield { type: "error", message };
    return;
  }

  const finalAssistantTurn = [...appended]
    .reverse()
    .find(message => message.role === "assistant" && !message.toolCalls);
  if (!finalAssistantTurn || finalAssistantTurn.content.length === 0) {
    yield { type: "error", message: "助手没有返回任何内容，请稍后再试。" };
    return;
  }

  let finalAssistantId: number | null = null;
  for (const message of appended) {
    const payload: Parameters<typeof appendMessage>[0] = {
      conversationId: params.conversationId,
      role: message.role,
      content: serialize(message.content),
    };
    if (message.toolCalls?.length) {
      payload.toolCalls = JSON.stringify(message.toolCalls);
    }
    if (message.toolCallId) payload.toolCallId = message.toolCallId;
    const persisted = await appendMessage(payload);
    if (message === finalAssistantTurn) {
      finalAssistantId = persisted.id;
    }
  }

  if (finalAssistantId === null) {
    throw new Error("finalAssistantId missing despite assistant turn present");
  }

  yield { type: "done", messageId: finalAssistantId };
}
