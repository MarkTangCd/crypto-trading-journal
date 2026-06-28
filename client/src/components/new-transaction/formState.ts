import type { Direction } from "@/lib/plannedRiskReward";
import type { MarketCycle, TransactionType } from "@shared/const";

export interface FormData {
  tradingPair: string;
  timeFrame: string;
  startTime: string;
  direction: Direction;
  context: string;
  tradeItems: string[];
  marketCycle: MarketCycle | "";
  transactionType: TransactionType | "";
  tvUrl: string;
  entryPrice: string;
  positionSizeUsdt: string;
  plannedStopLossPrice: string;
  plannedTakeProfitPrice: string;
}

export const INITIAL_FORM_DATA: FormData = {
  tradingPair: "",
  timeFrame: "",
  startTime: "",
  direction: "",
  context: "",
  tradeItems: [],
  marketCycle: "",
  transactionType: "",
  tvUrl: "",
  entryPrice: "",
  positionSizeUsdt: "",
  plannedStopLossPrice: "",
  plannedTakeProfitPrice: "",
};

export const REQUIRED_FIELDS = [
  "tradingPair",
  "timeFrame",
  "startTime",
  "direction",
  "context",
  "marketCycle",
  "transactionType",
  "entryPrice",
  "positionSizeUsdt",
  "plannedStopLossPrice",
  "plannedTakeProfitPrice",
] as const satisfies readonly (keyof FormData)[];
