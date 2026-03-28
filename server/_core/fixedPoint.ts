const SCALE = 2;
const DECIMAL_INPUT_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

function trimLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+/, "");
  return trimmed === "" ? "0" : trimmed;
}

function normalizeSignedInteger(value: string): string {
  const isNegative = value.startsWith("-");
  const absolute = trimLeadingZeros(isNegative ? value.slice(1) : value);

  if (absolute === "0") {
    return "0";
  }

  return isNegative ? `-${absolute}` : absolute;
}

function compareNonNegativeIntegers(a: string, b: string): number {
  const left = trimLeadingZeros(a);
  const right = trimLeadingZeros(b);

  if (left.length !== right.length) {
    return left.length > right.length ? 1 : -1;
  }

  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function addNonNegativeIntegers(a: string, b: string): string {
  let carry = 0;
  let result = "";
  let i = a.length - 1;
  let j = b.length - 1;

  while (i >= 0 || j >= 0 || carry > 0) {
    const leftDigit = i >= 0 ? Number(a[i]) : 0;
    const rightDigit = j >= 0 ? Number(b[j]) : 0;
    const sum = leftDigit + rightDigit + carry;

    result = `${sum % 10}${result}`;
    carry = Math.floor(sum / 10);
    i -= 1;
    j -= 1;
  }

  return trimLeadingZeros(result);
}

function subtractNonNegativeIntegers(a: string, b: string): string {
  let borrow = 0;
  let result = "";
  let i = a.length - 1;
  let j = b.length - 1;

  while (i >= 0) {
    let leftDigit = Number(a[i]) - borrow;
    const rightDigit = j >= 0 ? Number(b[j]) : 0;

    if (leftDigit < rightDigit) {
      leftDigit += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }

    result = `${leftDigit - rightDigit}${result}`;
    i -= 1;
    j -= 1;
  }

  return trimLeadingZeros(result);
}

function addSignedIntegers(a: string, b: string): string {
  const left = normalizeSignedInteger(a);
  const right = normalizeSignedInteger(b);

  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");
  const leftAbs = leftNegative ? left.slice(1) : left;
  const rightAbs = rightNegative ? right.slice(1) : right;

  if (leftNegative === rightNegative) {
    const absoluteSum = addNonNegativeIntegers(leftAbs, rightAbs);
    return leftNegative ? `-${absoluteSum}` : absoluteSum;
  }

  const magnitudeComparison = compareNonNegativeIntegers(leftAbs, rightAbs);

  if (magnitudeComparison === 0) {
    return "0";
  }

  if (magnitudeComparison > 0) {
    const difference = subtractNonNegativeIntegers(leftAbs, rightAbs);
    return leftNegative ? `-${difference}` : difference;
  }

  const difference = subtractNonNegativeIntegers(rightAbs, leftAbs);
  return rightNegative ? `-${difference}` : difference;
}

function compareSignedIntegers(a: string, b: string): number {
  const left = normalizeSignedInteger(a);
  const right = normalizeSignedInteger(b);

  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");

  if (leftNegative !== rightNegative) {
    return leftNegative ? -1 : 1;
  }

  const leftAbs = leftNegative ? left.slice(1) : left;
  const rightAbs = rightNegative ? right.slice(1) : right;
  const magnitudeComparison = compareNonNegativeIntegers(leftAbs, rightAbs);

  if (magnitudeComparison === 0) {
    return 0;
  }

  if (!leftNegative) {
    return magnitudeComparison;
  }

  return magnitudeComparison * -1;
}

function parseToScaledUnits(input: string): string {
  const value = input.trim();

  if (!DECIMAL_INPUT_PATTERN.test(value)) {
    throw new Error(`Invalid decimal string: "${input}"`);
  }

  const isNegative = value.startsWith("-");
  const unsignedValue =
    value.startsWith("+") || isNegative ? value.slice(1) : value;
  const [wholePart, fractionalPart = ""] = unsignedValue.split(".");
  const scaledFraction = fractionalPart.slice(0, SCALE).padEnd(SCALE, "0");
  let scaledUnits = trimLeadingZeros(`${wholePart}${scaledFraction}`);
  const roundingDigit =
    fractionalPart.length > SCALE ? Number(fractionalPart[SCALE]) : 0;

  if (roundingDigit >= 5) {
    scaledUnits = addNonNegativeIntegers(scaledUnits, "1");
  }

  if (scaledUnits === "0") {
    return "0";
  }

  return isNegative ? `-${scaledUnits}` : scaledUnits;
}

function formatScaledUnits(units: string): string {
  const normalizedUnits = normalizeSignedInteger(units);

  if (normalizedUnits === "0") {
    return "0.00";
  }

  const isNegative = normalizedUnits.startsWith("-");
  const absoluteUnits = isNegative ? normalizedUnits.slice(1) : normalizedUnits;
  const paddedUnits = absoluteUnits.padStart(SCALE + 1, "0");
  const splitIndex = paddedUnits.length - SCALE;
  const wholePart = trimLeadingZeros(paddedUnits.slice(0, splitIndex));
  const fractionPart = paddedUnits.slice(splitIndex);

  return `${isNegative ? "-" : ""}${wholePart}.${fractionPart}`;
}

export function normalize(input: string): string {
  return formatScaledUnits(parseToScaledUnits(input));
}

export function compare(a: string, b: string): number {
  const left = parseToScaledUnits(a);
  const right = parseToScaledUnits(b);

  return compareSignedIntegers(left, right);
}

export function add(values: string[]): string {
  const sum = values.reduce((total, value) => {
    return addSignedIntegers(total, parseToScaledUnits(value));
  }, "0");

  return formatScaledUnits(sum);
}
