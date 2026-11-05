import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock the database functions
vi.mock("./db", () => ({
  getAccountSnapshot: vi
    .fn()
    .mockResolvedValue({ currentBalance: "10000", consecutiveLosses: 0 }),
  runInSqliteTransaction: vi
    .fn()
    .mockImplementation(async (op: (db: unknown) => Promise<unknown>) =>
      op(undefined)
    ),
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Account",
    notes: "Test notes",
    initialBalance: "1000",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getTransactionById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    accountId: 1,
    tradingPair: "BTCUSDT",
    timeFrame: "4H",
    startTime: Date.now(),
    endTime: Date.now() + 3600000,
    direction: "long",
    tradingLogic: "Test trade",
    context: "Test trade",
    tradeItems: [],
    marketCycle: "Upward Trend",
    transactionType: "Trend",
    outcome: "win",
    status: "open",
    consecutiveLosses: 0,
    riskRewardRatio: "2.5",
    returnAmount: "100",
    accountBalance: "10100",
    tvUrl: null,
    reviewFeedback: null,
    reviewChartUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getTransactionsByUserId: vi.fn().mockResolvedValue([]),
  updateTransaction: vi.fn().mockResolvedValue({
    id: 1,
    status: "reviewed",
    reviewFeedback: "Good trade",
  }),
  createTransactionWithElements: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  deleteTransactionWithElements: vi.fn().mockResolvedValue(undefined),
  getUniqueTradingPairs: vi.fn().mockResolvedValue(["BTCUSDT", "ETHUSDT"]),
}));

function createAuthContext(): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

describe("transaction procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("transaction.create", () => {
    it("creates a new transaction with marketCycle and transactionType", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.create({
        accountId: 1,
        tradingPair: "BTCUSDT",
        timeFrame: "4H",
        startTime: Date.now(),
        direction: "long",
        context: "Test trade logic",
        tradeItems: ["breakout", "retest"],
        marketCycle: "Upward Trend",
        transactionType: "Trend",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        plannedStopLossPrice: "95",
        plannedTakeProfitPrice: "110",
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe("open");
      expect(db.createTransactionWithElements).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "Test trade logic",
          tradeItems: ["breakout", "retest"],
          tradingLogic: "Test trade logic",
        })
      );
    });

    it("writes new transaction to the selected account when accountId differs from userId", async () => {
      // User 1 has switched to account 2; create must persist accountId=2
      // and never silently fall back to userId.
      vi.mocked(db.getAccountById).mockResolvedValueOnce({
        id: 2,
        userId: 1,
        name: "Swing Account",
        notes: null,
        initialBalance: "5000",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.transaction.create({
        accountId: 2,
        tradingPair: "BTCUSDT",
        timeFrame: "4H",
        startTime: Date.now(),
        direction: "long",
        context: "Switched account regression",
        tradeItems: [],
        marketCycle: "Upward Trend",
        transactionType: "Trend",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        plannedStopLossPrice: "95",
        plannedTakeProfitPrice: "110",
      });

      expect(db.getAccountById).toHaveBeenCalledWith(2, 1);
      expect(db.createTransactionWithElements).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          accountId: 2,
        })
      );
    });

    it("rejects create when account does not belong to the caller", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 999,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          context: "Should be rejected",
          tradeItems: [],
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        })
      ).rejects.toThrow(/Account not found/);

      expect(db.createTransactionWithElements).not.toHaveBeenCalled();
    });

    it("rejects create without marketCycle", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          context: "Test trade logic",
          tradeItems: [],
          transactionType: "Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        } as never)
      ).rejects.toThrow();
    });

    it("rejects create without transactionType", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          context: "Test trade logic",
          tradeItems: [],
          marketCycle: "Upward Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        } as never)
      ).rejects.toThrow();
    });

    it("rejects create without context", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          tradeItems: [],
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        } as never)
      ).rejects.toThrow();
    });

    it("rejects create when tradeItems is not an array", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          context: "Test trade logic",
          tradeItems: "breakout",
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        } as never)
      ).rejects.toThrow();
    });

    it("rejects create payloads that still send tradingLogic", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.transaction.create({
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          direction: "long",
          context: "Test trade logic",
          tradeItems: [],
          tradingLogic: "Legacy field",
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          entryPrice: "100",
          positionSizeUsdt: "1000",
          plannedStopLossPrice: "95",
          plannedTakeProfitPrice: "110",
        } as never)
      ).rejects.toThrow(/Unrecognized key/);
    });
  });

  describe("transaction.get", () => {
    it("returns a transaction by id", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.get({ id: 1, accountId: 1 });

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
      expect(result?.tradingPair).toBe("BTCUSDT");
    });
  });

  describe("transaction.list", () => {
    it("lists transactions with default parameters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.list({ accountId: 1 });

      expect(Array.isArray(result)).toBe(true);
    });

    it("lists transactions with filters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.list({
        accountId: 1,
        outcome: "win",
        direction: "long",
        sortBy: "returnAmount",
        sortOrder: "desc",
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("filters by marketCycle correctly", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      vi.mocked(db.getTransactionsByUserId).mockResolvedValueOnce([
        {
          id: 1,
          userId: 1,
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          endTime: null,
          direction: "long",
          tradingLogic: "Test trade",
          context: "Test trade",
          tradeItems: [],
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          outcome: null,
          status: "open",
          consecutiveLosses: 0,
          riskRewardRatio: null,
          returnAmount: null,
          accountBalance: null,
          tvUrl: null,
          reviewFeedback: null,
          reviewChartUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.transaction.list({
        accountId: 1,
        marketCycle: "Upward Trend",
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].marketCycle).toBe("Upward Trend");
    });

    it("filters by transactionType correctly", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      vi.mocked(db.getTransactionsByUserId).mockResolvedValueOnce([
        {
          id: 1,
          userId: 1,
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          endTime: null,
          direction: "long",
          tradingLogic: "Test trade",
          context: "Test trade",
          tradeItems: [],
          marketCycle: "Upward Trend",
          transactionType: "Reversal",
          outcome: null,
          status: "open",
          consecutiveLosses: 0,
          riskRewardRatio: null,
          returnAmount: null,
          accountBalance: null,
          tvUrl: null,
          reviewFeedback: null,
          reviewChartUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.transaction.list({
        accountId: 1,
        transactionType: "Reversal",
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].transactionType).toBe("Reversal");
    });

    it("returns all rows including legacy nulls with no filters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      vi.mocked(db.getTransactionsByUserId).mockResolvedValueOnce([
        {
          id: 1,
          userId: 1,
          accountId: 1,
          tradingPair: "BTCUSDT",
          timeFrame: "4H",
          startTime: Date.now(),
          endTime: null,
          direction: "long",
          tradingLogic: "Test trade",
          context: "Test trade",
          tradeItems: [],
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          outcome: null,
          status: "open",
          consecutiveLosses: 0,
          riskRewardRatio: null,
          returnAmount: null,
          accountBalance: null,
          tvUrl: null,
          reviewFeedback: null,
          reviewChartUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          userId: 1,
          accountId: 1,
          tradingPair: "ETHUSDT",
          timeFrame: "1H",
          startTime: Date.now(),
          endTime: null,
          direction: "short",
          tradingLogic: "Legacy trade",
          context: "Legacy trade",
          tradeItems: [],
          marketCycle: null,
          transactionType: null,
          outcome: null,
          status: "open",
          consecutiveLosses: 0,
          riskRewardRatio: null,
          returnAmount: null,
          accountBalance: null,
          tvUrl: null,
          reviewFeedback: null,
          reviewChartUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.transaction.list({ accountId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].marketCycle).toBe("Upward Trend");
      expect(result[1].marketCycle).toBeNull();
    });
  });

  describe("transaction.update", () => {
    it("updates transaction review", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      vi.mocked(db.getTransactionById).mockResolvedValueOnce({
        id: 1,
        userId: 1,
        accountId: 1,
        tradingPair: "BTCUSDT",
        timeFrame: "4H",
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        direction: "long",
        tradingLogic: "Test trade",
        context: "Test trade",
        tradeItems: [],
        marketCycle: "Upward Trend",
        transactionType: "Trend",
        outcome: "win",
        status: "closed",
        consecutiveLosses: 0,
        riskRewardRatio: "2.5",
        returnAmount: "100",
        accountBalance: "10100",
        tvUrl: null,
        reviewFeedback: null,
        reviewChartUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.transaction.update({
        id: 1,
        reviewFeedback: "Good trade, followed the plan",
      });

      expect(result).toBeDefined();
    });
  });

  describe("transaction.delete", () => {
    it("deletes a transaction", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.delete({ id: 1 });

      expect(result).toEqual({ success: true });
    });
  });

  describe("transaction.getFormDefaults", () => {
    it("returns form defaults with current balance and consecutive losses", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.getFormDefaults({ accountId: 1 });

      expect(result).toBeDefined();
      expect(result.currentBalance).toBe("10000");
      expect(result.consecutiveLosses).toBe(0);
      expect(result.initialBalance).toBe("1000");
    });
  });

  describe("transaction.getTradingPairs", () => {
    it("returns unique trading pairs", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.getTradingPairs({ accountId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain("BTCUSDT");
      expect(result).toContain("ETHUSDT");
    });
  });
});
