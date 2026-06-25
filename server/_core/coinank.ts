import { TRPCError } from "@trpc/server";

const COINANK_KLINE_URL = "https://api.coinank.com/api/kline/list/open";

const DEFAULT_EXCHANGE = "Binance";

const DEFAULT_SIZE = 100;

// Maps the form-side timeframe values (see InstrumentSection.TIME_FRAMES) to
// the interval string CoinAnk's API expects. Keep these in sync with the UI.
const INTERVAL_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface FetchCandlesInput {
  tradingPair: string;
  timeFrame: string;
  // ms timestamp; defaults to Date.now(). Combined with `side` decides which
  // side of `anchor` the returned window sits on.
  anchor?: number;
  // "to"   → candles ending at / before anchor (default; matches the live
  //          chart's "latest 100" behaviour when anchor = Date.now()).
  // "from" → candles starting at / after anchor.
  side?: "to" | "from";
  size?: number;
}

// CoinAnk row tuple shape — column order is openTime, closeTime, open,
// CLOSE, high, low, baseVol, quoteVol, tradeCount, takerBuy. Note that close
// comes before high/low, not after, so we map by index rather than spread.
function mapRow(row: unknown[]): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [openTime, , open, close, high, low, baseVol] = row;
  if (
    typeof openTime !== "number" ||
    typeof open !== "number" ||
    typeof close !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number"
  ) {
    return null;
  }
  return {
    time: Math.floor(openTime / 1000),
    open,
    high,
    low,
    close,
    ...(typeof baseVol === "number" ? { volume: baseVol } : {}),
  };
}

export async function fetchCandles(
  input: FetchCandlesInput
): Promise<Candle[]> {
  const interval = INTERVAL_MAP[input.timeFrame];
  if (!interval) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported timeframe: ${input.timeFrame}`,
    });
  }

  const symbol = input.tradingPair.toUpperCase();
  const size = input.size ?? DEFAULT_SIZE;
  const side = input.side ?? "to";
  const anchor = input.anchor ?? Date.now();
  const url =
    `${COINANK_KLINE_URL}?exchange=${DEFAULT_EXCHANGE}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}` +
    `&size=${size}` +
    `&side=${side}` +
    `&ts=${anchor}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
    });
  } catch (err) {
    console.error("[CoinAnk] fetch failed", err);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Failed to reach market data provider",
    });
  }

  if (!res.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Market data provider returned ${res.status}`,
    });
  }

  const body = (await res.json()) as {
    success?: boolean;
    data?: unknown[];
  } | null;

  if (!body?.success || !Array.isArray(body.data)) return [];

  const candles: Candle[] = [];
  for (const row of body.data) {
    const mapped = mapRow(row as unknown[]);
    if (mapped) candles.push(mapped);
  }
  // Newest-first responses sorted ascending so lightweight-charts can
  // consume the array directly without an extra .reverse() at the seam.
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

export interface CandleWindow {
  candles: Candle[];
  // Index of the first candle whose openTime >= anchor (i.e. the candle the
  // trade was opened in, or the next one if anchor falls inside a closed
  // candle). null when no after-candle exists yet.
  entryIndex: number | null;
  before: number;
  after: number;
}

/**
 * Fetches up to `halfSize` candles on each side of `anchorMs` at `timeFrame`,
 * merges + dedupes them, and tags the entry index. When fewer than `halfSize`
 * after-candles exist (recent trade), `after` reflects the actual count and
 * the rest of the message still ships.
 */
export async function fetchCandleWindowAround(input: {
  tradingPair: string;
  timeFrame: string;
  anchorMs: number;
  halfSize?: number;
}): Promise<CandleWindow> {
  const halfSize = input.halfSize ?? DEFAULT_SIZE;
  const [before, after] = await Promise.all([
    fetchCandles({
      tradingPair: input.tradingPair,
      timeFrame: input.timeFrame,
      anchor: input.anchorMs,
      side: "to",
      size: halfSize,
    }),
    fetchCandles({
      tradingPair: input.tradingPair,
      timeFrame: input.timeFrame,
      anchor: input.anchorMs,
      side: "from",
      size: halfSize,
    }),
  ]);

  const byTime = new Map<number, Candle>();
  for (const c of before) byTime.set(c.time, c);
  for (const c of after) byTime.set(c.time, c);
  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);

  const anchorSec = Math.floor(input.anchorMs / 1000);
  let entryIndex: number | null = candles.findIndex(c => c.time >= anchorSec);
  if (entryIndex === -1) entryIndex = null;

  const beforeCount = entryIndex ?? candles.length;
  const afterCount = entryIndex === null ? 0 : candles.length - entryIndex;

  return {
    candles,
    entryIndex,
    before: beforeCount,
    after: afterCount,
  };
}

export const __testing__ = { INTERVAL_MAP, mapRow };
