import { describe, expect, it } from "vitest";
import { previewPositionSize } from "./positionSize";

const base = {
  direction: "long" as const,
  riskUsdt: "30",
  entry: "100",
  stop: "99.5", // 0.5% stop
  target: "",
  capital: "3000",
};

describe("previewPositionSize", () => {
  it("scenario A: narrow stop -> leveraged (2x)", () => {
    const r = previewPositionSize(base);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.positionSizeUsdt).toBe(6000); // 30 / 0.5%
    expect(r.leverageInfo?.partial).toBe(false);
    expect(r.leverageInfo?.leverage).toBe(2); // 6000 / 3000
    expect(r.leverageInfo?.margin).toBe(3000);
  });

  it("scenario B: wide stop -> partial, 1x, half margin", () => {
    const r = previewPositionSize({ ...base, stop: "98" }); // 2% stop
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.positionSizeUsdt).toBe(1500); // 30 / 2%
    expect(r.leverageInfo?.partial).toBe(true);
    expect(r.leverageInfo?.leverage).toBe(1);
    expect(r.leverageInfo?.margin).toBe(1500);
    expect(r.leverageInfo?.pctOfCapital).toBe(0.5);
  });

  it("flags high leverage above threshold", () => {
    const r = previewPositionSize({ ...base, stop: "99.9" }); // 0.1% -> 30000 notional
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.leverageInfo?.leverage).toBe(10); // 30000 / 3000
    expect(r.leverageInfo?.highLeverage).toBe(true);
  });

  it("does not flag notional > capital when leverage stays low", () => {
    const r = previewPositionSize({ ...base, capital: "1000" }); // 6000 / 1000 = 6x
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.leverageInfo?.leverage).toBe(6);
    expect(r.leverageInfo?.highLeverage).toBe(true); // 6 > 5
  });

  it("rejects stop on the wrong side for long", () => {
    const r = previewPositionSize({ ...base, stop: "101" });
    expect(r).toEqual({ kind: "invalid", reason: "stop must be below entry" });
  });

  it("rejects stop equal to entry (division by zero)", () => {
    const r = previewPositionSize({ ...base, stop: "100" });
    expect(r).toEqual({
      kind: "invalid",
      reason: "stop loss must differ from entry",
    });
  });

  it("computes rr and expected profit when a valid target is given", () => {
    const r = previewPositionSize({ ...base, target: "101" }); // reward 1, risk 0.5 -> 2R
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rr).toBe(2);
    expect(r.expectedProfit).toBe(60); // 30 * 2
  });

  it("keeps position size but drops rr when target is invalid", () => {
    const r = previewPositionSize({ ...base, target: "99" }); // below entry for long
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.positionSizeUsdt).toBe(6000);
    expect(r.rr).toBeNull();
    expect(r.expectedProfit).toBeNull();
  });

  it("omits leverage info when capital is missing", () => {
    const r = previewPositionSize({ ...base, capital: "" });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.positionSizeUsdt).toBe(6000);
    expect(r.leverageInfo).toBeNull();
  });

  it("is empty until required fields are present", () => {
    expect(previewPositionSize({ ...base, stop: "" }).kind).toBe("empty");
  });
});
