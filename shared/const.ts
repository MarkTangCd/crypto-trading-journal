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

export const SCENARIO_TIME_FRAMES = [
  "15m",
  "30m",
  "1H",
  "4H",
  "12H",
  "1D",
] as const;
export type ScenarioTimeFrame = (typeof SCENARIO_TIME_FRAMES)[number];
export const SCENARIO_SIDES = ["long", "short"] as const;
export const SCENARIO_OUTCOMES = ["triggered", "invalidated"] as const;
export const SCENARIO_NAME_MAX = 80;
/** Moved from server/routers.ts; shared by plan symbol input and getCandles */
export const TRADING_PAIR_RE = /^[A-Z0-9]{4,20}$/;
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
/** 10 MiB; the client pre-checks file.size against it */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_OWNER_KINDS = ["plan", "journal_entry", "setup"] as const;
export type ImageOwnerKind = (typeof IMAGE_OWNER_KINDS)[number];
export const EMOTIONS = [
  "fear",
  "greed",
  "frustration",
  "impatience",
  "hesitation",
  "overconfidence",
  "revenge",
  "boredom",
  "stress",
  "fomo",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const JOURNAL_SLOTS = ["before", "after"] as const;
export const SLOT_IMAGE_MAX = 10;
export const SETUP_NAME_MAX = 60;
export const ENTRY_TRIGGER_MAX = 80;
/** Moved from client/src/lib/plannedRiskReward.ts; server validates prices */
export const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
