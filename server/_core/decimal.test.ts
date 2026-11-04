import { describe, expect, it } from "vitest";

import {
  abs,
  add,
  compare,
  div,
  isNegative,
  isZero,
  min,
  mul,
  negate,
  normalize,
  sub,
} from "./decimal";

describe("decimal.normalize", () => {
  it("strips trailing zeros, leading zeros and signed zero", () => {
    expect(normalize("2.50")).toBe("2.5");
    expect(normalize("0012.3400")).toBe("12.34");
    expect(normalize("+7")).toBe("7");
    expect(normalize("-0.000")).toBe("0");
    expect(normalize(" 0.00000001 ")).toBe("0.00000001");
    expect(normalize("-3.10")).toBe("-3.1");
  });

  it("throws on malformed input", () => {
    for (const input of ["", ".", ".5", "1.", "1,2", "1e5", "NaN", "--1"]) {
      expect(() => normalize(input)).toThrow(/Invalid decimal string/);
    }
  });
});

describe("decimal.add", () => {
  it("adds exactly across mixed scales", () => {
    expect(add(["0.1", "0.2"])).toBe("0.3");
    expect(add(["1.00000001", "2"])).toBe("3.00000001");
    expect(add(["-2.55", "1.1", "0.45"])).toBe("-1");
    expect(add(["0.000000001", "-0.000000001"])).toBe("0");
  });

  it("handles empty input and large magnitudes", () => {
    expect(add([])).toBe("0");
    expect(add(["9007199254740991.99", "0.01"])).toBe("9007199254740992");
    expect(add(["123456789012345678901234567890.5", "0.5"])).toBe(
      "123456789012345678901234567891"
    );
  });
});

describe("decimal.sub", () => {
  it("subtracts exactly", () => {
    expect(sub("1", "0.00000001")).toBe("0.99999999");
    expect(sub("-1.5", "-1.5")).toBe("0");
    expect(sub("0.3", "0.5")).toBe("-0.2");
    expect(sub("100", "0.001")).toBe("99.999");
  });
});

describe("decimal.mul", () => {
  it("multiplies exactly", () => {
    expect(mul("0.1", "0.2")).toBe("0.02");
    expect(mul("65000.5", "0.003")).toBe("195.0015");
    expect(mul("-2", "3.25")).toBe("-6.5");
    expect(mul("1.10", "0")).toBe("0");
    expect(mul("0.00000001", "100000000")).toBe("1");
  });
});

describe("decimal.div", () => {
  it("rounds half-up to the requested scale", () => {
    expect(div("1", "3", 8)).toBe("0.33333333");
    expect(div("2", "3", 8)).toBe("0.66666667");
    expect(div("1", "8", 2)).toBe("0.13");
    expect(div("1.25", "1", 1)).toBe("1.3");
    expect(div("-1.25", "1", 1)).toBe("-1.3");
    expect(div("10", "4", 0)).toBe("3");
    expect(div("7", "2", 0)).toBe("4");
  });

  it("is exact when the quotient terminates and strips trailing zeros", () => {
    expect(div("195.0015", "0.003", 8)).toBe("65000.5");
    expect(div("1", "4", 8)).toBe("0.25");
    expect(div("0", "5", 4)).toBe("0");
  });

  it("throws on division by zero", () => {
    expect(() => div("1", "0", 2)).toThrow(/Division by zero/);
    expect(() => div("1", "0.00", 2)).toThrow(/Division by zero/);
  });
});

describe("decimal.compare", () => {
  it("compares exactly without rounding", () => {
    expect(compare("1.234", "1.23")).toBe(1);
    expect(compare("1.230", "1.23")).toBe(0);
    expect(compare("-0.0001", "0")).toBe(-1);
    expect(compare("-2.1", "-10.05")).toBe(1);
    expect(compare("0.00000001", "0.00000002")).toBe(-1);
  });
});

describe("decimal.abs / min / negate", () => {
  it("abs drops the sign", () => {
    expect(abs("-3.50")).toBe("3.5");
    expect(abs("3.5")).toBe("3.5");
    expect(abs("-0")).toBe("0");
  });

  it("min returns the smaller value in canonical form", () => {
    expect(min("0.50", "0.4")).toBe("0.4");
    expect(min("-1", "1")).toBe("-1");
    expect(min("2.0", "2")).toBe("2");
  });

  it("negate flips the sign and keeps zero unsigned", () => {
    expect(negate("1.5")).toBe("-1.5");
    expect(negate("-0.001")).toBe("0.001");
    expect(negate("0")).toBe("0");
  });
});

describe("decimal.isZero / isNegative", () => {
  it("tests sign exactly", () => {
    expect(isZero("0.000")).toBe(true);
    expect(isZero("-0")).toBe(true);
    expect(isZero("0.00000001")).toBe(false);
    expect(isNegative("-0.00000001")).toBe(true);
    expect(isNegative("-0")).toBe(false);
    expect(isNegative("1")).toBe(false);
  });
});
