export const ANONYMOUS_OPEN_ID = "anonymous-user";
export const ANONYMOUS_USER_NAME = "Anonymous User";

export const TRADE_STATUSES = ["open", "closed", "reviewed"] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<TradeStatus, TradeStatus | null> = {
  open: "closed",
  closed: "reviewed",
  reviewed: null,
};

export const FIELD_MUTABILITY: Record<
  TradeStatus,
  Record<string, "EDIT" | "SET" | "AUTO" | "LOCKED">
> = {
  open: {
    tradingPair: "EDIT",
    direction: "EDIT",
    timeFrame: "EDIT",
    startTime: "EDIT",
    tradingLogic: "EDIT",
    tradingSystemId: "EDIT",
    selectedElementIds: "EDIT",
    tvUrl: "EDIT",
    confidenceLevel: "AUTO",
    endTime: "SET",
    outcome: "SET",
    riskRewardRatio: "SET",
    returnAmount: "SET",
    accountBalance: "AUTO",
    consecutiveLosses: "AUTO",
    reviewFeedback: "LOCKED",
    reviewChartUrl: "LOCKED",
  },
  closed: {
    tradingPair: "LOCKED",
    direction: "LOCKED",
    timeFrame: "LOCKED",
    startTime: "LOCKED",
    tradingLogic: "LOCKED",
    tradingSystemId: "LOCKED",
    selectedElementIds: "LOCKED",
    tvUrl: "LOCKED",
    confidenceLevel: "LOCKED",
    endTime: "LOCKED",
    outcome: "LOCKED",
    riskRewardRatio: "LOCKED",
    returnAmount: "LOCKED",
    accountBalance: "LOCKED",
    consecutiveLosses: "LOCKED",
    reviewFeedback: "EDIT",
    reviewChartUrl: "EDIT",
  },
  reviewed: {
    tradingPair: "LOCKED",
    direction: "LOCKED",
    timeFrame: "LOCKED",
    startTime: "LOCKED",
    tradingLogic: "LOCKED",
    tradingSystemId: "LOCKED",
    selectedElementIds: "LOCKED",
    tvUrl: "LOCKED",
    confidenceLevel: "LOCKED",
    endTime: "LOCKED",
    outcome: "LOCKED",
    riskRewardRatio: "LOCKED",
    returnAmount: "LOCKED",
    accountBalance: "LOCKED",
    consecutiveLosses: "LOCKED",
    reviewFeedback: "EDIT",
    reviewChartUrl: "EDIT",
  },
};
