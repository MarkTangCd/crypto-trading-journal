import type { Candle } from "../../../_core/coinank";

export type SwingKind = "high" | "low";

export interface Swing {
  ts: number;
  price: number;
  kind: SwingKind;
}

export interface PriceCluster {
  price: number;
  hits: number;
}

export type TrendDirection = "up" | "down" | "range";

/**
 * SMA-based ATR. Returns 0 when candles are insufficient (caller decides
 * whether to surface that as an error) so the rest of the pipeline can keep
 * computing partial results without throwing.
 */
export function computeATR(candles: Candle[], period = 14): number {
  if (candles.length <= period) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    if (!cur || !prev) continue;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  const window = trs.slice(-period);
  if (window.length === 0) return 0;
  const sum = window.reduce((acc, v) => acc + v, 0);
  return sum / window.length;
}

/**
 * Fractal swing detection. A candle at index i is a swing high if its high
 * strictly dominates the highs of the surrounding `n` candles on both sides;
 * a swing low mirrors the rule on lows. Edges (i < n or i >= len - n) are
 * skipped because they lack a full window.
 */
export function detectFractals(candles: Candle[], n = 2): Swing[] {
  if (n < 1 || candles.length < n * 2 + 1) return [];
  const swings: Swing[] = [];
  for (let i = n; i < candles.length - n; i++) {
    const cur = candles[i];
    if (!cur) continue;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= n; k++) {
      const left = candles[i - k];
      const right = candles[i + k];
      if (!left || !right) {
        isHigh = false;
        isLow = false;
        break;
      }
      if (left.high >= cur.high || right.high >= cur.high) isHigh = false;
      if (left.low <= cur.low || right.low <= cur.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swings.push({ ts: cur.time, price: cur.high, kind: "high" });
    if (isLow) swings.push({ ts: cur.time, price: cur.low, kind: "low" });
  }
  return swings;
}

/**
 * Single-pass agglomerative clustering by relative price distance. Prices
 * within `thresholdPct` of the running cluster mean are merged; the result is
 * sorted by `hits` desc (ties broken by lower price first).
 */
export function clusterPrices(
  prices: number[],
  thresholdPct = 0.003
): PriceCluster[] {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { sum: number; hits: number }[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      Math.abs(p - last.sum / last.hits) / (last.sum / last.hits) <=
        thresholdPct
    ) {
      last.sum += p;
      last.hits += 1;
    } else {
      clusters.push({ sum: p, hits: 1 });
    }
  }
  return clusters
    .map(c => ({ price: c.sum / c.hits, hits: c.hits }))
    .sort((a, b) => b.hits - a.hits || a.price - b.price);
}

/**
 * Trend classification with a volatility floor. Recent-window range that is
 * smaller than `atrMult * atr` short-circuits to "range" (no meaningful
 * directional move). Otherwise the last two highs and last two lows are
 * compared: HH+HL → up, LH+LL → down, anything else → range.
 */
export function classifyTrend(
  swings: Swing[],
  recentCandles: Candle[],
  atr: number,
  atrMult = 0.5
): TrendDirection {
  if (recentCandles.length === 0) return "range";
  if (atr > 0) {
    let highMax = -Infinity;
    let lowMin = Infinity;
    for (const c of recentCandles) {
      if (c.high > highMax) highMax = c.high;
      if (c.low < lowMin) lowMin = c.low;
    }
    if (highMax - lowMin < atrMult * atr) return "range";
  }
  const highs = swings.filter(s => s.kind === "high").slice(-2);
  const lows = swings.filter(s => s.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "range";
  const hh = highs[1]!.price > highs[0]!.price;
  const hl = lows[1]!.price > lows[0]!.price;
  const lh = highs[1]!.price < highs[0]!.price;
  const ll = lows[1]!.price < lows[0]!.price;
  if (hh && hl) return "up";
  if (lh && ll) return "down";
  return "range";
}
