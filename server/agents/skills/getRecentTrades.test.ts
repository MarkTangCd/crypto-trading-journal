import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getTransactionsByUserId: vi.fn(),
}));

import { getTransactionsByUserId } from "../../db";
import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./getRecentTrades";

const queryMock = vi.mocked(getTransactionsByUserId);

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    accountId: 1,
    status: "closed",
    accountBalance: "100",
    tradingPair: "BTCUSDT",
    timeFrame: "1H",
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_001_000,
    direction: "long",
    tradingLogic: "",
    context: "ctx",
    tradeItems: [],
    outcome: "win",
    consecutiveLosses: 0,
    riskRewardRatio: "1.5",
    returnAmount: "10",
    entryPrice: null,
    positionSizeUsdt: null,
    plannedStopLossPrice: null,
    plannedTakeProfitPrice: null,
    plannedRiskRewardRatio: null,
    exitPrice: null,
    tvUrl: null,
    marketCycle: null,
    transactionType: null,
    reviewFeedback: null,
    reviewChartUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

afterAll(() => {
  unregisterForTest("get_recent_trades");
});

describe("get_recent_trades tool", () => {
  it("registers under the canonical name", () => {
    expect(getTool("get_recent_trades")).toBeDefined();
  });

  it("scopes by ctx.userId and forwards normalized filters", async () => {
    queryMock.mockResolvedValueOnce([buildRow({ id: 1 }), buildRow({ id: 2 })]);

    const result = (await runTool(
      "get_recent_trades",
      {
        tradingPair: "btcusdt",
        direction: "long",
        outcome: "win",
      },
      { userId: 42 }
    )) as { total: number; returned: number; trades: { id: number }[] };

    expect(queryMock).toHaveBeenCalledWith(42, {
      tradingPair: "BTCUSDT",
      direction: "long",
      outcome: "win",
      sortBy: "startTime",
      sortOrder: "desc",
    });
    expect(result.total).toBe(2);
    expect(result.returned).toBe(2);
    expect(result.trades.map(t => t.id)).toEqual([1, 2]);
  });

  it("clamps the response to the caller-supplied limit", async () => {
    queryMock.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) => buildRow({ id: i + 1 }))
    );

    const result = (await runTool(
      "get_recent_trades",
      { limit: 5 },
      { userId: 1 }
    )) as { total: number; returned: number; trades: { id: number }[] };

    expect(result.total).toBe(15);
    expect(result.returned).toBe(5);
    expect(result.trades).toHaveLength(5);
  });

  it("rejects a limit above the hard ceiling of 20", async () => {
    await expect(
      runTool("get_recent_trades", { limit: 25 }, { userId: 1 })
    ).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws when ctx.userId is missing — preserves cross-user isolation", async () => {
    await expect(runTool("get_recent_trades", {})).rejects.toThrow(
      /requires ctx\.userId/
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("does not push optional filters when omitted", async () => {
    queryMock.mockResolvedValueOnce([]);
    await runTool("get_recent_trades", {}, { userId: 7 });
    expect(queryMock).toHaveBeenCalledWith(7, {
      sortBy: "startTime",
      sortOrder: "desc",
    });
  });
});
