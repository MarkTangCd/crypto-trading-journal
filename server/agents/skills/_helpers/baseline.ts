// Pure stats helpers backing compare_with_my_baseline. Kept free of DB/IO
// so they can be unit-tested with synthetic arrays.

export type BucketLabel =
  | "top 10%"
  | "top 25%"
  | "中位附近"
  | "bottom 25%"
  | "bottom 10%";

export interface SampleSummary {
  winRate: number;
  medianReturnPct: number;
  p25ReturnPct: number;
  p75ReturnPct: number;
  avgHoldHours: number;
  medianHoldHours: number;
}

/**
 * Linear interpolation quantile. Empty input returns 0; q is clamped to
 * [0, 1] so a malformed caller can't index out of bounds.
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, q));
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = clamped * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * Tied-aware percentile rank: (count<x + 0.5 * count==x) / N * 100.
 * Returns 0 for an empty sample so the caller can short-circuit upstream.
 * Output is rounded to an integer 0–100.
 */
export function percentileRank(values: number[], target: number): number {
  if (values.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < target) below++;
    else if (v === target) equal++;
  }
  const rank = ((below + 0.5 * equal) / values.length) * 100;
  return Math.round(rank);
}

/**
 * Map a percentile rank (0–100) to a Chinese descriptive bucket. Cutoffs
 * are intentionally describing position, not quality — no "good"/"bad".
 */
export function classifyBucket(rank: number): BucketLabel {
  if (rank >= 90) return "top 10%";
  if (rank >= 75) return "top 25%";
  if (rank > 25) return "中位附近";
  if (rank > 10) return "bottom 25%";
  return "bottom 10%";
}

/**
 * Compute the headline stats the skill returns: win-rate, net return % quartiles,
 * mean + median hold hours. Outcomes/holdHours are positional arrays —
 * caller is responsible for aligning them with the returnValues array.
 */
export function summarizeSample(
  returnValues: number[],
  outcomes: Array<"win" | "loss" | "breakeven">,
  holdHours: number[]
): SampleSummary {
  if (returnValues.length === 0) {
    return {
      winRate: 0,
      medianReturnPct: 0,
      p25ReturnPct: 0,
      p75ReturnPct: 0,
      avgHoldHours: 0,
      medianHoldHours: 0,
    };
  }
  const wins = outcomes.filter(o => o === "win").length;
  const winRate = (wins / outcomes.length) * 100;
  const avgHold =
    holdHours.length === 0
      ? 0
      : holdHours.reduce((a, b) => a + b, 0) / holdHours.length;
  return {
    winRate,
    medianReturnPct: quantile(returnValues, 0.5),
    p25ReturnPct: quantile(returnValues, 0.25),
    p75ReturnPct: quantile(returnValues, 0.75),
    avgHoldHours: avgHold,
    medianHoldHours: quantile(holdHours, 0.5),
  };
}
