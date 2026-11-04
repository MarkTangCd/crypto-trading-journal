// Exact decimal-string arithmetic for exchange facts (prices, quantities,
// money). Values are parsed to BigInt units at an explicit scale, operated on
// exactly, and formatted back without trailing zeros. Never use Number here.

const DECIMAL_INPUT_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

interface Scaled {
  units: bigint;
  scale: number;
}

function parse(input: string): Scaled {
  const value = input.trim();

  if (!DECIMAL_INPUT_PATTERN.test(value)) {
    throw new Error(`Invalid decimal string: "${input}"`);
  }

  const isNegative = value.startsWith("-");
  const unsigned = value.startsWith("+") || isNegative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const units = BigInt(`${whole}${fraction}`);

  return { units: isNegative ? -units : units, scale: fraction.length };
}

function rescale(value: Scaled, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function align(a: Scaled, b: Scaled): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [rescale(a, scale), rescale(b, scale), scale];
}

function format(units: bigint, scale: number): string {
  if (units === 0n) {
    return "0";
  }

  const isNegative = units < 0n;
  const digits = (isNegative ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  const text = fraction === "" ? whole : `${whole}.${fraction}`;

  return isNegative ? `-${text}` : text;
}

export function add(values: string[]): string {
  let total: Scaled = { units: 0n, scale: 0 };

  for (const value of values) {
    const [left, right, scale] = align(total, parse(value));
    total = { units: left + right, scale };
  }

  return format(total.units, total.scale);
}

export function sub(a: string, b: string): string {
  const [left, right, scale] = align(parse(a), parse(b));
  return format(left - right, scale);
}

export function mul(a: string, b: string): string {
  const left = parse(a);
  const right = parse(b);
  return format(left.units * right.units, left.scale + right.scale);
}

/** Divides a by b and rounds half-up (ties away from zero) to `scale` places. */
export function div(a: string, b: string, scale: number): string {
  const dividend = parse(a);
  const divisor = parse(b);

  if (divisor.units === 0n) {
    throw new Error(`Division by zero: "${a}" / "${b}"`);
  }

  // Scale the fraction so the integer quotient carries `scale` + 1 digits of
  // fraction, then round the extra digit half-up (ties away from zero).
  const shift = scale + 1 + divisor.scale - dividend.scale;
  const numerator =
    shift >= 0 ? dividend.units * 10n ** BigInt(shift) : dividend.units;
  const denominator =
    shift >= 0 ? divisor.units : divisor.units * 10n ** BigInt(-shift);
  const quotient = numerator / denominator;
  const isNegative = quotient < 0n;
  const magnitude = isNegative ? -quotient : quotient;
  const rounded = (magnitude + 5n) / 10n;

  return format(isNegative ? -rounded : rounded, scale);
}

export function compare(a: string, b: string): number {
  const [left, right] = align(parse(a), parse(b));

  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

export function abs(value: string): string {
  const parsed = parse(value);
  return format(parsed.units < 0n ? -parsed.units : parsed.units, parsed.scale);
}

export function min(a: string, b: string): string {
  return compare(a, b) <= 0 ? normalize(a) : normalize(b);
}

export function negate(value: string): string {
  const parsed = parse(value);
  return format(-parsed.units, parsed.scale);
}

export function isZero(value: string): boolean {
  return parse(value).units === 0n;
}

export function isNegative(value: string): boolean {
  return parse(value).units < 0n;
}

/** Canonical form: validated, no sign on zero, no trailing zeros. */
export function normalize(value: string): string {
  const parsed = parse(value);
  return format(parsed.units, parsed.scale);
}
