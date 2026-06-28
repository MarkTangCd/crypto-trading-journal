import { z } from "zod";
import { register, type Skill } from "../skillRegistry";

// Blockchain.com Charts API: keyless, free, BTC-only. Each chart is its own
// endpoint, so we fan out per metric. ETH is rejected at the pair gate
// because no comparable free ETH on-chain feed exists at this scope.
const BLOCKCHAIN_BASE_URL = "https://api.blockchain.info";
const CHART_PATH_PREFIX = "/charts";
const DEFAULT_LOOKBACK_HOURS = 72;
const MIN_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 168;
const PER_REQUEST_TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;

const METRIC_MAP = {
  active_addresses: "n-unique-addresses",
  transfer_value_usd: "estimated-transaction-volume-usd",
  miner_revenue: "miners-revenue",
} as const satisfies Record<string, string>;

type MetricKey = keyof typeof METRIC_MAP;
const METRIC_KEYS = Object.keys(METRIC_MAP) as MetricKey[];

const parameters = z.object({
  symbol: z
    .string()
    .min(1)
    .describe(
      "Trading pair, e.g. BTCUSDT. Only BTC base is accepted; ETH and other symbols are rejected without hitting the network."
    ),
  lookbackHours: z
    .number()
    .int()
    .min(MIN_LOOKBACK_HOURS)
    .max(MAX_LOOKBACK_HOURS)
    .default(DEFAULT_LOOKBACK_HOURS)
    .describe(
      `Window length in hours, ${MIN_LOOKBACK_HOURS}–${MAX_LOOKBACK_HOURS}. Default ${DEFAULT_LOOKBACK_HOURS}. Daily resolution; expect floor(lookbackHours/24) data points.`
    ),
  metrics: z
    .array(z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]))
    .min(1)
    .default(["active_addresses", "transfer_value_usd"])
    .describe(
      "On-chain metrics to fetch. Backed by Blockchain.com Charts API (keyless, free, BTC-only)."
    ),
});

// Accept only BTC as a base symbol followed by an optional quote suffix.
// Examples accepted: BTC, BTCUSDT, BTC/USDT, BTC-USD, BTC_USDC, BTCPERP.
// Examples rejected: BTCDOM, BTCB, ETHUSDT, ETH/USDT, SOLUSDT.
const PAIR_GATE_RE = /^BTC(?:[/_-]?USD[TC]?|PERP)?$/i;
const ETH_GATE_RE = /^ETH/i;

interface HistoryPoint {
  ts: number;
  value: number;
}

interface MetricOk {
  ok: true;
  current: number;
  history: HistoryPoint[];
  deltaPct: number | null;
}

interface MetricErr {
  ok: false;
  reason: string;
}

type MetricResult = MetricOk | MetricErr;

interface OkResult {
  ok: true;
  asset: "BTC";
  windowHours: number;
  source: "blockchain.com";
  metrics: Record<string, MetricResult>;
}

interface ErrResult {
  ok: false;
  error: string;
}

function classify(
  symbol: string
): { ok: true } | { ok: false; reason: string } {
  const upper = symbol.trim().toUpperCase();
  if (PAIR_GATE_RE.test(upper)) return { ok: true };
  if (ETH_GATE_RE.test(upper)) {
    return {
      ok: false,
      reason: `on_chain_snapshot 仅支持 BTC 交易对（ETH 链上数据需付费 backend，暂未启用）；当前 symbol=${symbol}。`,
    };
  }
  return {
    ok: false,
    reason: `on_chain_snapshot 仅支持 BTC 交易对，当前 symbol=${symbol}。`,
  };
}

function composeSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 0) return new AbortController().signal;
  if (live.length === 1) return live[0]!;
  return AbortSignal.any(live);
}

interface ChartPoint {
  x: number;
  y: number;
}

interface ChartResponse {
  status?: string;
  values?: ChartPoint[];
}

function isChartResponse(value: unknown): value is ChartResponse {
  return typeof value === "object" && value !== null;
}

interface FetchChartArgs {
  chart: string;
  timespanDays: number;
  sinceSec: number;
  signal: AbortSignal;
}

async function fetchChart(args: FetchChartArgs): Promise<MetricResult> {
  const url = new URL(
    `${CHART_PATH_PREFIX}/${args.chart}`,
    BLOCKCHAIN_BASE_URL
  );
  url.searchParams.set("timespan", `${args.timespanDays}days`);
  url.searchParams.set("format", "json");
  url.searchParams.set("sampled", "false");

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: args.signal });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `请求失败：${reason}` };
  }

  if (!response.ok) {
    if (response.status === 429) {
      return {
        ok: false,
        reason: "Blockchain.com 限流（429）：请稍后重试。",
      };
    }
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      reason: `Blockchain.com ${response.status}：${(body || response.statusText).slice(0, 200)}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `解析失败：${reason}` };
  }

  if (!isChartResponse(payload) || !Array.isArray(payload.values)) {
    return { ok: false, reason: "Blockchain.com 返回格式异常。" };
  }

  const history: HistoryPoint[] = [];
  for (const point of payload.values) {
    if (
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      continue;
    }
    // Blockchain.com timespan widens to the chart's native resolution, so a
    // 3-day request can include older points. Trim to the lookback window.
    if (point.x < args.sinceSec) continue;
    history.push({ ts: point.x, value: point.y });
  }
  if (history.length === 0) {
    return { ok: false, reason: "Blockchain.com 返回空数据。" };
  }
  history.sort((a, b) => a.ts - b.ts);

  const earliest = history[0]!.value;
  const current = history[history.length - 1]!.value;
  const deltaPct =
    earliest === 0 ? null : ((current - earliest) / Math.abs(earliest)) * 100;

  return {
    ok: true,
    current,
    history,
    deltaPct: deltaPct === null ? null : Number(deltaPct.toFixed(2)),
  };
}

export const onChainSnapshotSkill: Skill<typeof parameters> = {
  name: "on_chain_snapshot",
  category: "network",
  description:
    "Fetch BTC on-chain snapshot metrics (active addresses, estimated transaction volume USD, miner revenue) over a recent window via the keyless Blockchain.com Charts API. ETH and other symbols are rejected without hitting the network.",
  parameters,
  async run(args, context): Promise<OkResult | ErrResult> {
    const gate = classify(args.symbol);
    if (!gate.ok) {
      return { ok: false, error: gate.reason };
    }

    const untilMs = Date.now();
    const sinceMs = untilMs - args.lookbackHours * HOUR_MS;
    const sinceSec = Math.floor(sinceMs / 1000);
    // Pad by 1 day so we always have a point earlier than `since` to anchor
    // deltaPct, and never underflow Blockchain.com's minimum timespan.
    const timespanDays = Math.max(2, Math.ceil(args.lookbackHours / 24) + 1);

    const externalSignals: AbortSignal[] = [
      AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    ];
    if (context?.signal) externalSignals.push(context.signal);
    const signal = composeSignals(externalSignals);

    const entries = await Promise.all(
      args.metrics.map(async metric => {
        const result = await fetchChart({
          chart: METRIC_MAP[metric],
          timespanDays,
          sinceSec,
          signal,
        });
        return [metric, result] as const;
      })
    );

    const metrics: Record<string, MetricResult> = {};
    for (const [name, result] of entries) metrics[name] = result;

    return {
      ok: true,
      asset: "BTC",
      windowHours: args.lookbackHours,
      source: "blockchain.com",
      metrics,
    };
  },
};

register(onChainSnapshotSkill);
