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
}

interface FetchCandlesInput {
  tradingPair: string;
  timeFrame: string;
}

// CoinAnk row tuple shape — column order is openTime, closeTime, open,
// CLOSE, high, low, baseVol, quoteVol, tradeCount, takerBuy. Note that close
// comes before high/low, not after, so we map by index rather than spread.
function mapRow(row: unknown[]): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [openTime, , open, close, high, low] = row;
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
  const url =
    `${COINANK_KLINE_URL}?exchange=${DEFAULT_EXCHANGE}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}` +
    `&size=${DEFAULT_SIZE}` +
    `&side=to` +
    `&ts=${Date.now()}`;

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

export const __testing__ = { INTERVAL_MAP, mapRow };
