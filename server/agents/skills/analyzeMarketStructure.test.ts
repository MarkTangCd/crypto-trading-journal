import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/coinank", () => ({
  fetchCandleWindowAround: vi.fn(),
}));

import { fetchCandleWindowAround, type Candle } from "../../_core/coinank";
import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./analyzeMarketStructure";

const fetchMock = vi.mocked(fetchCandleWindowAround);

beforeEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  unregisterForTest("analyze_market_structure");
});

// Builds a flat synthetic series (open == close == base) with optional high/low
// spikes injected at specific indices so detectFractals (strict-inequality
// N=2) can find clean swings without the prev-close=next-open ties that a
// continuous OHLC chain produces.
function buildSpikedSeries(
  bars: number,
  baseAt: (i: number) => number,
  spikeHighAt: (i: number) => boolean,
  spikeLowAt: (i: number) => boolean,
  spike = 6,
  noise = 0.3,
  startTs = 1_700_000_000
): Candle[] {
  return Array.from({ length: bars }, (_, i) => {
    const base = baseAt(i);
    const high = spikeHighAt(i) ? base + spike : base + noise;
    const low = spikeLowAt(i) ? base - spike : base - noise;
    return { time: startTs + i * 3600, open: base, close: base, high, low };
  });
}

describe("analyze_market_structure skill", () => {
  it("registers under the canonical name with the analysis category", () => {
    const tool = getTool("analyze_market_structure");
    expect(tool).toBeDefined();
    expect(tool?.category).toBe("analysis");
  });

  it("returns ok=false in Chinese when fewer than 30 candles come back", async () => {
    fetchMock.mockResolvedValueOnce({
      candles: buildSpikedSeries(
        10,
        i => 100 + i,
        () => false,
        () => false
      ),
      entryIndex: null,
      before: 10,
      after: 0,
    });

    const result = (await runTool("analyze_market_structure", {
      tradingPair: "btcusdt",
      timeFrame: "1H",
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/K 线不足/);
    expect(result.error).toMatch(/10/);
  });

  it("propagates fetch failures as ok=false in Chinese", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const result = (await runTool("analyze_market_structure", {
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/获取 K 线失败/);
    expect(result.error).toMatch(/network down/);
  });

  it("returns a structured up-trend report with swings + S/R for a synthetic uptrend", async () => {
    // Gently rising base with periodic spike highs (at i=5,15,25,35) and
    // spike lows (at i=10,20,30) — guarantees HH+HL pattern over 40 bars.
    const candles = buildSpikedSeries(
      40,
      i => 100 + i * 0.5,
      i => i % 10 === 5,
      i => i % 10 === 0 && i > 0
    );
    fetchMock.mockResolvedValueOnce({
      candles,
      entryIndex: null,
      before: candles.length,
      after: 0,
    });

    const result = (await runTool("analyze_market_structure", {
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      lookback: 40,
    })) as {
      ok: true;
      tradingPair: string;
      lookbackUsed: number;
      recentTrend: "up" | "down" | "range";
      swings: Array<{ ts: number; price: number; kind: "high" | "low" }>;
      supportZones: Array<{ price: number; hits: number }>;
      resistanceZones: Array<{ price: number; hits: number }>;
    };

    expect(result.ok).toBe(true);
    expect(result.tradingPair).toBe("BTCUSDT");
    expect(result.lookbackUsed).toBe(40);
    expect(result.recentTrend).toBe("up");
    expect(result.swings.length).toBeGreaterThan(0);
    expect(result.swings.length).toBeLessThanOrEqual(20);
    const lastClose = candles[candles.length - 1]!.close;
    for (const z of result.supportZones)
      expect(z.price).toBeLessThan(lastClose);
    for (const z of result.resistanceZones)
      expect(z.price).toBeGreaterThan(lastClose);
  });

  it("classifies a flat synthetic series as range", async () => {
    // Flat base, no spikes — recent spread well below 0.5 * ATR.
    const candles = buildSpikedSeries(
      40,
      () => 100,
      () => false,
      () => false,
      0,
      0.05
    );
    fetchMock.mockResolvedValueOnce({
      candles,
      entryIndex: null,
      before: candles.length,
      after: 0,
    });

    const result = (await runTool("analyze_market_structure", {
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      lookback: 40,
    })) as { ok: true; recentTrend: "up" | "down" | "range" };

    expect(result.ok).toBe(true);
    expect(result.recentTrend).toBe("range");
  });

  it("classifies a synthetic downtrend with spike highs/lows", async () => {
    // Falling base with same spike pattern → LH + LL.
    const candles = buildSpikedSeries(
      40,
      i => 120 - i * 0.5,
      i => i % 10 === 5,
      i => i % 10 === 0 && i > 0
    );
    fetchMock.mockResolvedValueOnce({
      candles,
      entryIndex: null,
      before: candles.length,
      after: 0,
    });

    const result = (await runTool("analyze_market_structure", {
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      lookback: 40,
    })) as { ok: true; recentTrend: "up" | "down" | "range" };

    expect(result.ok).toBe(true);
    expect(result.recentTrend).toBe("down");
  });

  it("rejects timeFrame outside the enum at the zod boundary", async () => {
    await expect(
      runTool("analyze_market_structure", {
        tradingPair: "BTCUSDT",
        timeFrame: "1h",
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects lookback below 30 at the zod boundary", async () => {
    await expect(
      runTool("analyze_market_structure", {
        tradingPair: "BTCUSDT",
        timeFrame: "1H",
        lookback: 10,
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
