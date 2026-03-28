import { describe, expect, it } from "vitest";

import { add, compare, normalize } from "./fixedPoint";

describe("fixedPoint.normalize", () => {
  it("canonicalizes decimal-like inputs to 2 decimal places", () => {
    expect(normalize("2.5")).toBe("2.50");
    expect(normalize("2")).toBe("2.00");
    expect(normalize("+12.3")).toBe("12.30");
    expect(normalize("00012.340")).toBe("12.34");
    expect(normalize(" 7.5 ")).toBe("7.50");
  });

  it("rounds to the locked scale using integer arithmetic", () => {
    expect(normalize("1.234")).toBe("1.23");
    expect(normalize("1.235")).toBe("1.24");
    expect(normalize("0.005")).toBe("0.01");
    expect(normalize("-1.234")).toBe("-1.23");
    expect(normalize("-1.235")).toBe("-1.24");
    expect(normalize("-0.005")).toBe("-0.01");
    expect(normalize("-0.004")).toBe("0.00");
  });

  it("throws on malformed decimal strings", () => {
    const invalidInputs = [
      "",
      " ",
      ".",
      "+",
      "-",
      ".5",
      "1.",
      "1..2",
      "1.2.3",
      "1a",
      "1,23",
      "--1",
      "-+1",
      "NaN",
    ];

    for (const invalidInput of invalidInputs) {
      expect(() => normalize(invalidInput)).toThrow(/Invalid decimal string/);
    }
  });
});

describe("fixedPoint.compare", () => {
  it("compares decimal-like strings numerically", () => {
    expect(compare("10.05", "2.10")).toBeGreaterThan(0);
    expect(compare("-2.10", "-10.05")).toBeGreaterThan(0);
    expect(compare("1.005", "1.00")).toBeGreaterThan(0);
    expect(compare("1.234", "1.23")).toBe(0);
    expect(compare("-1.235", "-1.24")).toBe(0);
    expect(compare("0", "-0.0001")).toBe(0);
  });
});

describe("fixedPoint.add", () => {
  it("adds values without floating-point precision issues", () => {
    expect(add(["10.05", "-1.25"])).toBe("8.80");
    expect(add(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(add(["-2.55", "1.10", "0.45"])).toBe("-1.00");
    expect(add(["1.005", "1.005"])).toBe("2.02");
  });

  it("handles edge cases including empty arrays and large values", () => {
    expect(add([])).toBe("0.00");
    expect(add(["0", "-0", "0.0001"])).toBe("0.00");
    expect(add(["9007199254740991.99", "0.01"])).toBe("9007199254740992.00");
  });
});
