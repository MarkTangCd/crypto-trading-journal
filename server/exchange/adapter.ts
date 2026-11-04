export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
}

export type KeyVerification =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_key" | "permissions_changed" | "futures_unreadable";
    };

export interface ExchangeFill {
  fillId: string;
  orderId: string;
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  feeUsd: string; // converted by the adapter
  time: number;
}

export interface ExchangePosition {
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  positionAmt: string; // signed as the exchange reports it
  entryPrice: string;
  notional: string;
  updateTime: number;
}

export interface ExchangeConditionalOrder {
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  side: "BUY" | "SELL";
  kind: "stop" | "takeProfit"; // STOP/STOP_MARKET vs TAKE_PROFIT/TAKE_PROFIT_MARKET; trailing stops dropped
  triggerPrice: string;
  closePosition: boolean;
  quantity: string;
}

export interface ExchangeBalance {
  balanceUsdt: string;
  unrealizedPnlUsdt: string;
  updateTime: number;
}

export interface ExchangeAdapter {
  verifyKey(c: ExchangeCredentials): Promise<KeyVerification>;
  /** Distinct symbols with REALIZED_PNL / COMMISSION / FUNDING_FEE income in [from, to], plus the max income time seen. */
  discoverSymbols(
    c: ExchangeCredentials,
    from: number,
    to: number
  ): Promise<{ symbols: string[]; maxTime: number }>;
  fetchFills(
    c: ExchangeCredentials,
    symbol: string,
    from: number,
    to: number
  ): Promise<ExchangeFill[]>;
  fetchPositions(c: ExchangeCredentials): Promise<ExchangePosition[]>;
  fetchConditionalOrders(
    c: ExchangeCredentials,
    symbol: string
  ): Promise<ExchangeConditionalOrder[]>;
  fetchBalance(c: ExchangeCredentials): Promise<ExchangeBalance>;
}
