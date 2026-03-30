export const ANONYMOUS_OPEN_ID = "anonymous-user";
export const ANONYMOUS_USER_NAME = "Anonymous User";

export const TRADE_STATUSES = ["open", "closed", "reviewed"] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<TradeStatus, TradeStatus | null> = {
  open: "closed",
  closed: "reviewed",
  reviewed: null,
};
