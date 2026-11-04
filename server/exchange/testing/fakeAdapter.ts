import type { SyncErrorCode } from "@shared/const";

import type {
  ExchangeAdapter,
  ExchangeBalance,
  ExchangeConditionalOrder,
  ExchangeFill,
  ExchangePosition,
  KeyVerification,
} from "../adapter";
import { ExchangeError } from "../errors";

export type AdapterMethod = keyof ExchangeAdapter;

export interface FakeAdapterFixtures {
  verifyKey?: KeyVerification;
  fills?: Record<string, ExchangeFill[]>;
  positions?: ExchangePosition[];
  conditionalOrders?: Record<string, ExchangeConditionalOrder[]>;
  balance?: ExchangeBalance;
  /** Methods that throw `ExchangeError` with the given code instead of serving fixtures. */
  throws?: Partial<Record<AdapterMethod, SyncErrorCode>>;
}

export interface FakeAdapterCall {
  method: AdapterMethod;
  args: unknown[];
}

const DEFAULT_BALANCE: ExchangeBalance = {
  balanceUsdt: "0",
  unrealizedPnlUsdt: "0",
  updateTime: 0,
};

export function createFakeAdapter(fixtures: FakeAdapterFixtures = {}) {
  const calls: FakeAdapterCall[] = [];

  const enter = (method: AdapterMethod, args: unknown[]) => {
    calls.push({ method, args });
    const code = fixtures.throws?.[method];
    if (code) throw new ExchangeError(code, `fake ${method} failure`);
  };

  const fillsInWindow = (symbol: string, from: number, to: number) =>
    (fixtures.fills?.[symbol] ?? []).filter(
      fill => fill.time >= from && fill.time <= to
    );

  const adapter: ExchangeAdapter = {
    async verifyKey(c) {
      enter("verifyKey", [c]);
      return fixtures.verifyKey ?? { ok: true };
    },
    // Derived from the fill fixtures so tests keep a single source of truth.
    async discoverSymbols(c, from, to) {
      enter("discoverSymbols", [c, from, to]);
      const symbols: string[] = [];
      let maxTime = 0;
      for (const symbol of Object.keys(fixtures.fills ?? {})) {
        const fills = fillsInWindow(symbol, from, to);
        if (fills.length === 0) continue;
        symbols.push(symbol);
        for (const fill of fills) maxTime = Math.max(maxTime, fill.time);
      }
      return { symbols, maxTime };
    },
    async fetchFills(c, symbol, from, to) {
      enter("fetchFills", [c, symbol, from, to]);
      return fillsInWindow(symbol, from, to);
    },
    async fetchPositions(c) {
      enter("fetchPositions", [c]);
      return fixtures.positions ?? [];
    },
    async fetchConditionalOrders(c, symbol) {
      enter("fetchConditionalOrders", [c, symbol]);
      return fixtures.conditionalOrders?.[symbol] ?? [];
    },
    async fetchBalance(c) {
      enter("fetchBalance", [c]);
      return fixtures.balance ?? DEFAULT_BALANCE;
    },
  };

  return { adapter, calls };
}
