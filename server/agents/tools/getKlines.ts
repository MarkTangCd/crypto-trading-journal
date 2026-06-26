import { z } from "zod";
import { register } from "../toolRegistry";
import { fetchCandleWindowAround, type Candle } from "../../_core/coinank";

// Mirrors INTERVAL_MAP keys in server/_core/coinank.ts — keep in sync.
const TIME_FRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M",
] as const;

const DEFAULT_HALF_SIZE = 50;
const PRICE_DECIMALS = 4;
const VOLUME_DECIMALS = 2;

const parameters = z.object({
  tradingPair: z
    .string()
    .min(1)
    .describe("Trading pair, e.g. BTCUSDT. Will be normalized to uppercase."),
  timeFrame: z
    .enum(TIME_FRAMES)
    .describe("Candle interval, e.g. 1H, 4H, 1D. Case-sensitive."),
  anchorMs: z
    .number()
    .int()
    .positive()
    .describe(
      "Anchor timestamp in MILLISECONDS (not seconds). The fetched window straddles this time."
    ),
  halfSize: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(DEFAULT_HALF_SIZE)
    .describe(
      "Candle count per side of anchor; the response holds up to 2 * halfSize candles."
    ),
});

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

// Shrink precision so 100-candle windows don't blow the model's token budget.
function shorten(candle: Candle) {
  const base = {
    time: candle.time,
    open: round(candle.open, PRICE_DECIMALS),
    high: round(candle.high, PRICE_DECIMALS),
    low: round(candle.low, PRICE_DECIMALS),
    close: round(candle.close, PRICE_DECIMALS),
  };
  return candle.volume !== undefined
    ? { ...base, volume: round(candle.volume, VOLUME_DECIMALS) }
    : base;
}

register({
  name: "get_klines",
  description:
    "Fetch a window of OHLCV candles around an anchor timestamp from CoinAnk. Use this to inspect price action before and after a trade entry, scope a setup, or check follow-through after exit.",
  parameters,
  async run(args) {
    const tradingPair = args.tradingPair.toUpperCase();
    const window = await fetchCandleWindowAround({
      tradingPair,
      timeFrame: args.timeFrame,
      anchorMs: args.anchorMs,
      halfSize: args.halfSize,
    });
    return {
      tradingPair,
      timeFrame: args.timeFrame,
      anchorMs: args.anchorMs,
      entryIndex: window.entryIndex,
      before: window.before,
      after: window.after,
      candles: window.candles.map(shorten),
    };
  },
});
