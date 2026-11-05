import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ---- Mocks ---------------------------------------------------------------

vi.mock("./db", () => ({
  // Minimal surface used by the router + orchestrator under test.
  getTradeById: vi.fn(),
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "main",
    balanceUsdt: "1100",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getTradeStats: vi.fn().mockResolvedValue({ losingStreak: 1 }),
  listTrades: vi.fn().mockResolvedValue([]),
  getOrCreateConversation: vi.fn(),
  getConversationById: vi.fn(),
  getConversationByTrade: vi.fn().mockResolvedValue(undefined),
  appendMessage: vi.fn().mockResolvedValue(undefined),
  listMessages: vi.fn(),
  getAgentSettings: vi.fn().mockResolvedValue(undefined),
  upsertAgentSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/secrets", () => ({
  getProviderApiKey: vi.fn().mockResolvedValue("test-key"),
  getProviderBaseUrl: vi.fn().mockResolvedValue(undefined),
  getProviderConfig: vi.fn().mockResolvedValue(undefined),
  setProviderConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/providers/deepseek", async () => {
  const { ProviderError } = await import("./agents/providers/types");
  return {
    deepseekProvider: {
      id: "deepseek",
      defaultModel: "deepseek-chat",
      chat: vi
        .fn()
        .mockResolvedValue({ role: "assistant", content: "initial reply" }),
    },
    __ProviderError: ProviderError,
  };
});

vi.mock("./agents/providers/kimi", () => ({
  kimiProvider: {
    id: "kimi",
    defaultModel: "moonshot-v1-128k",
    chat: vi
      .fn()
      .mockResolvedValue({ role: "assistant", content: "initial kimi reply" }),
    chatStream: vi.fn(),
  },
}));

vi.mock("./agents/providers/glm", () => ({
  glmProvider: {
    id: "glm",
    defaultModel: "glm-4.5",
    chat: vi.fn(),
    chatStream: vi.fn(),
  },
}));

vi.mock("./agents/providers/openai", () => ({
  openaiProvider: {
    id: "openai",
    defaultModel: "gpt-5",
    chat: vi.fn(),
    chatStream: vi.fn(),
  },
}));

vi.mock("./agents/providers/gemini", () => ({
  geminiProvider: {
    id: "gemini",
    defaultModel: "gemini-2.5-flash",
    chat: vi.fn(),
    chatStream: vi.fn(),
  },
}));

// Stub the K-line window so router tests don't hit the real CoinAnk endpoint
// when buildInitialMessages runs.
vi.mock("./_core/coinank", () => ({
  fetchCandles: vi.fn().mockResolvedValue([]),
  fetchCandleWindowAround: vi
    .fn()
    .mockResolvedValue({ candles: [], entryIndex: null, before: 0, after: 0 }),
}));

// Import after mocks so the router resolves them.
const { appRouter } = await import("./routers");
const db = await import("./db");
const { deepseekProvider } = await import("./agents/providers/deepseek");
const { kimiProvider } = await import("./agents/providers/kimi");
const secrets = await import("./agents/secrets");
const { ProviderError } = await import("./agents/providers/types");

// ---- Helpers -------------------------------------------------------------

const fakeUser = {
  id: 1,
  openId: "anon",
  email: null,
  name: "anon",
  loginMethod: "anonymous",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function makeCtx(): TrpcContext {
  return {
    user: fakeUser,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const fakeTrade = {
  id: 42,
  userId: 1,
  accountId: 1,
  tradeKey: "BTCUSDT|BOTH#1",
  exchange: "binance",
  exchangeSymbol: "BTCUSDT",
  symbol: "BTCUSDT",
  positionSide: "BOTH",
  side: "long" as const,
  status: "closed" as const,
  openTime: 1_700_000_000_000,
  openTimeApprox: false,
  closeTime: 1_700_003_600_000,
  entryPrice: "68000",
  exitPrice: "69000",
  quantity: "0.01",
  positionSizeUsdt: "680",
  feeUsd: "0.68",
  realizedPnlUsd: "9.32",
  stopLossPrice: "67500",
  takeProfitPrice: "69500",
  syncedAt: 1_700_003_700_000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sysRow = {
  id: 1,
  conversationId: 99,
  role: "system" as const,
  content: JSON.stringify({ text: "system prompt" }),
  createdAt: new Date(1),
};
const userCtxRow = {
  id: 2,
  conversationId: 99,
  role: "user" as const,
  content: JSON.stringify({ text: "trade context" }),
  createdAt: new Date(2),
};
const assistantReply = {
  id: 3,
  conversationId: 99,
  role: "assistant" as const,
  content: JSON.stringify({ text: "initial reply" }),
  createdAt: new Date(3),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(secrets.getProviderApiKey).mockResolvedValue("test-key");
  vi.mocked(secrets.getProviderBaseUrl).mockResolvedValue(undefined);
  vi.mocked(db.getConversationByTrade).mockResolvedValue(undefined);
  // Default: send/stream paths look up the conversation row and find a
  // deepseek-locked one. Individual tests override when they need otherwise.
  vi.mocked(db.getConversationById).mockResolvedValue({
    id: 99,
    userId: 1,
    tradeId: 42,
    providerId: "deepseek",
    model: "deepseek-chat",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  vi.mocked(deepseekProvider.chat).mockResolvedValue({
    role: "assistant",
    content: "initial reply",
  });
  vi.mocked(kimiProvider.chat).mockResolvedValue({
    role: "assistant",
    content: "initial kimi reply",
  });
});

// ---- Tests ---------------------------------------------------------------

describe("reviewAgent router", () => {
  describe("open", () => {
    it("returns NOT_FOUND when the trade is missing or not the user's", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(undefined);
      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ tradeId: 999 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.getOrCreateConversation).not.toHaveBeenCalled();
    });

    it("keys the new conversation by tradeId", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.listMessages).mockResolvedValue([
        sysRow,
        userCtxRow,
        assistantReply,
      ]);

      const caller = appRouter.createCaller(makeCtx());
      await caller.reviewAgent.open({ tradeId: 42 });

      expect(db.getTradeById).toHaveBeenCalledWith(42, 1);
      expect(db.getOrCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, tradeId: 42 })
      );
    });

    it("seeds a fresh conversation with system + user + assistant turns", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // First load: empty. After seeding: 3 messages.
      vi.mocked(db.listMessages)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sysRow, userCtxRow, assistantReply]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.reviewAgent.open({ tradeId: 42 });

      expect(result.conversationId).toBe(99);
      expect(result.messages.map(m => m.role)).toEqual([
        "system",
        "user",
        "assistant",
      ]);
      expect(deepseekProvider.chat).toHaveBeenCalledOnce();
      expect(db.appendMessage).toHaveBeenCalledTimes(3); // sys + user + assistant
    });

    it("is idempotent: existing thread returns without calling the provider again", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.listMessages).mockResolvedValue([
        sysRow,
        userCtxRow,
        assistantReply,
      ]);

      const caller = appRouter.createCaller(makeCtx());
      await caller.reviewAgent.open({ tradeId: 42 });

      expect(deepseekProvider.chat).not.toHaveBeenCalled();
      expect(db.appendMessage).not.toHaveBeenCalled();
    });

    it("maps a provider AUTH failure to BAD_REQUEST without leaking upstream", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(secrets.getProviderApiKey).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ tradeId: 42 })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("api key"),
      });
    });

    it("respects an explicit providerId override on first open", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getConversationByTrade).mockResolvedValue(undefined);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "kimi",
        model: "moonshot-v1-128k",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.listMessages)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sysRow, userCtxRow, assistantReply]);

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.reviewAgent.open({
        tradeId: 42,
        providerId: "kimi",
      });

      expect(result.conversationId).toBe(99);
      // kimi handled the seed reply; deepseek must NOT have been called.
      expect(kimiProvider.chat).toHaveBeenCalledOnce();
      expect(deepseekProvider.chat).not.toHaveBeenCalled();
      // getOrCreateConversation persisted kimi as the conversation provider.
      expect(db.getOrCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "kimi",
          model: "moonshot-v1-128k",
        })
      );
    });

    it("returns BAD_REQUEST mentioning the provider id when its key is missing", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getConversationByTrade).mockResolvedValue(undefined);
      vi.mocked(secrets.getProviderApiKey).mockImplementation(
        async (_userId, providerId) =>
          providerId === "kimi" ? undefined : "test-key"
      );

      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ tradeId: 42, providerId: "kimi" })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("kimi"),
      });
    });

    it("locks to the existing conversation's providerId and ignores the override", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      // Existing conversation was opened on deepseek; caller now passes kimi.
      vi.mocked(db.getConversationByTrade).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.listMessages).mockResolvedValue([
        sysRow,
        userCtxRow,
        assistantReply,
      ]);

      const caller = appRouter.createCaller(makeCtx());
      await caller.reviewAgent.open({
        tradeId: 42,
        providerId: "kimi",
      });

      // Neither provider was called (existing thread short-circuit), but the
      // important check is that the override didn't flip the lock to kimi.
      expect(kimiProvider.chat).not.toHaveBeenCalled();
      expect(deepseekProvider.chat).not.toHaveBeenCalled();
      // getOrCreateConversation, when called, was called with deepseek — not
      // kimi from the override.
      const calls = vi.mocked(db.getOrCreateConversation).mock.calls;
      for (const call of calls) {
        expect(call[0].providerId).toBe("deepseek");
      }
    });

    it("maps a provider UPSTREAM failure to INTERNAL_SERVER_ERROR", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        tradeId: 42,
        providerId: "deepseek",
        model: "deepseek-chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.listMessages).mockResolvedValueOnce([]);
      vi.mocked(deepseekProvider.chat).mockRejectedValueOnce(
        new ProviderError("UPSTREAM", "deepseek 接口异常（状态码 500）。")
      );

      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ tradeId: 42 })
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("deepseek"),
      });
    });
  });

  describe("getActive", () => {
    it("returns NOT_FOUND when the trade is missing or not the user's", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(undefined);
      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.getActive({ tradeId: 999 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns null when the trade has no conversation yet", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(fakeTrade);
      const caller = appRouter.createCaller(makeCtx());

      expect(await caller.reviewAgent.getActive({ tradeId: 42 })).toBeNull();
      expect(db.getConversationByTrade).toHaveBeenCalledWith(1, 42);
    });
  });

  describe("send", () => {
    it("appends user + assistant turns and returns the full thread", async () => {
      vi.mocked(db.listMessages)
        .mockResolvedValueOnce([sysRow, userCtxRow, assistantReply]) // existing
        .mockResolvedValueOnce([
          sysRow,
          userCtxRow,
          assistantReply,
          {
            ...assistantReply,
            id: 4,
            role: "user",
            content: JSON.stringify({ text: "ask" }),
          },
          {
            ...assistantReply,
            id: 5,
            content: JSON.stringify({ text: "reply" }),
          },
        ]); // final read

      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.reviewAgent.send({
        conversationId: 99,
        userText: "ask",
      });

      expect(result.messages.map(m => m.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect(db.appendMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(deepseekProvider.chat).toHaveBeenCalledOnce();
    });

    it("throws when conversation is empty or stranger userId", async () => {
      vi.mocked(db.listMessages).mockResolvedValueOnce([]);

      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.send({ conversationId: 999, userText: "hi" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("list", () => {
    it("returns the conversation's messages, userId-scoped", async () => {
      vi.mocked(db.listMessages).mockResolvedValueOnce([
        sysRow,
        assistantReply,
      ]);

      const caller = appRouter.createCaller(makeCtx());
      const messages = await caller.reviewAgent.list({ conversationId: 99 });

      expect(messages.map(m => m.role)).toEqual(["system", "assistant"]);
      expect(db.listMessages).toHaveBeenCalledWith({
        conversationId: 99,
        userId: 1,
      });
    });
  });
});
