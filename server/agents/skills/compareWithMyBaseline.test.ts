import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getTransactionById: vi.fn(),
  getTransactionsByUserId: vi.fn(),
}));

import { getTransactionById, getTransactionsByUserId } from "../../db";
import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./compareWithMyBaseline";

const getByIdMock = vi.mocked(getTransactionById);
const queryMock = vi.mocked(getTransactionsByUserId);

const HOUR_MS = 3_600_000;

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
    endTime: 1_700_000_000_000 + 2 * HOUR_MS,
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
  getByIdMock.mockReset();
  queryMock.mockReset();
});

afterAll(() => {
  unregisterForTest("compare_with_my_baseline");
});

describe("compare_with_my_baseline skill", () => {
  it("registers under the canonical name with the analysis category", () => {
    const skill = getTool("compare_with_my_baseline");
    expect(skill).toBeDefined();
    expect(skill?.category).toBe("analysis");
  });

  it("throws when ctx.userId is missing", async () => {
    await expect(
      runTool("compare_with_my_baseline", { transactionId: 1 })
    ).rejects.toThrow(/requires ctx\.userId/);
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it("returns ok=false when the transaction is not found", async () => {
    getByIdMock.mockResolvedValueOnce(undefined);

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 999 },
      { userId: 42 }
    )) as { ok: false; error: string };

    expect(getByIdMock).toHaveBeenCalledWith(999, 42);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/找不到交易/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns ok=false when sample has fewer than 5 comparable trades", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 10 }));
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 1, riskRewardRatio: "1.0" }),
      buildRow({ id: 2, riskRewardRatio: "2.0" }),
      buildRow({ id: 3, status: "open", endTime: null }),
      buildRow({ id: 4, riskRewardRatio: null }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 10 },
      { userId: 1 }
    )) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/样本不足/);
    expect(result.error).toMatch(/2/);
  });

  it("computes percentile + interpretation for a 6-trade sample, excluding self", async () => {
    // Current trade r:r=4, hold=2h — should land in the top of the sample.
    getByIdMock.mockResolvedValueOnce(
      buildRow({
        id: 100,
        riskRewardRatio: "4.0",
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_000_000 + 2 * HOUR_MS,
      })
    );
    // Sample (excluding id=100): r:r values [1,1.5,2,2.5,3,3.5]
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 100, riskRewardRatio: "999" }), // self — must be filtered out
      buildRow({ id: 1, riskRewardRatio: "1.0", outcome: "loss" }),
      buildRow({ id: 2, riskRewardRatio: "1.5", outcome: "loss" }),
      buildRow({ id: 3, riskRewardRatio: "2.0", outcome: "win" }),
      buildRow({ id: 4, riskRewardRatio: "2.5", outcome: "win" }),
      buildRow({ id: 5, riskRewardRatio: "3.0", outcome: "win" }),
      buildRow({ id: 6, riskRewardRatio: "3.5", outcome: "win" }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 100 },
      { userId: 1 }
    )) as {
      ok: true;
      windowUsed: number;
      scope: string;
      current: { id: number; r: number; holdHours: number | null };
      sample: {
        winRate: number;
        medianR: number;
        p25R: number;
        p75R: number;
      };
      percentile: { rRank: number; holdRank: number | null };
      interpretation: string;
    };

    expect(result.ok).toBe(true);
    expect(result.windowUsed).toBe(6);
    expect(result.scope).toBe("all");
    expect(result.current.id).toBe(100);
    expect(result.current.r).toBe(4);
    expect(result.percentile.rRank).toBe(100);
    expect(result.percentile.holdRank).not.toBeNull();
    expect(Math.round(result.sample.winRate)).toBe(67); // 4/6
    expect(result.sample.medianR).toBeCloseTo(2.25, 2);
    expect(result.interpretation).toMatch(/位列第 100%/);
    expect(result.interpretation).toMatch(/top 10%/);
    // Subjective markers must not leak into the copy.
    expect(result.interpretation).not.toMatch(/good|bad|好|坏/i);
  });

  it("uses tied-aware rank when target value collides with sample values", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 200, riskRewardRatio: "2.0" })
    );
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 1, riskRewardRatio: "1.0" }),
      buildRow({ id: 2, riskRewardRatio: "2.0" }),
      buildRow({ id: 3, riskRewardRatio: "2.0" }),
      buildRow({ id: 4, riskRewardRatio: "2.0" }),
      buildRow({ id: 5, riskRewardRatio: "3.0" }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 200 },
      { userId: 1 }
    )) as { ok: true; percentile: { rRank: number } };

    // below=1, equal=3 → (1 + 1.5)/5 = 0.5 → 50
    expect(result.percentile.rRank).toBe(50);
  });

  it("forwards pairScope=same-pair as a tradingPair filter", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 1, tradingPair: "ETHUSDT" })
    );
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 2, tradingPair: "ETHUSDT", riskRewardRatio: "1.0" }),
      buildRow({ id: 3, tradingPair: "ETHUSDT", riskRewardRatio: "1.5" }),
      buildRow({ id: 4, tradingPair: "ETHUSDT", riskRewardRatio: "2.0" }),
      buildRow({ id: 5, tradingPair: "ETHUSDT", riskRewardRatio: "2.5" }),
      buildRow({ id: 6, tradingPair: "ETHUSDT", riskRewardRatio: "3.0" }),
    ]);

    await runTool(
      "compare_with_my_baseline",
      { transactionId: 1, pairScope: "same-pair" },
      { userId: 7 }
    );

    expect(queryMock).toHaveBeenCalledWith(7, {
      tradingPair: "ETHUSDT",
      sortBy: "startTime",
      sortOrder: "desc",
    });
  });

  it("forwards pairScope=same-direction as a direction filter", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 1, direction: "short" }));
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 2, direction: "short", riskRewardRatio: "1.0" }),
      buildRow({ id: 3, direction: "short", riskRewardRatio: "1.5" }),
      buildRow({ id: 4, direction: "short", riskRewardRatio: "2.0" }),
      buildRow({ id: 5, direction: "short", riskRewardRatio: "2.5" }),
      buildRow({ id: 6, direction: "short", riskRewardRatio: "3.0" }),
    ]);

    await runTool(
      "compare_with_my_baseline",
      { transactionId: 1, pairScope: "same-direction" },
      { userId: 7 }
    );

    expect(queryMock).toHaveBeenCalledWith(7, {
      direction: "short",
      sortBy: "startTime",
      sortOrder: "desc",
    });
  });

  it("sets holdRank to null when target trade is still open", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({
        id: 100,
        status: "open",
        endTime: null,
        riskRewardRatio: "2.0",
      })
    );
    queryMock.mockResolvedValueOnce([
      buildRow({ id: 1, riskRewardRatio: "1.0" }),
      buildRow({ id: 2, riskRewardRatio: "1.5" }),
      buildRow({ id: 3, riskRewardRatio: "2.0" }),
      buildRow({ id: 4, riskRewardRatio: "2.5" }),
      buildRow({ id: 5, riskRewardRatio: "3.0" }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 100 },
      { userId: 1 }
    )) as {
      ok: true;
      current: { holdHours: number | null };
      percentile: { holdRank: number | null };
    };

    expect(result.current.holdHours).toBeNull();
    expect(result.percentile.holdRank).toBeNull();
  });

  it("clamps the sample to windowSize even when the DB returns more rows", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 100, riskRewardRatio: "2.0" })
    );
    queryMock.mockResolvedValueOnce(
      Array.from({ length: 30 }, (_, i) =>
        buildRow({ id: i + 1, riskRewardRatio: String(1 + i * 0.1) })
      )
    );

    const result = (await runTool(
      "compare_with_my_baseline",
      { transactionId: 100, windowSize: 10 },
      { userId: 1 }
    )) as { ok: true; windowUsed: number };

    expect(result.windowUsed).toBe(10);
  });

  it("rejects windowSize outside 10..200 at the zod boundary", async () => {
    await expect(
      runTool(
        "compare_with_my_baseline",
        { transactionId: 1, windowSize: 5 },
        { userId: 1 }
      )
    ).rejects.toThrow();
    await expect(
      runTool(
        "compare_with_my_baseline",
        { transactionId: 1, windowSize: 999 },
        { userId: 1 }
      )
    ).rejects.toThrow();
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
