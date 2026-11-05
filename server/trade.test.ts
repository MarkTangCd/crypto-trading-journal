import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { Trade } from "../drizzle/schema";
import * as db from "./db";

vi.mock("./db", () => ({
  TradeEditError: class TradeEditError extends Error {},
  getAccountById: vi.fn(),
  getTradeById: vi.fn(),
  getTradeStats: vi.fn(),
  listTrades: vi.fn(),
  updateTradeByHand: vi.fn(),
}));

function tradeRow(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    userId: 1,
    accountId: 1,
    tradeKey: "BTCUSDT|BOTH|1",
    exchange: "binance",
    exchangeSymbol: "BTCUSDT",
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: 1_700_000_000_000,
    openTimeApprox: false,
    closeTime: 1_700_000_600_000,
    entryPrice: "100",
    exitPrice: "110",
    quantity: "1",
    positionSizeUsdt: "100",
    feeUsd: "0.1",
    realizedPnlUsd: "10",
    stopLossPrice: null,
    takeProfitPrice: null,
    syncedAt: 1_700_000_700_000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Trade Router", () => {
  const mockCtx: TrpcContext = {
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

  const caller = appRouter.createCaller(mockCtx);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getAccountById).mockResolvedValue({
      id: 1,
    } as Awaited<ReturnType<typeof db.getAccountById>>);
    vi.mocked(db.getTradeById).mockResolvedValue(tradeRow());
    vi.mocked(db.updateTradeByHand).mockImplementation(async (_id, _u, patch) =>
      tradeRow(patch)
    );
  });

  describe("list", () => {
    it("returns the account's trades in db order with the status filter", async () => {
      const rows = [tradeRow({ id: 2, status: "open" }), tradeRow()];
      vi.mocked(db.listTrades).mockResolvedValueOnce(rows);

      const result = await caller.trade.list({ accountId: 1, status: "open" });

      expect(result.map(trade => trade.id)).toEqual([2, 1]);
      expect(db.getAccountById).toHaveBeenCalledWith(1, 1);
      expect(db.listTrades).toHaveBeenCalledWith(1, 1, "open");
    });

    it("rejects an account the user does not own", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);

      await expect(caller.trade.list({ accountId: 9 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(db.listTrades).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("returns one trade", async () => {
      expect(await caller.trade.get({ id: 1 })).toMatchObject({ id: 1 });
      expect(db.getTradeById).toHaveBeenCalledWith(1, 1);
    });

    it("throws NOT_FOUND for a missing trade", async () => {
      vi.mocked(db.getTradeById).mockResolvedValueOnce(undefined);

      await expect(caller.trade.get({ id: 999 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("update", () => {
    it("passes normalized price levels to updateTradeByHand", async () => {
      const result = await caller.trade.update({
        id: 1,
        stopLossPrice: "95.50",
        takeProfitPrice: "120",
      });

      expect(db.updateTradeByHand).toHaveBeenCalledWith(1, 1, {
        stopLossPrice: "95.5",
        takeProfitPrice: "120",
      });
      expect(result).toMatchObject({ stopLossPrice: "95.5" });
    });

    it("accepts null to clear a level and openTime in ms", async () => {
      await caller.trade.update({ id: 1, stopLossPrice: null });
      await caller.trade.update({ id: 1, openTime: 1_699_999_000_000 });

      expect(db.updateTradeByHand).toHaveBeenNthCalledWith(1, 1, 1, {
        stopLossPrice: null,
      });
      expect(db.updateTradeByHand).toHaveBeenNthCalledWith(2, 1, 1, {
        openTime: 1_699_999_000_000,
      });
    });

    it("turns a hand-edit rule violation into BAD_REQUEST", async () => {
      vi.mocked(db.updateTradeByHand).mockRejectedValueOnce(
        new db.TradeEditError("Open time is editable only while approximate")
      );

      await expect(
        caller.trade.update({ id: 1, openTime: 1_699_999_000_000 })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Open time is editable only while approximate",
      });
    });

    it.each([
      { stopLossPrice: "abc" },
      { stopLossPrice: "-1" },
      { takeProfitPrice: "0" },
      { takeProfitPrice: "1e3" },
      { openTime: 1.5 },
      { openTime: -1 },
      {},
    ])("rejects invalid input %j", async patch => {
      await expect(
        caller.trade.update({ id: 1, ...patch })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.updateTradeByHand).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND for a missing trade", async () => {
      vi.mocked(db.updateTradeByHand).mockResolvedValueOnce(undefined);

      await expect(
        caller.trade.update({ id: 999, stopLossPrice: "1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("stats.get", () => {
    const tradeStats: db.TradeStats = {
      closedCount: 3,
      winCount: 2,
      lossCount: 1,
      breakevenCount: 0,
      winRate: "0.6667",
      profitFactor: "3.0000",
      expectancyUsd: "6.67",
      losingStreak: 1,
      realizedPnlUsd: "18.5",
      feeUsd: "1.5",
      openCount: 1,
      openExposureUsdt: "500",
      exposureRatio: "0.0500",
    };

    it("returns trade stats with the account's synced balance fields", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce({
        id: 1,
        balanceUsdt: "10000",
        unrealizedPnlUsdt: "-12.3",
        lastSyncedAt: 1_700_000_900_000,
      } as Awaited<ReturnType<typeof db.getAccountById>>);
      vi.mocked(db.getTradeStats).mockResolvedValueOnce(tradeStats);

      const result = await caller.stats.get({ accountId: 1 });

      expect(db.getTradeStats).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({
        ...tradeStats,
        balanceUsdt: "10000",
        unrealizedPnlUsdt: "-12.3",
        lastSyncedAt: 1_700_000_900_000,
      });
    });

    it("rejects an account the user does not own", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);

      await expect(caller.stats.get({ accountId: 2 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(db.getTradeStats).not.toHaveBeenCalled();
    });
  });
});
