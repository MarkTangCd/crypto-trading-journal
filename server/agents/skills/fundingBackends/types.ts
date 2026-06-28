/**
 * Pluggable backend contract for the `fetch_funding_rates` tool. v1 ships a
 * single binance implementation; another provider (CoinAnk, Bybit, …) can slot
 * in later by exporting another FundingBackend and pointing
 * `getActiveFundingBackend()` at it.
 *
 * Mirrors the SearchBackend shape so future Settings UI can offer per-tool
 * backend selection with the same indirection point.
 */

export interface FundingPoint {
  // Settlement timestamp in milliseconds.
  ts: number;
  // Decimal funding rate (e.g. 0.0001 == 0.01%). The skill layer converts
  // to percent for model-facing output.
  rate: number;
}

export interface FundingBackendArgs {
  tradingPair: string;
  // Maximum number of historical funding events to fetch (newest-first
  // upstream; backends return them sorted ascending by ts).
  limit: number;
  signal?: AbortSignal;
}

export type FundingBackendResponse =
  | { ok: true; history: FundingPoint[] }
  | { ok: false; error: string };

export interface FundingBackend {
  /** Stable backend id, e.g. "binance". */
  id: string;
  /** Funding interval in hours (e.g. Binance perp = 8). Skill uses it to
   *  convert `lookbackHours` into a row `limit`. */
  intervalHours: number;
  fetchHistory(args: FundingBackendArgs): Promise<FundingBackendResponse>;
}
