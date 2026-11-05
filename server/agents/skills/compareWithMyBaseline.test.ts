import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "../../../drizzle/schema";

vi.mock("../../db", () => ({
  getTradeById: vi.fn(),
  listTrades: vi.fn(),
}));

import { getTradeById, listTrades } from "../../db";
import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./compareWithMyBaseline";

const getByIdMock = vi.mocked(getTradeById);
const listMock = vi.mocked(listTrades);

const HOUR_MS = 3_600_000;
const OPEN_TIME = 1_700_000_000_000;

// positionSizeUsdt is 100, so realizedPnlUsd reads directly as net return %.
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
    openTime: OPEN_TIME,
    openTimeApprox: false,
    closeTime: OPEN_TIME + 2 * HOUR_MS,
    entryPrice: "100",
    exitPrice: "110",
    quantity: "1",
    positionSizeUsdt: "100",
    feeUsd: "0.1",
    realizedPnlUsd: "1.5",
    stopLossPrice: null,
    takeProfitPrice: null,
    syncedAt: OPEN_TIME + 3 * HOUR_MS,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const sampleOf = (pnls: string[], overrides: Partial<Trade> = {}) =>
  pnls.map((pnl, i) =>
    buildRow({ id: i + 1, realizedPnlUsd: pnl, ...overrides })
  );

beforeEach(() => {
  getByIdMock.mockReset();
  listMock.mockReset();
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
      runTool("compare_with_my_baseline", { tradeId: 1 })
    ).rejects.toThrow(/requires ctx\.userId/);
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it("returns ok=false when the trade is not found", async () => {
    getByIdMock.mockResolvedValueOnce(undefined);

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 999 },
      { userId: 42 }
    )) as { ok: false; error: string };

    expect(getByIdMock).toHaveBeenCalledWith(999, 42);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/找不到交易/);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns ok=false when the target trade is still open", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 5, status: "open", closeTime: null })
    );

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 5 },
      { userId: 1 }
    )) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/尚未平仓/);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("reads closed trades of the target's account, scoped to the user", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 10, accountId: 3 }));
    listMock.mockResolvedValueOnce([]);

    await runTool("compare_with_my_baseline", { tradeId: 10 }, { userId: 7 });

    expect(listMock).toHaveBeenCalledWith(3, 7, "closed");
  });

  it("returns ok=false when sample has fewer than 5 comparable trades", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 10 }));
    listMock.mockResolvedValueOnce([
      ...sampleOf(["1", "2"]),
      buildRow({ id: 3, openTimeApprox: true }),
      buildRow({ id: 10 }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 10 },
      { userId: 1 }
    )) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/样本不足/);
    expect(result.error).toMatch(/2/);
  });

  it("computes percentile + interpretation for a 6-trade sample, excluding self", async () => {
    // Current trade returns 4%, hold=2h — should land in the top of the sample.
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 100, realizedPnlUsd: "4" })
    );
    // Sample (excluding id=100): returns [-1,-0.5,2,2.5,3,3.5]
    listMock.mockResolvedValueOnce([
      buildRow({ id: 100, realizedPnlUsd: "999" }), // self — must be filtered out
      ...sampleOf(["-1", "-0.5", "2", "2.5", "3", "3.5"]),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100 },
      { userId: 1 }
    )) as {
      ok: true;
      windowUsed: number;
      scope: string;
      current: { id: number; returnPct: number; holdHours: number | null };
      sample: { winRate: number; medianReturnPct: number };
      percentile: { returnRank: number; holdRank: number | null };
      interpretation: string;
    };

    expect(result.ok).toBe(true);
    expect(result.windowUsed).toBe(6);
    expect(result.scope).toBe("all");
    expect(result.current.id).toBe(100);
    expect(result.current.returnPct).toBe(4);
    expect(result.current.holdHours).toBe(2);
    expect(result.percentile.returnRank).toBe(100);
    expect(result.percentile.holdRank).not.toBeNull();
    expect(Math.round(result.sample.winRate)).toBe(67); // 4/6
    expect(result.sample.medianReturnPct).toBeCloseTo(2.25, 2);
    expect(result.interpretation).toMatch(/净收益率 4%/);
    expect(result.interpretation).toMatch(/位列第 100%/);
    expect(result.interpretation).toMatch(/top 10%/);
    // Subjective markers must not leak into the copy.
    expect(result.interpretation).not.toMatch(/good|bad|好|坏/i);
  });

  it("derives return % from net PnL over position size", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 100, realizedPnlUsd: "25", positionSizeUsdt: "500" })
    );
    listMock.mockResolvedValueOnce(sampleOf(["1", "2", "3", "4", "6"]));

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100 },
      { userId: 1 }
    )) as { ok: true; current: { returnPct: number } };

    expect(result.current.returnPct).toBe(5);
  });

  it("uses tied-aware rank when target value collides with sample values", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 200, realizedPnlUsd: "2" })
    );
    listMock.mockResolvedValueOnce(sampleOf(["1", "2", "2", "2", "3"]));

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 200 },
      { userId: 1 }
    )) as { ok: true; percentile: { returnRank: number } };

    // below=1, equal=3 → (1 + 1.5)/5 = 0.5 → 50
    expect(result.percentile.returnRank).toBe(50);
  });

  it("pairScope=same-pair keeps only trades on the target's symbol", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 100, symbol: "ETHUSDT" }));
    listMock.mockResolvedValueOnce([
      ...sampleOf(["1", "2", "3", "4", "5"], { symbol: "ETHUSDT" }),
      buildRow({ id: 50, symbol: "BTCUSDT" }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100, pairScope: "same-pair" },
      { userId: 1 }
    )) as { ok: true; windowUsed: number; interpretation: string };

    expect(result.windowUsed).toBe(5);
    expect(result.interpretation).toMatch(/同币种（ETHUSDT）/);
  });

  it("pairScope=same-direction keeps only trades on the target's side", async () => {
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 100, side: "short" }));
    listMock.mockResolvedValueOnce([
      ...sampleOf(["1", "2", "3", "4", "5"], { side: "short" }),
      buildRow({ id: 50, side: "long" }),
    ]);

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100, pairScope: "same-direction" },
      { userId: 1 }
    )) as { ok: true; windowUsed: number };

    expect(result.windowUsed).toBe(5);
  });

  it("sets holdHours and holdRank to null when the target's open time is approximate", async () => {
    getByIdMock.mockResolvedValueOnce(
      buildRow({ id: 100, openTimeApprox: true })
    );
    listMock.mockResolvedValueOnce(sampleOf(["1", "2", "3", "4", "5"]));

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100 },
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
    getByIdMock.mockResolvedValueOnce(buildRow({ id: 100 }));
    listMock.mockResolvedValueOnce(
      Array.from({ length: 30 }, (_, i) =>
        buildRow({ id: i + 1, realizedPnlUsd: String(1 + i * 0.1) })
      )
    );

    const result = (await runTool(
      "compare_with_my_baseline",
      { tradeId: 100, windowSize: 10 },
      { userId: 1 }
    )) as { ok: true; windowUsed: number };

    expect(result.windowUsed).toBe(10);
  });

  it("rejects windowSize outside 10..200 at the zod boundary", async () => {
    await expect(
      runTool(
        "compare_with_my_baseline",
        { tradeId: 1, windowSize: 5 },
        { userId: 1 }
      )
    ).rejects.toThrow();
    await expect(
      runTool(
        "compare_with_my_baseline",
        { tradeId: 1, windowSize: 999 },
        { userId: 1 }
      )
    ).rejects.toThrow();
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
