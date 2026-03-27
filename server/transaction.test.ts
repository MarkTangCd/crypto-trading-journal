import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "10000" }),
  getCurrentBalance: vi.fn().mockResolvedValue("10000"),
  getConsecutiveLosses: vi.fn().mockResolvedValue(0),
  createTransaction: vi.fn().mockImplementation((data) => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTransactionById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    tradingPair: "BTCUSDT",
    timeFrame: "4H",
    startTime: Date.now(),
    endTime: Date.now() + 3600000,
    direction: "long",
    tradingLogic: "Test trade",
    outcome: "win",
    consecutiveLosses: 0,
    riskRewardRatio: "2.5",
    returnAmount: "100",
    accountBalance: "10100",
    tvUrl: null,
    reviewFeedback: null,
    reviewChartUrl: null,
    isReviewed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getTransactionsByUserId: vi.fn().mockResolvedValue([]),
  updateTransaction: vi.fn().mockResolvedValue({
    id: 1,
    isReviewed: 1,
    reviewFeedback: "Good trade",
  }),
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
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
  createTradingElement: vi.fn().mockImplementation((data) => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTradingElementsByUserId: vi.fn().mockResolvedValue([]),
  getTradingElementById: vi.fn().mockResolvedValue({ id: 1, userId: 1, name: "Gap", description: null }),
  updateTradingElement: vi.fn().mockResolvedValue({ id: 1, name: "Gap Updated" }),
  deleteTradingElement: vi.fn().mockResolvedValue(undefined),
  // Trading system functions
  createTradingSystem: vi.fn().mockImplementation((data) => ({
    id: 1,
    ...data,
    isActive: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTradingSystemsByUserId: vi.fn().mockResolvedValue([]),
  getTradingSystemById: vi.fn().mockResolvedValue({ id: 1, userId: 1, name: "Test System", notes: null, isActive: 0 }),
  updateTradingSystem: vi.fn().mockResolvedValue({ id: 1, name: "Updated System" }),
  deleteTradingSystem: vi.fn().mockResolvedValue(undefined),
  activateTradingSystem: vi.fn().mockResolvedValue(undefined),
  deactivateTradingSystem: vi.fn().mockResolvedValue(undefined),
  getActiveTradingSystem: vi.fn().mockResolvedValue(null),
  addElementsToSystem: vi.fn().mockResolvedValue(undefined),
  removeElementsFromSystem: vi.fn().mockResolvedValue(undefined),
  getSystemElements: vi.fn().mockResolvedValue([]),
  getStatisticsBySystem: vi.fn().mockResolvedValue([]),
  getSystemStatistics: vi.fn().mockResolvedValue([]),
  // Transaction elements functions
  addElementsToTransaction: vi.fn().mockResolvedValue(undefined),
  getTransactionElements: vi.fn().mockResolvedValue([]),
  removeElementsFromTransaction: vi.fn().mockResolvedValue(undefined),
  calculateConfidenceLevel: vi.fn().mockResolvedValue(65),
  getElementsByIds: vi.fn().mockResolvedValue([]),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("transaction procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("transaction.create", () => {
    it("creates a new transaction with valid input", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.create({
        tradingPair: "BTCUSDT",
        timeFrame: "4H",
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        direction: "long",
        tradingLogic: "Bullish breakout pattern",
        outcome: "win",
        riskRewardRatio: "2.5",
        returnAmount: "100",
        tvUrl: "https://tradingview.com/chart/xyz",
      });

      expect(result).toBeDefined();
      expect(result.tradingPair).toBe("BTCUSDT");
      expect(result.direction).toBe("long");
      expect(result.outcome).toBe("win");
    });

    it("converts trading pair to uppercase", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.create({
        tradingPair: "btcusdt",
        timeFrame: "1H",
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        direction: "short",
        tradingLogic: "Test",
        outcome: "loss",
        riskRewardRatio: "1.5",
        returnAmount: "-50",
      });

      expect(result.tradingPair).toBe("BTCUSDT");
    });
  });

  describe("transaction.get", () => {
    it("retrieves a transaction by id", async () => {
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

      const result = await caller.transaction.list({});

      expect(Array.isArray(result)).toBe(true);
    });

    it("lists transactions with filters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.list({
        outcome: "win",
        direction: "long",
        sortBy: "returnAmount",
        sortOrder: "desc",
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("transaction.update", () => {
    it("updates transaction review", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.update({
        id: 1,
        reviewFeedback: "Good trade, followed the plan",
        isReviewed: true,
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

      const result = await caller.transaction.getFormDefaults();

      expect(result).toBeDefined();
      expect(result.currentBalance).toBe("10000");
      expect(result.consecutiveLosses).toBe(0);
      expect(result.initialBalance).toBe("10000");
    });
  });

  describe("transaction.getTradingPairs", () => {
    it("returns unique trading pairs", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.transaction.getTradingPairs();

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

    const result = await caller.stats.get();

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
    expect(result.initialBalance).toBe("10000");
  });

  it("sets initial balance", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.user.setInitialBalance({
      initialBalance: "15000",
    });

    expect(result).toEqual({ success: true });
  });
});
