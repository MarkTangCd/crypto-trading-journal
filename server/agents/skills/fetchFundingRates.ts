import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getActiveFundingBackend } from "./fundingBackends";

const DEFAULT_LOOKBACK_HOURS = 168;
const MIN_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 720;
// 0.05% — roughly 3–5× BTC/ETH perp baseline funding. Tagged onto the
// payload so the model can introspect the threshold it's being told about.
const EXTREME_THRESHOLD_PCT = 0.05;
const RATE_DECIMALS = 6;

const parameters = z.object({
  tradingPair: z
    .string()
    .min(1)
    .describe(
      "Perp trading pair, e.g. BTCUSDT. Normalized to uppercase. Single symbol per call."
    ),
  lookbackHours: z
    .number()
    .int()
    .min(MIN_LOOKBACK_HOURS)
    .max(MAX_LOOKBACK_HOURS)
    .default(DEFAULT_LOOKBACK_HOURS)
    .describe(
      `Window length in hours, ${MIN_LOOKBACK_HOURS}–${MAX_LOOKBACK_HOURS}. Default ${DEFAULT_LOOKBACK_HOURS} (~7 days).`
    ),
});

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

interface HistoryPoint {
  ts: number;
  rate: number;
}

interface ExtremePoint extends HistoryPoint {
  side: "long-heavy" | "short-heavy";
}

interface OkResult {
  ok: true;
  tradingPair: string;
  source: string;
  unit: "percent";
  intervalHours: number;
  current: HistoryPoint;
  extremes: ExtremePoint[];
  history: HistoryPoint[];
  threshold: number;
}

interface ErrResult {
  ok: false;
  error: string;
}

export const fetchFundingRatesSkill: Skill<typeof parameters> = {
  name: "fetch_funding_rates",
  category: "network",
  description:
    "Fetch perp funding-rate history for a symbol so review can check whether the trade was opened/held during extreme funding (rate × 100 > threshold). Returns current + history + extremes in percent.",
  parameters,
  async run(args, context): Promise<OkResult | ErrResult> {
    const tradingPair = args.tradingPair.toUpperCase();
    const backend = getActiveFundingBackend();
    const limit = Math.ceil(args.lookbackHours / backend.intervalHours);

    const result = await backend.fetchHistory({
      tradingPair,
      limit,
      ...(context?.signal ? { signal: context.signal } : {}),
    });

    if (!result.ok) return { ok: false, error: result.error };

    if (result.history.length === 0) {
      return { ok: false, error: "未获取到任何 funding rate 数据" };
    }

    // rate is decimal (e.g. 0.0001); convert to percent for output.
    const history: HistoryPoint[] = result.history.map(p => ({
      ts: p.ts,
      rate: round(p.rate * 100, RATE_DECIMALS),
    }));

    const extremes: ExtremePoint[] = history
      .filter(p => Math.abs(p.rate) > EXTREME_THRESHOLD_PCT)
      .map(p => ({
        ts: p.ts,
        rate: p.rate,
        side: p.rate > 0 ? "long-heavy" : "short-heavy",
      }));

    const current = history[history.length - 1]!;

    return {
      ok: true,
      tradingPair,
      source: backend.id,
      unit: "percent",
      intervalHours: backend.intervalHours,
      current,
      extremes,
      history,
      threshold: EXTREME_THRESHOLD_PCT,
    };
  },
};

register(fetchFundingRatesSkill);
