import type {
  ExchangeAdapter,
  ExchangeBalance,
  ExchangeCredentials,
  KeyVerification,
} from "../adapter";
import { ExchangeError } from "../errors";
import {
  type BinanceHttpOptions,
  FAPI_BASE,
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

interface BalanceRow {
  asset: string;
  balance: string;
  crossUnPnl: string;
  updateTime: number;
}

export function createBinanceAdapter(
  options: BinanceHttpOptions = {}
): ExchangeAdapter {
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

  const notImplemented = (method: string) => async () => {
    throw new Error(`[Binance] ${method} not implemented`);
  };

  return {
    verifyKey,
    discoverSymbols: notImplemented("discoverSymbols"),
    fetchFills: notImplemented("fetchFills"),
    fetchPositions: notImplemented("fetchPositions"),
    fetchConditionalOrders: notImplemented("fetchConditionalOrders"),
    fetchBalance,
  };
}
