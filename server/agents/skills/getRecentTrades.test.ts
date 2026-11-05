import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Trade } from "../../../drizzle/schema";

vi.mock("../../db", () => ({
  getAccountsByUserId: vi.fn(),
  listTrades: vi.fn(),
}));

import { getAccountsByUserId, listTrades } from "../../db";
import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./getRecentTrades";

const accountsMock = vi.mocked(getAccountsByUserId);
const listMock = vi.mocked(listTrades);

function buildRow(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    userId: 1,
    accountId: 1,
    tradeKey: "BTCUSDT|BOTH#1",
    exchange: "binance",
    exchangeSymbol: "BTCUSDT",
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: 1_700_000_000_000,
    openTimeApprox: false,
    closeTime: 1_700_000_001_000,
    entryPrice: "100",
    exitPrice: "110",
    quantity: "1",
    positionSizeUsdt: "100",
    feeUsd: "0.1",
    realizedPnlUsd: "9.9",
    stopLossPrice: null,
    takeProfitPrice: null,
    syncedAt: 1_700_000_002_000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const account = (id: number) => ({ id }) as Account;

type Result = {
  total: number;
  returned: number;
  trades: Record<string, unknown>[];
};

beforeEach(() => {
  accountsMock.mockReset().mockResolvedValue([account(1)]);
  listMock.mockReset().mockResolvedValue([]);
});

afterAll(() => {
  unregisterForTest("get_recent_trades");
});

describe("get_recent_trades tool", () => {
  it("registers under the canonical name", () => {
    expect(getTool("get_recent_trades")).toBeDefined();
  });

  it("merges every account of ctx.userId newest-first by openTime", async () => {
    accountsMock.mockResolvedValueOnce([account(1), account(2)]);
    listMock
      .mockResolvedValueOnce([
        buildRow({ id: 1, status: "open", openTime: 10 }),
        buildRow({ id: 2, openTime: 30 }),
      ])
      .mockResolvedValueOnce([buildRow({ id: 3, accountId: 2, openTime: 20 })]);

    const result = (await runTool(
      "get_recent_trades",
      { status: "closed" },
      { userId: 42 }
    )) as Result;

    expect(accountsMock).toHaveBeenCalledWith(42);
    expect(listMock).toHaveBeenNthCalledWith(1, 1, 42, "closed");
    expect(listMock).toHaveBeenNthCalledWith(2, 2, 42, "closed");
    expect(result.trades.map(t => t.id)).toEqual([2, 3, 1]);
  });

  it("filters by normalized symbol and side", async () => {
    listMock.mockResolvedValueOnce([
      buildRow({ id: 1 }),
      buildRow({ id: 2, side: "short" }),
      buildRow({ id: 3, symbol: "ETHUSDT" }),
    ]);

    const result = (await runTool(
      "get_recent_trades",
      { symbol: "btcusdt", side: "long" },
      { userId: 1 }
    )) as Result;

    expect(result.total).toBe(1);
    expect(result.trades.map(t => t.id)).toEqual([1]);
  });

  it("returns exchange facts only, with UTC+8 time texts", async () => {
    listMock.mockResolvedValueOnce([
      buildRow({ id: 1, status: "open", closeTime: null, exitPrice: null }),
    ]);

    const result = (await runTool(
      "get_recent_trades",
      {},
      { userId: 1 }
    )) as Result;

    expect(Object.keys(result.trades[0]).sort()).toEqual(
      [
        "id",
        "symbol",
        "side",
        "status",
        "openTime",
        "openTimeText",
        "openTimeApprox",
        "closeTime",
        "closeTimeText",
        "entryPrice",
        "exitPrice",
        "stopLossPrice",
        "takeProfitPrice",
        "quantity",
        "positionSizeUsdt",
        "feeUsd",
        "realizedPnlUsd",
      ].sort()
    );
    expect(result.trades[0].openTimeText).toEqual(expect.any(String));
    expect(result.trades[0].closeTimeText).toBeNull();
  });

  it("clamps the response to the caller-supplied limit", async () => {
    listMock.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) => buildRow({ id: i + 1 }))
    );

    const result = (await runTool(
      "get_recent_trades",
      { limit: 5 },
      { userId: 1 }
    )) as Result;

    expect(result.total).toBe(15);
    expect(result.returned).toBe(5);
    expect(result.trades).toHaveLength(5);
  });

  it("rejects a limit above the hard ceiling of 20", async () => {
    await expect(
      runTool("get_recent_trades", { limit: 25 }, { userId: 1 })
    ).rejects.toThrow();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("throws when ctx.userId is missing — preserves cross-user isolation", async () => {
    await expect(runTool("get_recent_trades", {})).rejects.toThrow(
      /requires ctx\.userId/
    );
    expect(accountsMock).not.toHaveBeenCalled();
  });
});
