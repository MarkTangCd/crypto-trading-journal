export const ANONYMOUS_OPEN_ID = "anonymous-user";
export const ANONYMOUS_USER_NAME = "Anonymous User";

export const TRADE_STATUSES = ["open", "closed", "reviewed"] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const MARKET_CYCLES = [
  "Trading Range",
  "Upward Tight Channel",
  "Downward Tight Channel",
  "Upward Channel",
  "Downward Channel",
  "Upward Trend",
  "Downward Trend",
] as const;

export type MarketCycle = (typeof MARKET_CYCLES)[number];

export const TRANSACTION_TYPES = ["Trend", "Reversal"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

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
    context: "EDIT",
    tradeItems: "EDIT",
    tvUrl: "EDIT",
    entryPrice: "EDIT",
    positionSizeUsdt: "EDIT",
    plannedStopLossPrice: "EDIT",
    plannedTakeProfitPrice: "EDIT",
    plannedRiskRewardRatio: "AUTO",
    endTime: "SET",
    exitPrice: "SET",
    outcome: "AUTO",
    riskRewardRatio: "AUTO",
    returnAmount: "AUTO",
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
    context: "LOCKED",
    tradeItems: "LOCKED",
    tvUrl: "LOCKED",
    entryPrice: "LOCKED",
    positionSizeUsdt: "LOCKED",
    plannedStopLossPrice: "LOCKED",
    plannedTakeProfitPrice: "LOCKED",
    plannedRiskRewardRatio: "LOCKED",
    endTime: "LOCKED",
    exitPrice: "LOCKED",
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
    context: "LOCKED",
    tradeItems: "LOCKED",
    tvUrl: "LOCKED",
    entryPrice: "LOCKED",
    positionSizeUsdt: "LOCKED",
    plannedStopLossPrice: "LOCKED",
    plannedTakeProfitPrice: "LOCKED",
    plannedRiskRewardRatio: "LOCKED",
    endTime: "LOCKED",
    exitPrice: "LOCKED",
    outcome: "LOCKED",
    riskRewardRatio: "LOCKED",
    returnAmount: "LOCKED",
    accountBalance: "LOCKED",
    consecutiveLosses: "LOCKED",
    reviewFeedback: "EDIT",
    reviewChartUrl: "EDIT",
  },
};
