// Fixed-percentage-risk position sizing for the Tools calculator.
//
// Notional position = risk amount / stop-loss distance (as a fraction).
// This scratchpad math runs client-side only; nothing is persisted. The
// direction/price validation mirrors server/_core/tradeMath.ts so the output
// can be copied straight into the New Trade form's "position size (usdt)".

import { type Direction, parsePositiveDecimal } from "@/lib/plannedRiskReward";

// Above this required leverage we surface an ink caution (never a new hue).
export const HIGH_LEVERAGE_THRESHOLD = 5;

// Capital-dependent sizing. Absent when no valid capital is available.
export type LeverageInfo = {
  // Displayed leverage: 1 when notional <= capital (sub-1x is not executable),
  // otherwise the real notional/capital multiple to set on the exchange.
  leverage: number;
  // USDT margin to actually deploy = notional / leverage.
  margin: number;
  // notional <= capital: deploy only `margin`, the rest stays idle at 1x.
  partial: boolean;
  // margin / capital, i.e. share of balance consumed (partial mode < 1).
  pctOfCapital: number;
  // leverage exceeds HIGH_LEVERAGE_THRESHOLD (only possible when leveraged).
  highLeverage: boolean;
};

export type PositionSizePreview =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "ok";
      riskUsdt: number;
      stopLossPct: number; // fraction, e.g. 0.005 for 0.5%
      positionSizeUsdt: number; // notional, 2dp
      leverageInfo: LeverageInfo | null; // null when capital is missing/invalid
      rr: number | null; // present when a valid take profit is given
      expectedProfit: number | null; // risk * rr
    };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Directional stop-loss distance as a fraction of entry, or an error reason.
function stopLossFraction(
  direction: Exclude<Direction, "">,
  entry: number,
  stop: number
): { pct: number } | { reason: string } {
  if (stop === entry) return { reason: "stop loss must differ from entry" };
  if (direction === "long" && stop >= entry) {
    return { reason: "stop must be below entry" };
  }
  if (direction === "short" && stop <= entry) {
    return { reason: "stop must be above entry" };
  }
  return { pct: Math.abs(entry - stop) / entry };
}

function computeLeverage(
  positionSizeUsdt: number,
  capital: number
): LeverageInfo {
  if (positionSizeUsdt <= capital) {
    return {
      leverage: 1,
      margin: round2(positionSizeUsdt),
      partial: true,
      pctOfCapital: positionSizeUsdt / capital,
      highLeverage: false,
    };
  }
  const leverage = positionSizeUsdt / capital;
  return {
    leverage: round2(leverage),
    margin: round2(capital),
    partial: false,
    pctOfCapital: 1,
    highLeverage: leverage > HIGH_LEVERAGE_THRESHOLD,
  };
}

// take profit only feeds R:R; invalid/missing TP leaves rr null but never
// blocks the position size.
function computeRr(
  direction: Exclude<Direction, "">,
  entry: number,
  stop: number,
  targetStr: string
): number | null {
  const target = parsePositiveDecimal(targetStr);
  if (target === null) return null;
  if (direction === "long") {
    if (target <= entry) return null;
    return (target - entry) / (entry - stop);
  }
  if (target >= entry) return null;
  return (entry - target) / (stop - entry);
}

export function previewPositionSize(input: {
  direction: Direction;
  riskUsdt: string;
  entry: string;
  stop: string;
  target: string;
  capital: string;
}): PositionSizePreview {
  const { direction, riskUsdt, entry, stop, target, capital } = input;
  if (!direction || !riskUsdt || !entry || !stop) return { kind: "empty" };

  const risk = parsePositiveDecimal(riskUsdt);
  const entryNum = parsePositiveDecimal(entry);
  const stopNum = parsePositiveDecimal(stop);
  if (risk === null || entryNum === null || stopNum === null) {
    return { kind: "invalid", reason: "enter positive decimals" };
  }

  const slice = stopLossFraction(direction, entryNum, stopNum);
  if ("reason" in slice) return { kind: "invalid", reason: slice.reason };

  const positionSizeUsdt = round2(risk / slice.pct);
  const capitalNum = parsePositiveDecimal(capital);
  const rrRaw =
    target && "pct" in slice
      ? computeRr(direction, entryNum, stopNum, target)
      : null;
  const rr = rrRaw === null ? null : round2(rrRaw);

  return {
    kind: "ok",
    riskUsdt: round2(risk),
    stopLossPct: slice.pct,
    positionSizeUsdt,
    leverageInfo:
      capitalNum === null
        ? null
        : computeLeverage(positionSizeUsdt, capitalNum),
    rr,
    expectedProfit: rr === null ? null : round2(risk * rr),
  };
}
