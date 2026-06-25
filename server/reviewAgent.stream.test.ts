import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getAccountById: vi.fn().mockResolvedValue(undefined),
  getAccountSnapshot: vi
    .fn()
    .mockResolvedValue({ currentBalance: "1000", consecutiveLosses: 0 }),
  getTransactionsByUserId: vi.fn().mockResolvedValue([]),
  getOrCreateConversation: vi.fn(),
  appendMessage: vi.fn(),
  listMessages: vi.fn(),
}));

vi.mock("./agents/secrets", () => ({
  getProviderApiKey: vi.fn().mockResolvedValue("test-key"),
  getProviderBaseUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/providers/deepseek", () => ({
  deepseekProvider: {
    id: "deepseek",
    defaultModel: "deepseek-chat",
    chat: vi.fn(),
    chatStream: vi.fn(),
  },
}));

vi.mock("./_core/coinank", () => ({
  fetchCandleWindowAround: vi
    .fn()
    .mockResolvedValue({ candles: [], entryIndex: null, before: 0, after: 0 }),
}));

const { streamUserMessage } = await import("./agents/reviewAgent");
const db = await import("./db");
const { deepseekProvider } = await import("./agents/providers/deepseek");
const { ProviderError } = await import("./agents/providers/types");

const existing = [
  {
    id: 1,
    conversationId: 99,
    role: "system" as const,
    content: JSON.stringify({ text: "system prompt" }),
    createdAt: new Date(1),
  },
  {
    id: 2,
    conversationId: 99,
    role: "user" as const,
    content: JSON.stringify({ text: "trade context" }),
    createdAt: new Date(2),
  },
  {
    id: 3,
    conversationId: 99,
    role: "assistant" as const,
    content: JSON.stringify({ text: "initial reply" }),
    createdAt: new Date(3),
  },
];

async function* asyncFrom<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("streamUserMessage", () => {
  it("persists user turn before streaming, deltas in order, then assistant + done", async () => {
    vi.mocked(db.listMessages).mockResolvedValueOnce(existing);
    vi.mocked(deepseekProvider.chatStream).mockImplementation(() =>
      asyncFrom([{ delta: "hello " }, { delta: "world" }])
    );
    vi.mocked(db.appendMessage)
      .mockResolvedValueOnce({
        id: 10,
        conversationId: 99,
        role: "user",
        content: JSON.stringify({ text: "ask" }),
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 11,
        conversationId: 99,
        role: "assistant",
        content: JSON.stringify({ text: "hello world" }),
        createdAt: new Date(),
      });

    const events = [];
    for await (const event of streamUserMessage({
      userId: 1,
      conversationId: 99,
      userText: "ask",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "hello " },
      { type: "delta", text: "world" },
      { type: "done", messageId: 11 },
    ]);

    // appendMessage called once for user (BEFORE streaming) and once for
    // assistant (after success). Order matters.
    expect(db.appendMessage).toHaveBeenCalledTimes(2);
    expect(db.appendMessage).toHaveBeenNthCalledWith(1, {
      conversationId: 99,
      role: "user",
      content: JSON.stringify({ text: "ask" }),
    });
    expect(db.appendMessage).toHaveBeenNthCalledWith(2, {
      conversationId: 99,
      role: "assistant",
      content: JSON.stringify({ text: "hello world" }),
    });
  });

  it("on mid-stream provider error: persists user turn, NO assistant append, yields error", async () => {
    vi.mocked(db.listMessages).mockResolvedValueOnce(existing);
    vi.mocked(deepseekProvider.chatStream).mockImplementation(
      async function* () {
        yield { delta: "partial" };
        throw new ProviderError("UPSTREAM", "deepseek 流式中断");
      }
    );
    vi.mocked(db.appendMessage).mockResolvedValueOnce({
      id: 10,
      conversationId: 99,
      role: "user",
      content: JSON.stringify({ text: "ask" }),
      createdAt: new Date(),
    });

    const events = [];
    for await (const event of streamUserMessage({
      userId: 1,
      conversationId: 99,
      userText: "ask",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "partial" },
      { type: "error", message: "deepseek 流式中断" },
    ]);
    // User turn persisted, assistant turn NOT persisted.
    expect(db.appendMessage).toHaveBeenCalledTimes(1);
    expect(db.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user" })
    );
  });

  it("throws ProviderError when the conversation is empty / not owned", async () => {
    vi.mocked(db.listMessages).mockResolvedValueOnce([]);

    await expect(async () => {
      for await (const _ of streamUserMessage({
        userId: 1,
        conversationId: 999,
        userText: "ask",
      })) {
        // exhaust
      }
    }).rejects.toMatchObject({
      name: "ProviderError",
      code: "AUTH",
    });

    expect(db.appendMessage).not.toHaveBeenCalled();
    expect(deepseekProvider.chatStream).not.toHaveBeenCalled();
  });

  it("emits error when stream completes with empty content", async () => {
    vi.mocked(db.listMessages).mockResolvedValueOnce(existing);
    vi.mocked(deepseekProvider.chatStream).mockImplementation(() =>
      asyncFrom<{ delta: string }>([])
    );
    vi.mocked(db.appendMessage).mockResolvedValueOnce({
      id: 10,
      conversationId: 99,
      role: "user",
      content: JSON.stringify({ text: "ask" }),
      createdAt: new Date(),
    });

    const events = [];
    for await (const event of streamUserMessage({
      userId: 1,
      conversationId: 99,
      userText: "ask",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "error", message: expect.stringContaining("没有返回") },
    ]);
    // User turn persisted; no assistant append.
    expect(db.appendMessage).toHaveBeenCalledTimes(1);
  });
});
