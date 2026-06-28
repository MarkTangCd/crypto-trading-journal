// Mirrors server-side calculatePlannedRiskRewardRatio in server/_core/tradeMath.ts.
// Keep the two implementations aligned if the server formula changes.

export type Direction = "long" | "short" | "";

// Decimal input pattern matching the server's tradeMath parser.
export const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function parsePositiveDecimal(input: string): number | null {
  const value = input.trim();
  if (!DECIMAL_PATTERN.test(value)) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type PlannedRrPreview =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; value: number };

export function previewPlannedRiskReward(
  direction: Direction,
  entryStr: string,
  stopStr: string,
  targetStr: string
): PlannedRrPreview {
  if (!direction || !entryStr || !stopStr || !targetStr) {
    return { kind: "empty" };
  }
  const entry = parsePositiveDecimal(entryStr);
  const stop = parsePositiveDecimal(stopStr);
  const target = parsePositiveDecimal(targetStr);
  if (entry === null || stop === null || target === null) {
    return { kind: "invalid", reason: "enter positive decimals" };
  }
  if (direction === "long") {
    if (stop >= entry) {
      return { kind: "invalid", reason: "stop must be below entry" };
    }
    if (target <= entry) {
      return { kind: "invalid", reason: "target must be above entry" };
    }
    return { kind: "ok", value: (target - entry) / (entry - stop) };
  }
  // short
  if (stop <= entry) {
    return { kind: "invalid", reason: "stop must be above entry" };
  }
  if (target >= entry) {
    return { kind: "invalid", reason: "target must be below entry" };
  }
  return { kind: "ok", value: (entry - target) / (stop - entry) };
}
