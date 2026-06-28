import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { fetchCandleWindowAround, type Candle } from "../../_core/coinank";
import {
  classifyTrend,
  clusterPrices,
  computeATR,
  detectFractals,
  type Swing,
} from "./_helpers/marketStructure";

// Keep in sync with INTERVAL_MAP keys in server/_core/coinank.ts —
// matches the get_klines skill so the agent reuses a familiar enum.
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

const MIN_CANDLES = 30;
const DEFAULT_LOOKBACK = 150;
const MAX_LOOKBACK = 500;
const SWING_LIMIT = 20;
const ZONE_LIMIT = 5;
const PRICE_DECIMALS = 4;
const CLUSTER_THRESHOLD_PCT = 0.003;
const TREND_RECENT_BARS = 14;

const parameters = z.object({
  tradingPair: z
    .string()
    .min(1)
    .describe("Trading pair, e.g. BTCUSDT. Normalized to uppercase."),
  timeFrame: z
    .enum(TIME_FRAMES)
    .describe("Candle interval, e.g. 1H, 4H, 1D. Case-sensitive."),
  lookback: z
    .number()
    .int()
    .min(MIN_CANDLES)
    .max(MAX_LOOKBACK)
    .default(DEFAULT_LOOKBACK)
    .describe(
      `Number of candles to analyse, ${MIN_CANDLES}–${MAX_LOOKBACK}. Default ${DEFAULT_LOOKBACK}.`
    ),
  anchorMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Optional anchor timestamp in MILLISECONDS for historical replay. Defaults to now."
    ),
});

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function shortenSwing(s: Swing): Swing {
  return { ts: s.ts, price: round(s.price, PRICE_DECIMALS), kind: s.kind };
}

function takeLast<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

interface OkResult {
  ok: true;
  tradingPair: string;
  timeFrame: (typeof TIME_FRAMES)[number];
  lookbackUsed: number;
  recentTrend: "up" | "down" | "range";
  swings: Swing[];
  supportZones: { price: number; hits: number }[];
  resistanceZones: { price: number; hits: number }[];
}

interface ErrResult {
  ok: false;
  error: string;
}

function analyse(
  candles: Candle[],
  tradingPair: string,
  timeFrame: (typeof TIME_FRAMES)[number]
): OkResult {
  const swings = detectFractals(candles, 2);
  const atr = computeATR(candles, 14);
  const recent = takeLast(candles, TREND_RECENT_BARS);
  const recentTrend = classifyTrend(swings, recent, atr, 0.5);

  // Cluster only the most recent swings so old structure doesn't dominate.
  const recentSwings = takeLast(swings, SWING_LIMIT);
  const lastClose = candles[candles.length - 1]!.close;
  const supportSeed = recentSwings
    .filter(s => s.price < lastClose)
    .map(s => s.price);
  const resistanceSeed = recentSwings
    .filter(s => s.price > lastClose)
    .map(s => s.price);

  const supportZones = clusterPrices(supportSeed, CLUSTER_THRESHOLD_PCT)
    .slice(0, ZONE_LIMIT)
    .map(z => ({ price: round(z.price, PRICE_DECIMALS), hits: z.hits }));
  const resistanceZones = clusterPrices(resistanceSeed, CLUSTER_THRESHOLD_PCT)
    .slice(0, ZONE_LIMIT)
    .map(z => ({ price: round(z.price, PRICE_DECIMALS), hits: z.hits }));

  return {
    ok: true,
    tradingPair,
    timeFrame,
    lookbackUsed: candles.length,
    recentTrend,
    swings: recentSwings.map(shortenSwing),
    supportZones,
    resistanceZones,
  };
}

export const analyzeMarketStructureSkill: Skill<typeof parameters> = {
  name: "analyze_market_structure",
  category: "analysis",
  description:
    "Extract swing highs/lows, current trend direction (up/down/range), and clustered support/resistance zones from a recent candle window. Use this so review can describe structure precisely instead of vague phrases like 'broke out'.",
  parameters,
  async run(args): Promise<OkResult | ErrResult> {
    const tradingPair = args.tradingPair.toUpperCase();
    const anchorMs = args.anchorMs ?? Date.now();
    const halfSize = Math.ceil(args.lookback / 2);

    let candles: Candle[];
    try {
      const window = await fetchCandleWindowAround({
        tradingPair,
        timeFrame: args.timeFrame,
        anchorMs,
        halfSize,
      });
      candles = window.candles;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `获取 K 线失败：${message}` };
    }

    if (candles.length < MIN_CANDLES) {
      return {
        ok: false,
        error: `K 线不足：仅取到 ${candles.length} 根，最少需要 ${MIN_CANDLES} 根。`,
      };
    }

    const trimmed = takeLast(candles, args.lookback);
    return analyse(trimmed, tradingPair, args.timeFrame);
  },
};

register(analyzeMarketStructureSkill);
