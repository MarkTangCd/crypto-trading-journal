import type {
  FundingBackend,
  FundingBackendArgs,
  FundingBackendResponse,
  FundingPoint,
} from "./types";

const BINANCE_FUNDING_URL = "https://fapi.binance.com/fapi/v1/fundingRate";
const PER_REQUEST_TIMEOUT_MS = 30_000;
// Binance USDT-margined perpetuals settle funding every 8 hours.
const FUNDING_INTERVAL_HOURS = 8;
// Upstream caps the API at 1000 rows per request.
const BINANCE_MAX_LIMIT = 1000;

interface BinanceFundingRow {
  symbol?: string;
  fundingTime?: number;
  fundingRate?: string;
}

function composeSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 0) return new AbortController().signal;
  if (live.length === 1) return live[0]!;
  return AbortSignal.any(live);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

async function fetchBinanceFunding(
  args: FundingBackendArgs
): Promise<FundingBackendResponse> {
  const limit = Math.min(Math.max(args.limit, 1), BINANCE_MAX_LIMIT);
  const url =
    `${BINANCE_FUNDING_URL}?symbol=${encodeURIComponent(args.tradingPair)}` +
    `&limit=${limit}`;

  const externalSignals: AbortSignal[] = [
    AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
  ];
  if (args.signal) externalSignals.push(args.signal);
  const signal = composeSignals(externalSignals);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "binance funding request failed";
    return { ok: false, error: `binance 请求失败: ${message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `binance ${response.status}: ${truncate(body, 200) || response.statusText}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "invalid binance payload";
    return { ok: false, error: `binance 解析失败: ${message}` };
  }

  if (!Array.isArray(payload)) {
    return { ok: false, error: "binance 返回格式异常: 期望数组" };
  }

  const history: FundingPoint[] = [];
  for (const row of payload as BinanceFundingRow[]) {
    if (
      typeof row?.fundingTime !== "number" ||
      typeof row?.fundingRate !== "string"
    )
      continue;
    const rate = Number(row.fundingRate);
    if (!Number.isFinite(rate)) continue;
    history.push({ ts: row.fundingTime, rate });
  }
  history.sort((a, b) => a.ts - b.ts);
  return { ok: true, history };
}

export const binanceBackend: FundingBackend = {
  id: "binance",
  intervalHours: FUNDING_INTERVAL_HOURS,
  fetchHistory: fetchBinanceFunding,
};
