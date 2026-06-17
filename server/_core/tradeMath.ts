/**
 * Trade math — server-authoritative price / ratio / return calculations.
 *
 * Uses BigInt scaled integer arithmetic so price math stays exact:
 *   PRICE_SCALE = 8 decimal places (enough for any crypto pair)
 *   MONEY_SCALE = 2 decimal places (matches fixedPoint USDT accounting)
 *   RATIO_SCALE = 2 decimal places (planned/actual R/R)
 *
 * All `calculate*` functions accept canonical decimal strings and return
 * canonical decimal strings at the appropriate scale. Validation errors and
 * division-by-zero throw `TradeMathError`; routers translate that to
 * BAD_REQUEST.
 */

const PRICE_SCALE = 8;
const MONEY_SCALE = 2;
const RATIO_SCALE = 2;

const DECIMAL_INPUT_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

export type TradeDirection = "long" | "short";

export class TradeMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeMathError";
  }
}

export const TRADE_MATH_SCALES = {
  PRICE_SCALE,
  MONEY_SCALE,
  RATIO_SCALE,
} as const;

function parseDecimalToScaled(
  input: string,
  scale: number,
  label: string
): bigint {
  if (typeof input !== "string") {
    throw new TradeMathError(`${label} must be a decimal string`);
  }
  const value = input.trim();
  if (!DECIMAL_INPUT_PATTERN.test(value)) {
    throw new TradeMathError(
      `${label} must be a decimal string, got "${input}"`
    );
  }
  const isNegative = value.startsWith("-");
  const unsigned =
    value.startsWith("+") || isNegative ? value.slice(1) : value;
  const [whole, fractional = ""] = unsigned.split(".");
  if (fractional.length > scale) {
    throw new TradeMathError(
      `${label} must have at most ${scale} decimal places, got "${input}"`
    );
  }
  const padded = fractional.padEnd(scale, "0");
  // Strip leading zeros while keeping at least one digit so BigInt accepts it.
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  const magnitude = BigInt(combined);
  return isNegative ? -magnitude : magnitude;
}

function formatScaledToDecimal(value: bigint, scale: number): string {
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const factor = 10n ** BigInt(scale);
  const whole = abs / factor;
  const fraction = abs % factor;
  const fractionStr = fraction.toString().padStart(scale, "0");
  return `${isNegative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

/**
 * Compute `numerator / denominator` rounded half-away-from-zero to
 * `resultScale` decimal places. `numScale` / `denScale` describe the scales
 * of the input BigInts (i.e. their implicit decimal place).
 */
function divideAndRound(
  numerator: bigint,
  denominator: bigint,
  resultScale: number,
  numScale: number,
  denScale: number
): bigint {
  if (denominator === 0n) {
    throw new TradeMathError("Division by zero in trade calculation");
  }

  const sign =
    (numerator < 0n) !== (denominator < 0n) && numerator !== 0n ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  // num/den has implicit scale (numScale - denScale). We want the result at
  // `resultScale`, so adjust by netScale, plus one extra digit for half-up.
  const netScale = resultScale - (numScale - denScale);

  let scaledNum: bigint;
  let scaledDen: bigint;
  if (netScale >= 0) {
    scaledNum = absNum * 10n ** BigInt(netScale + 1);
    scaledDen = absDen;
  } else {
    scaledNum = absNum * 10n;
    scaledDen = absDen * 10n ** BigInt(-netScale);
  }

  const quotient = scaledNum / scaledDen;
  const lastDigit = quotient % 10n;
  const truncated = quotient / 10n;
  const rounded = lastDigit >= 5n ? truncated + 1n : truncated;
  return sign * rounded;
}

function parsePositivePrice(input: string, label: string): bigint {
  const value = parseDecimalToScaled(input, PRICE_SCALE, label);
  if (value <= 0n) {
    throw new TradeMathError(`${label} must be greater than zero`);
  }
  return value;
}

function parsePositiveMoney(input: string, label: string): bigint {
  const value = parseDecimalToScaled(input, MONEY_SCALE, label);
  if (value <= 0n) {
    throw new TradeMathError(`${label} must be greater than zero`);
  }
  return value;
}

export function normalizePrice(input: string): string {
  return formatScaledToDecimal(
    parsePositivePrice(input, "price"),
    PRICE_SCALE
  );
}

export function normalizeMoney(input: string): string {
  return formatScaledToDecimal(
    parsePositiveMoney(input, "money amount"),
    MONEY_SCALE
  );
}

interface PlannedRiskRewardInput {
  direction: TradeDirection;
  entryPrice: string;
  plannedStopLossPrice: string;
  plannedTakeProfitPrice: string;
}

interface ActualRiskRewardInput {
  direction: TradeDirection;
  entryPrice: string;
  plannedStopLossPrice: string;
  exitPrice: string;
}

interface ReturnAmountInput {
  direction: TradeDirection;
  entryPrice: string;
  positionSizeUsdt: string;
  exitPrice: string;
}

function assertPlannedPriceShape(
  direction: TradeDirection,
  entry: bigint,
  stopLoss: bigint,
  takeProfit: bigint
): void {
  if (direction === "long") {
    if (stopLoss >= entry) {
      throw new TradeMathError(
        "Planned stop loss must be below entry price for a long trade"
      );
    }
    if (takeProfit <= entry) {
      throw new TradeMathError(
        "Planned take profit must be above entry price for a long trade"
      );
    }
  } else {
    if (stopLoss <= entry) {
      throw new TradeMathError(
        "Planned stop loss must be above entry price for a short trade"
      );
    }
    if (takeProfit >= entry) {
      throw new TradeMathError(
        "Planned take profit must be below entry price for a short trade"
      );
    }
  }
}

function assertActualPriceShape(
  direction: TradeDirection,
  entry: bigint,
  stopLoss: bigint
): void {
  if (direction === "long" && stopLoss >= entry) {
    throw new TradeMathError(
      "Planned stop loss must be below entry price for a long trade"
    );
  }
  if (direction === "short" && stopLoss <= entry) {
    throw new TradeMathError(
      "Planned stop loss must be above entry price for a short trade"
    );
  }
}

/**
 * Planned R/R using the user's directional formula:
 *   long:  (TP - entry) / (entry - SL)
 *   short: (entry - TP) / (SL - entry)
 * Both numerator and denominator are positive when the price relationship is
 * valid, so the result is always non-negative.
 */
export function calculatePlannedRiskRewardRatio(
  input: PlannedRiskRewardInput
): string {
  const entry = parsePositivePrice(input.entryPrice, "entry price");
  const stopLoss = parsePositivePrice(
    input.plannedStopLossPrice,
    "planned stop loss price"
  );
  const takeProfit = parsePositivePrice(
    input.plannedTakeProfitPrice,
    "planned take profit price"
  );

  assertPlannedPriceShape(input.direction, entry, stopLoss, takeProfit);

  const reward =
    input.direction === "long" ? takeProfit - entry : entry - takeProfit;
  const risk =
    input.direction === "long" ? entry - stopLoss : stopLoss - entry;

  const ratio = divideAndRound(
    reward,
    risk,
    RATIO_SCALE,
    PRICE_SCALE,
    PRICE_SCALE
  );
  return formatScaledToDecimal(ratio, RATIO_SCALE);
}

/**
 * Actual R/R uses the planned stop loss as the risk denominator so the result
 * is directly comparable to the planned ratio. Negative results indicate the
 * trade closed against the plan.
 *   long:  (exit - entry) / (entry - SL)
 *   short: (entry - exit) / (SL - entry)
 */
export function calculateActualRiskRewardRatio(
  input: ActualRiskRewardInput
): string {
  const entry = parsePositivePrice(input.entryPrice, "entry price");
  const stopLoss = parsePositivePrice(
    input.plannedStopLossPrice,
    "planned stop loss price"
  );
  const exit = parsePositivePrice(input.exitPrice, "exit price");

  assertActualPriceShape(input.direction, entry, stopLoss);

  const reward = input.direction === "long" ? exit - entry : entry - exit;
  const risk =
    input.direction === "long" ? entry - stopLoss : stopLoss - entry;

  const ratio = divideAndRound(
    reward,
    risk,
    RATIO_SCALE,
    PRICE_SCALE,
    PRICE_SCALE
  );
  return formatScaledToDecimal(ratio, RATIO_SCALE);
}

/**
 * Return amount in USDT:
 *   long:  positionSizeUsdt * (exit - entry) / entry
 *   short: positionSizeUsdt * (entry - exit) / entry
 */
export function calculateReturnAmount(input: ReturnAmountInput): string {
  const entry = parsePositivePrice(input.entryPrice, "entry price");
  const positionSize = parsePositiveMoney(
    input.positionSizeUsdt,
    "position size"
  );
  const exit = parsePositivePrice(input.exitPrice, "exit price");

  const priceDelta = input.direction === "long" ? exit - entry : entry - exit;
  // positionSize at MONEY_SCALE, priceDelta at PRICE_SCALE -> numerator scale = MONEY_SCALE + PRICE_SCALE
  const numerator = positionSize * priceDelta;
  const scaled = divideAndRound(
    numerator,
    entry,
    MONEY_SCALE,
    MONEY_SCALE + PRICE_SCALE,
    PRICE_SCALE
  );
  return formatScaledToDecimal(scaled, MONEY_SCALE);
}

export function deriveOutcome(
  returnAmount: string
): "win" | "loss" | "breakeven" {
  const value = parseDecimalToScaled(returnAmount, MONEY_SCALE, "return amount");
  if (value > 0n) return "win";
  if (value < 0n) return "loss";
  return "breakeven";
}
