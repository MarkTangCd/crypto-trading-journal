import { describe, expect, it } from "vitest";

import {
  TradeMathError,
  calculateActualRiskRewardRatio,
  calculatePlannedRiskRewardRatio,
  calculateReturnAmount,
  deriveOutcome,
  normalizeMoney,
  normalizePrice,
} from "./tradeMath";

describe("normalizePrice", () => {
  it("canonicalises decimal-like inputs to 8 decimal places", () => {
    expect(normalizePrice("100")).toBe("100.00000000");
    expect(normalizePrice("0.5")).toBe("0.50000000");
    expect(normalizePrice("12345.6789")).toBe("12345.67890000");
    expect(normalizePrice(" 99.99999999 ")).toBe("99.99999999");
  });

  it("rejects non-positive prices", () => {
    expect(() => normalizePrice("0")).toThrow(TradeMathError);
    expect(() => normalizePrice("-1")).toThrow(TradeMathError);
  });

  it("rejects malformed or over-precise prices", () => {
    expect(() => normalizePrice("abc")).toThrow(TradeMathError);
    expect(() => normalizePrice("1.123456789")).toThrow(TradeMathError);
    expect(() => normalizePrice("")).toThrow(TradeMathError);
    expect(() => normalizePrice(".5")).toThrow(TradeMathError);
  });
});

describe("normalizeMoney", () => {
  it("canonicalises to 2 decimal places", () => {
    expect(normalizeMoney("1000")).toBe("1000.00");
    expect(normalizeMoney("1000.5")).toBe("1000.50");
  });

  it("rejects non-positive amounts and over-precise inputs", () => {
    expect(() => normalizeMoney("0")).toThrow(TradeMathError);
    expect(() => normalizeMoney("-5")).toThrow(TradeMathError);
    expect(() => normalizeMoney("1.234")).toThrow(TradeMathError);
  });
});

describe("calculatePlannedRiskRewardRatio", () => {
  it("computes planned R/R for a long trade", () => {
    expect(
      calculatePlannedRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "95",
        plannedTakeProfitPrice: "110",
      })
    ).toBe("2.00");
  });

  it("computes planned R/R for a short trade", () => {
    expect(
      calculatePlannedRiskRewardRatio({
        direction: "short",
        entryPrice: "100",
        plannedStopLossPrice: "105",
        plannedTakeProfitPrice: "90",
      })
    ).toBe("2.00");
  });

  it("rounds to two decimal places using half-up rounding", () => {
    expect(
      calculatePlannedRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "97",
        plannedTakeProfitPrice: "110",
      })
    ).toBe("3.33");
  });

  it("rejects a long trade with stop loss above entry", () => {
    expect(() =>
      calculatePlannedRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "105",
        plannedTakeProfitPrice: "110",
      })
    ).toThrow(TradeMathError);
  });

  it("rejects a long trade with take profit below entry", () => {
    expect(() =>
      calculatePlannedRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "95",
        plannedTakeProfitPrice: "90",
      })
    ).toThrow(TradeMathError);
  });

  it("rejects a short trade with stop loss below entry", () => {
    expect(() =>
      calculatePlannedRiskRewardRatio({
        direction: "short",
        entryPrice: "100",
        plannedStopLossPrice: "95",
        plannedTakeProfitPrice: "90",
      })
    ).toThrow(TradeMathError);
  });
});

describe("calculateActualRiskRewardRatio", () => {
  it("computes a winning long trade as positive", () => {
    expect(
      calculateActualRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "95",
        exitPrice: "110",
      })
    ).toBe("2.00");
  });

  it("computes a losing long trade as negative", () => {
    expect(
      calculateActualRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "95",
        exitPrice: "98",
      })
    ).toBe("-0.40");
  });

  it("computes a winning short trade as positive", () => {
    expect(
      calculateActualRiskRewardRatio({
        direction: "short",
        entryPrice: "100",
        plannedStopLossPrice: "105",
        exitPrice: "90",
      })
    ).toBe("2.00");
  });

  it("computes a losing short trade as negative", () => {
    expect(
      calculateActualRiskRewardRatio({
        direction: "short",
        entryPrice: "100",
        plannedStopLossPrice: "105",
        exitPrice: "102",
      })
    ).toBe("-0.40");
  });

  it("rejects a long trade with stop loss above entry", () => {
    expect(() =>
      calculateActualRiskRewardRatio({
        direction: "long",
        entryPrice: "100",
        plannedStopLossPrice: "105",
        exitPrice: "110",
      })
    ).toThrow(TradeMathError);
  });
});

describe("calculateReturnAmount", () => {
  it("computes profit for a long trade", () => {
    expect(
      calculateReturnAmount({
        direction: "long",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        exitPrice: "110",
      })
    ).toBe("100.00");
  });

  it("computes loss for a long trade", () => {
    expect(
      calculateReturnAmount({
        direction: "long",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        exitPrice: "95",
      })
    ).toBe("-50.00");
  });

  it("computes profit for a short trade", () => {
    expect(
      calculateReturnAmount({
        direction: "short",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        exitPrice: "90",
      })
    ).toBe("100.00");
  });

  it("computes loss for a short trade", () => {
    expect(
      calculateReturnAmount({
        direction: "short",
        entryPrice: "100",
        positionSizeUsdt: "1000",
        exitPrice: "110",
      })
    ).toBe("-100.00");
  });

  it("rounds to two decimal places", () => {
    // 100 * 50.55 / 30000 = 0.1685 -> 0.17 (half-up)
    expect(
      calculateReturnAmount({
        direction: "long",
        entryPrice: "30000",
        positionSizeUsdt: "100",
        exitPrice: "30050.55",
      })
    ).toBe("0.17");
  });

  it("uses 8-decimal price precision in intermediate math", () => {
    // 1000 USDT * (0.00012345 - 0.00012340) / 0.00012340
    // = 1000 * 0.00000005 / 0.00012340
    // = 0.00005 / 0.00012340 ≈ 0.40518...
    expect(
      calculateReturnAmount({
        direction: "long",
        entryPrice: "0.00012340",
        positionSizeUsdt: "1000",
        exitPrice: "0.00012345",
      })
    ).toBe("0.41");
  });
});

describe("deriveOutcome", () => {
  it("returns win for positive return amounts", () => {
    expect(deriveOutcome("50.00")).toBe("win");
    expect(deriveOutcome("0.01")).toBe("win");
  });

  it("returns loss for negative return amounts", () => {
    expect(deriveOutcome("-25.00")).toBe("loss");
    expect(deriveOutcome("-0.01")).toBe("loss");
  });

  it("returns breakeven for zero", () => {
    expect(deriveOutcome("0.00")).toBe("breakeven");
    expect(deriveOutcome("0")).toBe("breakeven");
  });
});
