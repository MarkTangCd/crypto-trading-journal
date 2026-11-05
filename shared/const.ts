export const ANONYMOUS_OPEN_ID = "anonymous-user";
export const ANONYMOUS_USER_NAME = "Anonymous User";

export const TIME_FRAMES = [
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

export type TimeFrame = (typeof TIME_FRAMES)[number];

export const SYNC_ERROR_CODES = [
  "invalid_key",
  "permissions_changed",
  "futures_unreadable",
  "clock_skew",
  "rate_limited",
  "exchange_unavailable",
  "network",
  "unknown",
] as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export const TRANSIENT_SYNC_ERROR_CODES = [
  "rate_limited",
  "exchange_unavailable",
  "network",
] as const satisfies readonly SyncErrorCode[];
