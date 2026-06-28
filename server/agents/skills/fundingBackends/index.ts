import { binanceBackend } from "./binance";
import type { FundingBackend } from "./types";

/**
 * Resolve which FundingBackend the `fetch_funding_rates` tool should invoke.
 *
 * v1 is hardcoded to binance — CoinAnk's funding endpoint is gated (only the
 * k-line `/open` route is public). When CoinAnk exposes a public funding
 * endpoint, drop in `fundingBackends/coinank.ts` and switch here.
 */
export function getActiveFundingBackend(): FundingBackend {
  return binanceBackend;
}

export type {
  FundingBackend,
  FundingBackendArgs,
  FundingBackendResponse,
  FundingPoint,
} from "./types";
