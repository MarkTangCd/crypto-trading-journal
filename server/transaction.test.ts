import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock the database functions
vi.mock("./db", () => ({
  getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "10000" }),
  getCurrentBalance: vi.fn().mockResolvedValue("10000"),
  getConsecutiveLosses: vi.fn().mockResolvedValue(0),
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Account",
    notes: "Test notes",
    initialBalance: "1000",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createTransaction: vi.fn().mockImplementation(data => ({
    id: 1,
    status: "open",
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
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
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
  createTransactionWithElements: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  deleteTransactionWithElements: vi.fn().mockResolvedValue(undefined),
  getUniqueTradingPairs: vi.fn().mockResolvedValue(["BTCUSDT", "ETHUSDT"]),
  getStatistics: vi.fn().mockResolvedValue({
    winCount: 5,
    lossCount: 3,
    breakevenCount: 1,
    winRate: 55.56,
    totalTrades: 9,
    avgProfit: 150,
    avgLoss: 75,
    totalProfit: 750,
    totalReward: 525,
    losingStreak: 2,
    originalBalance: 10000,
    latestBalance: 10525,
  }),
  updateUserInitialBalance: vi.fn().mockResolvedValue(undefined),
  // Trading element functions
  createTradingElement: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTradingElementsByUserId: vi.fn().mockResolvedValue([]),
  getTradingElementById: vi
    .fn()
    .mockResolvedValue({ id: 1, userId: 1, name: "Gap", description: null }),
  updateTradingElement: vi
    .fn()
    .mockResolvedValue({ id: 1, name: "Gap Updated" }),
  deleteTradingElement: vi.fn().mockResolvedValue(undefined),
  // Trading system functions
  createTradingSystem: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    isActive: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTradingSystemsByUserId: vi.fn().mockResolvedValue([]),
  getTradingSystemById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test System",
    notes: null,
    isActive: 0,
  }),
  updateTradingSystem: vi
    .fn()
    .mockResolvedValue({ id: 1, name: "Updated System" }),
  deleteTradingSystem: vi.fn().mockResolvedValue(undefined),
  activateTradingSystem: vi.fn().mockResolvedValue(undefined),
  deactivateTradingSystem: vi.fn().mockResolvedValue(undefined),
  getActiveTradingSystem: vi.fn().mockResolvedValue(null),
  addElementsToSystem: vi.fn().mockResolvedValue(undefined),
  removeElementsFromSystem: vi.fn().mockResolvedValue(undefined),
  getSystemElements: vi.fn().mockResolvedValue([]),
  // Account functions
  createAccount: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getAccountsByUserId: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      name: "Test Account",
      notes: "Test notes",
      initialBalance: "1000",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  updateAccount: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Updated Account",
    notes: "Updated notes",
    initialBalance: "2000",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  deleteAccountWithTransactions: vi.fn().mockResolvedValue(undefined),
  getAccountCount: vi.fn().mockResolvedValue(2),
  // Transaction element functions
  addElementsToTransaction: vi.fn().mockResolvedValue(undefined),
  removeElementsFromTransaction: vi.fn().mockResolvedValue(undefined),
  getTransactionElements: vi.fn().mockResolvedValue([]),
  replaceTransactionElements: vi.fn().mockResolvedValue(undefined),
  calculateConfidenceLevel: vi.fn().mockResolvedValue(4),
  // Close trade function
  closeTrade: vi.fn().mockImplementation(async (_txId, _userId, data) => ({
    id: 1,
    ...data,
    status: "closed",
    updatedAt: new Date(),
  })),
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
      initialBalance: "10000",
      activeTradingSystemId: null,
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
        tradingLogic: "Test trade logic",
        marketCycle: "Upward Trend",
        transactionType: "Trend",
        tradingSystemId: 1,
        selectedElementIds: [1, 2],
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe("open");
      expect(db.createTransactionWithElements).toHaveBeenCalled();
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
        tradingLogic: "Switched account regression",
        marketCycle: "Upward Trend",
        transactionType: "Trend",
        selectedElementIds: [],
      });

      expect(db.getAccountById).toHaveBeenCalledWith(2, 1);
      expect(db.createTransactionWithElements).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          accountId: 2,
        }),
        []
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
          tradingLogic: "Should be rejected",
          marketCycle: "Upward Trend",
          transactionType: "Trend",
          selectedElementIds: [],
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
          tradingLogic: "Test trade logic",
          transactionType: "Trend",
          tradingSystemId: 1,
          selectedElementIds: [],
        } as any)
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
          tradingLogic: "Test trade logic",
          marketCycle: "Upward Trend",
          tradingSystemId: 1,
          selectedElementIds: [],
        } as any)
      ).rejects.toThrow();
    });
  });

  describe("transaction.get", () => {
    it("returns a transaction by id", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.get({ id: 1 });

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
          tradingSystemId: null,
          confidenceLevel: null,
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
          tradingSystemId: null,
          confidenceLevel: null,
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
          tradingSystemId: null,
          confidenceLevel: null,
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
          tradingSystemId: null,
          confidenceLevel: null,
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
        tradingSystemId: null,
        confidenceLevel: null,
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

describe("stats procedures", () => {
  it("returns trading statistics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stats.get({ accountId: 1 });

    expect(result).toBeDefined();
    expect(result.winCount).toBe(5);
    expect(result.lossCount).toBe(3);
    expect(result.breakevenCount).toBe(1);
    expect(result.winRate).toBe(55.56);
    expect(result.totalTrades).toBe(9);
    expect(result.avgProfit).toBe(150);
    expect(result.avgLoss).toBe(75);
    expect(result.totalProfit).toBe(750);
    expect(result.totalReward).toBe(525);
    expect(result.losingStreak).toBe(2);
    expect(result.originalBalance).toBe(10000);
    expect(result.latestBalance).toBe(10525);
  });
});

describe("user procedures", () => {
  it("gets user settings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.user.getSettings();

    expect(result).toBeDefined();
    expect(result.activeTradingSystemId).toBeNull();
  });
});

describe("account procedures", () => {
  const createAuthContext = (): TrpcContext => ({
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
      initialBalance: "10000",
      activeTradingSystemId: null,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("account.create", () => {
    it("should create an account with valid data", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.create({
        name: "Test Account",
        notes: "Test notes",
        initialBalance: "1000",
      });

      expect(result).toMatchObject({
        id: expect.any(Number),
        name: "Test Account",
        notes: "Test notes",
        initialBalance: "1000",
        userId: 1,
      });
    });

    it("should default initialBalance to '0' when not provided", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.account.create({
        name: "Test Account",
      });

      expect(db.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          initialBalance: "0",
        })
      );
    });
  });

  describe("account.list", () => {
    it("should return all accounts for the user", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        name: "Test Account",
        userId: 1,
      });
    });
  });

  describe("account.get", () => {
    it("should return an account by id", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.get({ id: 1 });

      expect(result).toMatchObject({
        id: 1,
        name: "Test Account",
        userId: 1,
      });
    });

    it("should return null for non-existent account", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.get({ id: 999 });

      expect(result).toBeUndefined();
    });
  });

  describe("account.update", () => {
    it("should update an account with valid data", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.update({
        id: 1,
        name: "Updated Account",
        notes: "Updated notes",
        initialBalance: "2000",
      });

      expect(result).toMatchObject({
        id: 1,
        name: "Updated Account",
        notes: "Updated notes",
        initialBalance: "2000",
      });
    });
  });

  describe("account.delete", () => {
    it("should delete an account when user has multiple accounts", async () => {
      vi.mocked(db.getAccountCount).mockResolvedValueOnce(2);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.account.delete({ id: 1 });

      expect(result).toEqual({ success: true });
    });

    it("should prevent deleting the last account", async () => {
      vi.mocked(db.getAccountCount).mockResolvedValueOnce(1);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.account.delete({ id: 1 })).rejects.toThrow(
        "Cannot delete the last account"
      );
    });
  });
});
