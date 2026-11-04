import { isZero, mul } from "../../_core/decimal";
import type {
  ExchangeAdapter,
  ExchangeBalance,
  ExchangeConditionalOrder,
  ExchangeCredentials,
  ExchangeFill,
  ExchangePosition,
  KeyVerification,
} from "../adapter";
import { ExchangeError } from "../errors";
import {
  type BinanceHttpOptions,
  FAPI_BASE,
  publicGet,
  SAPI_BASE,
  signedGet,
} from "./http";

// Any of these on the key means it can do more than read.
const WRITE_FLAGS = [
  "enableFutures",
  "enableWithdrawals",
  "enableInternalTransfer",
  "enableMargin",
  "enableSpotAndMarginTrading",
  "enableVanillaOptions",
  "enablePortfolioMarginTrading",
  "enableFixApiTrade",
  "permitsUniversalTransfer",
] as const;

// income and userTrades both cap one request at a 7-day span.
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 1000;
const MINUTE_MS = 60_000;

const DISCOVERY_INCOME_TYPES = new Set([
  "REALIZED_PNL",
  "COMMISSION",
  "FUNDING_FEE",
]);

const CONDITIONAL_KINDS: Record<string, ExchangeConditionalOrder["kind"]> = {
  STOP: "stop",
  STOP_MARKET: "stop",
  TAKE_PROFIT: "takeProfit",
  TAKE_PROFIT_MARKET: "takeProfit",
};

interface IncomeRow {
  symbol: string;
  incomeType: string;
  tranId: number;
  time: number;
}

interface UserTradeRow {
  id: number;
  orderId: number;
  symbol: string;
  positionSide: ExchangeFill["positionSide"];
  side: ExchangeFill["side"];
  price: string;
  qty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  time: number;
}

interface PositionRow {
  symbol: string;
  positionSide: ExchangePosition["positionSide"];
  positionAmt: string;
  entryPrice: string;
  notional: string;
  updateTime: number;
}

interface AlgoOrderRow {
  symbol: string;
  positionSide: ExchangeConditionalOrder["positionSide"];
  side: ExchangeConditionalOrder["side"];
  orderType: string;
  algoStatus: string;
  triggerPrice: string;
  closePosition: boolean;
  quantity: string;
}

/**
 * Splits [from, to] into windows of at most 7 days and pages each one by
 * startTime = last row time while a page is full; callers dedupe the overlap.
 */
async function fetchWindowed<T extends { time: number }>(
  from: number,
  to: number,
  fetchPage: (startTime: number, endTime: number) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = from; start <= to; start += WINDOW_MS) {
    const end = Math.min(start + WINDOW_MS - 1, to);
    let cursor = start;
    while (cursor <= end) {
      const page = await fetchPage(cursor, end);
      rows.push(...page);
      if (page.length < PAGE_LIMIT) break;
      const last = page[page.length - 1].time;
      // A full page inside one millisecond would never advance; step past it.
      cursor = last > cursor ? last : cursor + 1;
    }
  }
  return rows;
}

interface BalanceRow {
  asset: string;
  balance: string;
  crossUnPnl: string;
  updateTime: number;
}

export function createBinanceAdapter(
  options: BinanceHttpOptions = {}
): ExchangeAdapter {
  // USDT price per (asset, minute); one adapter lives for one sync run.
  const klineCloseCache = new Map<string, string>();

  const usdtClose = async (asset: string, time: number): Promise<string> => {
    const minute = time - (time % MINUTE_MS);
    const key = `${asset}:${minute}`;
    const cached = klineCloseCache.get(key);
    if (cached !== undefined) return cached;
    const klines = (await publicGet(
      FAPI_BASE,
      "/fapi/v1/klines",
      {
        symbol: `${asset}USDT`,
        interval: "1m",
        startTime: String(minute),
        endTime: String(minute + MINUTE_MS - 1),
        limit: "1",
      },
      options
    )) as unknown[][];
    const kline = klines[0];
    if (!kline || kline[0] !== minute) {
      throw new ExchangeError(
        "unknown",
        `no ${asset}USDT 1m kline at ${minute} for fee conversion`
      );
    }
    const close = String(kline[4]);
    klineCloseCache.set(key, close);
    return close;
  };

  const discoverSymbols = async (
    c: ExchangeCredentials,
    from: number,
    to: number
  ): Promise<{ symbols: string[]; maxTime: number }> => {
    const rows = await fetchWindowed(
      from,
      to,
      async (startTime, endTime) =>
        (await signedGet(
          c,
          FAPI_BASE,
          "/fapi/v1/income",
          {
            startTime: String(startTime),
            endTime: String(endTime),
            limit: String(PAGE_LIMIT),
          },
          options
        )) as IncomeRow[]
    );
    // tranId is unique only within one incomeType.
    const unique = new Map(rows.map(r => [`${r.incomeType}:${r.tranId}`, r]));
    const symbols = new Set<string>();
    let maxTime = 0;
    for (const row of unique.values()) {
      maxTime = Math.max(maxTime, row.time);
      if (row.symbol && DISCOVERY_INCOME_TYPES.has(row.incomeType)) {
        symbols.add(row.symbol);
      }
    }
    return { symbols: [...symbols], maxTime };
  };

  const fetchFills = async (
    c: ExchangeCredentials,
    symbol: string,
    from: number,
    to: number
  ): Promise<ExchangeFill[]> => {
    const rows = await fetchWindowed(
      from,
      to,
      async (startTime, endTime) =>
        (await signedGet(
          c,
          FAPI_BASE,
          "/fapi/v1/userTrades",
          {
            symbol,
            startTime: String(startTime),
            endTime: String(endTime),
            limit: String(PAGE_LIMIT),
          },
          options
        )) as UserTradeRow[]
    );
    const unique = new Map(rows.map(r => [r.id, r]));
    const fills: ExchangeFill[] = [];
    for (const row of unique.values()) {
      const feeUsd =
        row.commissionAsset === "USDT"
          ? row.commission
          : mul(row.commission, await usdtClose(row.commissionAsset, row.time));
      fills.push({
        fillId: String(row.id),
        orderId: String(row.orderId),
        symbol: row.symbol,
        positionSide: row.positionSide,
        side: row.side,
        price: row.price,
        qty: row.qty,
        realizedPnl: row.realizedPnl,
        commission: row.commission,
        commissionAsset: row.commissionAsset,
        feeUsd,
        time: row.time,
      });
    }
    return fills;
  };

  const fetchPositions = async (
    c: ExchangeCredentials
  ): Promise<ExchangePosition[]> => {
    const rows = (await signedGet(
      c,
      FAPI_BASE,
      "/fapi/v3/positionRisk",
      {},
      options
    )) as PositionRow[];
    return rows
      .filter(row => !isZero(row.positionAmt))
      .map(row => ({
        symbol: row.symbol,
        positionSide: row.positionSide,
        positionAmt: row.positionAmt,
        entryPrice: row.entryPrice,
        notional: row.notional,
        updateTime: row.updateTime,
      }));
  };

  const fetchConditionalOrders = async (
    c: ExchangeCredentials,
    symbol: string
  ): Promise<ExchangeConditionalOrder[]> => {
    const rows = (await signedGet(
      c,
      FAPI_BASE,
      "/fapi/v1/openAlgoOrders",
      { symbol },
      options
    )) as AlgoOrderRow[];
    const orders: ExchangeConditionalOrder[] = [];
    for (const row of rows) {
      const kind = CONDITIONAL_KINDS[row.orderType];
      // Trailing stops have no fixed level and are dropped.
      if (row.algoStatus !== "NEW" || !kind) continue;
      orders.push({
        symbol: row.symbol,
        positionSide: row.positionSide,
        side: row.side,
        kind,
        triggerPrice: row.triggerPrice,
        closePosition: row.closePosition,
        quantity: row.quantity,
      });
    }
    return orders;
  };

  const fetchBalance = async (
    c: ExchangeCredentials
  ): Promise<ExchangeBalance> => {
    const rows = (await signedGet(
      c,
      FAPI_BASE,
      "/fapi/v3/balance",
      {},
      options
    )) as BalanceRow[];
    const usdt = rows.find(row => row.asset === "USDT");
    if (!usdt) throw new ExchangeError("unknown", "balance has no USDT row");
    return {
      balanceUsdt: usdt.balance,
      unrealizedPnlUsdt: usdt.crossUnPnl,
      updateTime: usdt.updateTime,
    };
  };

  const verifyKey = async (
    c: ExchangeCredentials
  ): Promise<KeyVerification> => {
    let restrictions: Record<string, unknown>;
    try {
      restrictions = (await signedGet(
        c,
        SAPI_BASE,
        "/sapi/v1/account/apiRestrictions",
        {},
        options
      )) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ExchangeError && error.code === "invalid_key") {
        return { ok: false, code: "invalid_key" };
      }
      throw error;
    }
    if (
      restrictions.enableReading !== true ||
      WRITE_FLAGS.some(flag => restrictions[flag] === true)
    ) {
      return { ok: false, code: "permissions_changed" };
    }
    try {
      await fetchBalance(c);
    } catch (error) {
      // The key already passed apiRestrictions, so an auth rejection (-2015)
      // here means it cannot read futures.
      if (error instanceof ExchangeError && error.code === "invalid_key") {
        return { ok: false, code: "futures_unreadable" };
      }
      throw error;
    }
    return { ok: true };
  };

  return {
    verifyKey,
    discoverSymbols,
    fetchFills,
    fetchPositions,
    fetchConditionalOrders,
    fetchBalance,
  };
}
