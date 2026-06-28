import { describe, expect, it } from "vitest";
import type { Candle } from "../../../_core/coinank";
import {
  classifyTrend,
  clusterPrices,
  computeATR,
  detectFractals,
} from "./marketStructure";

function candle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return { time, open, high, low, close };
}

// Build a synthetic monotonic series; each candle's body and wicks scale with
// the supplied `body` so detectFractals / classifyTrend have crisp inputs.
function buildSeries(
  closes: number[],
  body = 0.5,
  startTs = 1_700_000_000
): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]!;
    const high = Math.max(o, c) + body;
    const low = Math.min(o, c) - body;
    return candle(startTs + i * 3600, o, high, low, c);
  });
}

describe("computeATR", () => {
  it("returns 0 when there are not enough candles", () => {
    const candles = buildSeries([10, 11, 12]);
    expect(computeATR(candles, 14)).toBe(0);
  });

  it("averages true range across the last `period` candles", () => {
    // 20 candles, each true range is exactly 2 by construction.
    const closes = Array.from({ length: 20 }, (_, i) => 10 + i);
    const candles = buildSeries(closes, 0.5);
    const atr = computeATR(candles, 14);
    // body=0.5 so high-low = 2 (open->close=1 + 0.5*2), TR ~ 2 consistently.
    expect(atr).toBeGreaterThan(1.9);
    expect(atr).toBeLessThan(2.1);
  });
});

describe("detectFractals", () => {
  it("finds a swing high when the centre candle dominates its neighbours", () => {
    const candles: Candle[] = [
      candle(1, 10, 11, 9, 10),
      candle(2, 10, 12, 9, 10),
      candle(3, 10, 15, 9, 10), // swing high
      candle(4, 10, 12, 9, 10),
      candle(5, 10, 11, 9, 10),
    ];
    const swings = detectFractals(candles, 2);
    expect(swings).toEqual([{ ts: 3, price: 15, kind: "high" }]);
  });

  it("finds a swing low when the centre candle's low dominates downward", () => {
    const candles: Candle[] = [
      candle(1, 10, 11, 9, 10),
      candle(2, 10, 11, 8, 10),
      candle(3, 10, 11, 5, 10), // swing low
      candle(4, 10, 11, 8, 10),
      candle(5, 10, 11, 9, 10),
    ];
    const swings = detectFractals(candles, 2);
    expect(swings).toEqual([{ ts: 3, price: 5, kind: "low" }]);
  });

  it("returns empty when window is too small", () => {
    const candles: Candle[] = [
      candle(1, 10, 11, 9, 10),
      candle(2, 10, 12, 9, 10),
    ];
    expect(detectFractals(candles, 2)).toEqual([]);
  });
});

describe("clusterPrices", () => {
  it("merges prices within the threshold into one cluster", () => {
    // 100, 100.2 (within 0.3%) and 100.25 (within 0.3% of running mean).
    const out = clusterPrices([100, 100.2, 100.25], 0.003);
    expect(out).toHaveLength(1);
    expect(out[0]!.hits).toBe(3);
    expect(out[0]!.price).toBeCloseTo((100 + 100.2 + 100.25) / 3, 4);
  });

  it("splits prices that exceed the threshold", () => {
    const out = clusterPrices([100, 110, 110.2], 0.003);
    expect(out).toHaveLength(2);
    // Highest-hits first; ties broken by lower price first.
    expect(out[0]!.hits).toBe(2);
    expect(out[0]!.price).toBeCloseTo(110.1, 4);
    expect(out[1]!.hits).toBe(1);
    expect(out[1]!.price).toBe(100);
  });

  it("returns empty for empty input", () => {
    expect(clusterPrices([])).toEqual([]);
  });
});

describe("classifyTrend", () => {
  it("returns 'up' on higher highs and higher lows", () => {
    const swings = [
      { ts: 1, price: 10, kind: "low" as const },
      { ts: 2, price: 15, kind: "high" as const },
      { ts: 3, price: 12, kind: "low" as const },
      { ts: 4, price: 18, kind: "high" as const },
    ];
    const recent = buildSeries([10, 12, 14, 16, 18]);
    expect(classifyTrend(swings, recent, 1, 0.5)).toBe("up");
  });

  it("returns 'down' on lower highs and lower lows", () => {
    const swings = [
      { ts: 1, price: 20, kind: "high" as const },
      { ts: 2, price: 15, kind: "low" as const },
      { ts: 3, price: 18, kind: "high" as const },
      { ts: 4, price: 12, kind: "low" as const },
    ];
    const recent = buildSeries([20, 18, 16, 14, 12]);
    expect(classifyTrend(swings, recent, 1, 0.5)).toBe("down");
  });

  it("returns 'range' when recent spread falls below the ATR floor", () => {
    const swings = [
      { ts: 1, price: 10, kind: "low" as const },
      { ts: 2, price: 15, kind: "high" as const },
      { ts: 3, price: 12, kind: "low" as const },
      { ts: 4, price: 18, kind: "high" as const },
    ];
    // Tight body and huge ATR forces spread < 0.5 * atr → range.
    const recent = buildSeries([100, 100.05, 100.1, 100.05, 100], 0.01);
    expect(classifyTrend(swings, recent, 10, 0.5)).toBe("range");
  });
});
