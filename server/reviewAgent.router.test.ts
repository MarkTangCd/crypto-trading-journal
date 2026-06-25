import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ---- Mocks ---------------------------------------------------------------

vi.mock("./db", () => ({
  // Minimal surface used by the router + orchestrator under test.
  getTransactionById: vi.fn(),
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "main",
    initialBalance: "1000",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getAccountSnapshot: vi
    .fn()
    .mockResolvedValue({ currentBalance: "1100.00", consecutiveLosses: 1 }),
  getTransactionsByUserId: vi.fn().mockResolvedValue([]),
  getOrCreateConversation: vi.fn(),
  appendMessage: vi.fn().mockResolvedValue(undefined),
  listMessages: vi.fn(),
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

const fakeTransaction = {
  id: 42,
  userId: 1,
  accountId: 1,
  status: "closed" as const,
  accountBalance: "1100",
  tradingPair: "BTCUSDT",
  timeFrame: "1H" as const,
  startTime: 1_700_000_000_000,
  endTime: 1_700_003_600_000,
  direction: "long" as const,
  tradingLogic: "breakout retest",
  context: "btc broke prior day high",
  tradeItems: ["entry on 1h close", "stop below pdl"],
  outcome: "win" as const,
  consecutiveLosses: 0,
  riskRewardRatio: "2.1",
  returnAmount: "100",
  entryPrice: "68000",
  exitPrice: "69000",
  plannedStopLossPrice: "67500",
  plannedTakeProfitPrice: "69500",
  plannedRiskRewardRatio: "3",
  positionSizeUsdt: "500",
  tvUrl: null,
  marketCycle: null,
  transactionType: null,
  reviewFeedback: null,
  reviewChartUrl: null,
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
  vi.mocked(deepseekProvider.chat).mockResolvedValue({
    role: "assistant",
    content: "initial reply",
  });
});

// ---- Tests ---------------------------------------------------------------

describe("reviewAgent router", () => {
  describe("open", () => {
    it("returns FORBIDDEN when the trade does not belong to the user", async () => {
      vi.mocked(db.getTransactionById).mockResolvedValue(undefined);
      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ transactionId: 999 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("seeds a fresh conversation with system + user + assistant turns", async () => {
      vi.mocked(db.getTransactionById).mockResolvedValue(fakeTransaction);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        transactionId: 42,
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
      const result = await caller.reviewAgent.open({ transactionId: 42 });

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
      vi.mocked(db.getTransactionById).mockResolvedValue(fakeTransaction);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        transactionId: 42,
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
      await caller.reviewAgent.open({ transactionId: 42 });

      expect(deepseekProvider.chat).not.toHaveBeenCalled();
      expect(db.appendMessage).not.toHaveBeenCalled();
    });

    it("maps a provider AUTH failure to BAD_REQUEST without leaking upstream", async () => {
      vi.mocked(db.getTransactionById).mockResolvedValue(fakeTransaction);
      vi.mocked(secrets.getProviderApiKey).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(makeCtx());

      await expect(
        caller.reviewAgent.open({ transactionId: 42 })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("api key"),
      });
    });

    it("maps a provider UPSTREAM failure to INTERNAL_SERVER_ERROR", async () => {
      vi.mocked(db.getTransactionById).mockResolvedValue(fakeTransaction);
      vi.mocked(db.getOrCreateConversation).mockResolvedValue({
        id: 99,
        userId: 1,
        transactionId: 42,
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
        caller.reviewAgent.open({ transactionId: 42 })
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("deepseek"),
      });
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
