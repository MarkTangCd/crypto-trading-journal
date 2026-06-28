import { describe, expect, it } from "vitest";
import {
  classifyBucket,
  percentileRank,
  quantile,
  summarizeSample,
} from "./baseline";

describe("quantile", () => {
  it("returns 0 for empty input", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("returns the only value for a single-element array", () => {
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([7], 0.5)).toBe(7);
    expect(quantile([7], 0.75)).toBe(7);
  });

  it("interpolates linearly between bracketing values", () => {
    // sorted [1,2,3,4,5], q=0.5 → pos=2 → 3
    expect(quantile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    // q=0.25 → pos=1 → 2
    expect(quantile([5, 1, 4, 2, 3], 0.25)).toBe(2);
    // q=0.75 → pos=3 → 4
    expect(quantile([5, 1, 4, 2, 3], 0.75)).toBe(4);
  });

  it("clamps q outside [0,1] to the nearest endpoint", () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 5)).toBe(3);
  });
});

describe("percentileRank", () => {
  it("returns 0 for an empty sample", () => {
    expect(percentileRank([], 1.5)).toBe(0);
  });

  it("handles strict-greater target", () => {
    // 4 values < 5, none equal → 100%
    expect(percentileRank([1, 2, 3, 4], 5)).toBe(100);
  });

  it("handles strict-less target", () => {
    // 0 values < 0, none equal → 0%
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
  });

  it("averages ties via the 0.5 weight", () => {
    // sample [1,2,2,2,3], target=2: below=1, equal=3 → (1 + 1.5)/5 = 0.5 → 50
    expect(percentileRank([1, 2, 2, 2, 3], 2)).toBe(50);
  });

  it("rounds to an integer", () => {
    // sample [1,2,3], target=2: below=1, equal=1 → (1 + 0.5)/3 ≈ 0.5 → 50
    expect(percentileRank([1, 2, 3], 2)).toBe(50);
  });
});

describe("classifyBucket", () => {
  it("maps high ranks to top buckets", () => {
    expect(classifyBucket(100)).toBe("top 10%");
    expect(classifyBucket(90)).toBe("top 10%");
    expect(classifyBucket(89)).toBe("top 25%");
    expect(classifyBucket(75)).toBe("top 25%");
  });

  it("maps middle ranks to 中位附近", () => {
    expect(classifyBucket(74)).toBe("中位附近");
    expect(classifyBucket(50)).toBe("中位附近");
    expect(classifyBucket(26)).toBe("中位附近");
  });

  it("maps low ranks to bottom buckets", () => {
    expect(classifyBucket(25)).toBe("bottom 25%");
    expect(classifyBucket(11)).toBe("bottom 25%");
    expect(classifyBucket(10)).toBe("bottom 10%");
    expect(classifyBucket(0)).toBe("bottom 10%");
  });
});

describe("summarizeSample", () => {
  it("returns zeros for empty input", () => {
    const summary = summarizeSample([], [], []);
    expect(summary).toEqual({
      winRate: 0,
      medianR: 0,
      p25R: 0,
      p75R: 0,
      avgHoldHours: 0,
      medianHoldHours: 0,
    });
  });

  it("computes winRate from outcomes", () => {
    const summary = summarizeSample(
      [1, 2, 3, 4],
      ["win", "win", "loss", "breakeven"],
      [1, 1, 1, 1]
    );
    expect(summary.winRate).toBe(50);
  });

  it("returns r:r quartiles + hold stats for a synthetic 5-trade sample", () => {
    const summary = summarizeSample(
      [1, 2, 3, 4, 5],
      ["win", "loss", "win", "loss", "win"],
      [2, 4, 6, 8, 10]
    );
    expect(summary.medianR).toBe(3);
    expect(summary.p25R).toBe(2);
    expect(summary.p75R).toBe(4);
    expect(summary.avgHoldHours).toBe(6);
    expect(summary.medianHoldHours).toBe(6);
    expect(summary.winRate).toBeCloseTo(60);
  });
});
