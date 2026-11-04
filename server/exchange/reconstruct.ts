// Pure fill -> trade reconstruction (spec doc-4, sync steps 6-9). No DB, no
// network, no clock: the sync step feeds it stored + fetched fills.

import {
  abs,
  add,
  compare,
  div,
  isNegative,
  isZero,
  min,
  mul,
  negate,
  normalize,
  sub,
} from "../_core/decimal";
import type {
  ExchangeConditionalOrder,
  ExchangeFill,
  ExchangePosition,
} from "./adapter";
import { ExchangeError } from "./errors";

const PRICE_SCALE = 8;
const CONSISTENCY_TOLERANCE = "0.01";

type PositionSide = ExchangeFill["positionSide"];
type Direction = 1 | -1;

/** A `fills` row without id / userId / accountId. */
export interface FillRecord extends Omit<ExchangeFill, "orderId"> {
  source: "exchange" | "seed";
  orderId: string | null;
}

/** A `trades` row without id / userId / accountId / syncedAt. */
export interface TradeRecord {
  tradeKey: string;
  exchange: string;
  exchangeSymbol: string;
  symbol: string;
  positionSide: PositionSide;
  side: "long" | "short";
  status: "open" | "closed";
  openTime: number;
  openTimeApprox: boolean;
  closeTime: number | null;
  entryPrice: string;
  exitPrice: string | null;
  quantity: string;
  positionSizeUsdt: string;
  feeUsd: string;
  realizedPnlUsd: string;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
}

export interface ReconstructInput {
  fills: FillRecord[];
  conditionalOrders: ExchangeConditionalOrder[];
  exchange: string;
}

interface TradeState {
  tradeKey: string;
  symbol: string;
  positionSide: PositionSide;
  dir: Direction;
  openTime: number;
  openTimeApprox: boolean;
  closeTime: number | null;
  entryQty: string;
  entryNotional: string;
  exitQty: string;
  exitNotional: string;
  remaining: string;
  feeUsd: string;
  realizedPnl: string;
}

const keyOf = (row: { symbol: string; positionSide: PositionSide }) =>
  `${row.symbol}|${row.positionSide}`;

const dirOf = (side: "BUY" | "SELL"): Direction => (side === "BUY" ? 1 : -1);

const signed = (dir: Direction, value: string) =>
  dir > 0 ? value : negate(value);

/** (time, fillId) with seeds first and exchange ids compared numerically. */
function compareFills(a: FillRecord, b: FillRecord): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.source !== b.source) return a.source === "seed" ? -1 : 1;
  if (a.fillId.length !== b.fillId.length) {
    return a.fillId.length - b.fillId.length;
  }
  return a.fillId < b.fillId ? -1 : a.fillId > b.fillId ? 1 : 0;
}

function groupByKey(fills: FillRecord[]): Map<string, FillRecord[]> {
  const groups = new Map<string, FillRecord[]>();
  for (const fill of fills) {
    const key = keyOf(fill);
    groups.set(key, [...(groups.get(key) ?? []), fill]);
  }
  for (const group of groups.values()) group.sort(compareFills);
  return groups;
}

/** Hedge legs are signed by positionSide; one-way rows as reported. */
function signedPositionAmt(position: ExchangePosition): string {
  if (position.positionSide === "LONG") return abs(position.positionAmt);
  if (position.positionSide === "SHORT")
    return negate(abs(position.positionAmt));
  return position.positionAmt;
}

/**
 * Positions that existed at `windowStart`, one seed fill per
 * (symbol, positionSide): startAmt = positionAmt now − Σ signed window fills.
 */
export function computeSeeds(
  fills: FillRecord[],
  positions: ExchangePosition[],
  windowStart: number
): FillRecord[] {
  const fillsByKey = groupByKey(fills);
  const positionsByKey = new Map(positions.map(p => [keyOf(p), p]));
  const keys = new Set([...fillsByKey.keys(), ...positionsByKey.keys()]);
  const seeds: FillRecord[] = [];

  for (const key of keys) {
    const keyFills = fillsByKey.get(key) ?? [];
    const position = positionsByKey.get(key);
    const amtNow = position ? signedPositionAmt(position) : "0";
    const startAmt = sub(
      amtNow,
      add(keyFills.map(f => signed(dirOf(f.side), f.qty)))
    );
    if (isZero(startAmt)) continue;

    const { symbol, positionSide } = position ?? keyFills[0];
    const dir: Direction =
      positionSide === "LONG"
        ? 1
        : positionSide === "SHORT"
          ? -1
          : isNegative(startAmt)
            ? -1
            : 1;
    const startQty = abs(startAmt);

    seeds.push({
      source: "seed",
      fillId: `seed@${windowStart}`,
      orderId: null,
      symbol,
      positionSide,
      side: dir > 0 ? "BUY" : "SELL",
      price: seedEntryPrice(key, dir, startQty, keyFills, position),
      qty: startQty,
      realizedPnl: "0",
      commission: "0",
      commissionAsset: "USDT",
      feeUsd: "0",
      time: windowStart,
    });
  }
  return seeds;
}

/**
 * Back-solves the seed's entry price. Exact from the first reducing fill
 * (Binance computes realizedPnl against the average entry), otherwise from
 * positionRisk.entryPrice minus the window adds.
 */
function seedEntryPrice(
  key: string,
  dir: Direction,
  startQty: string,
  keyFills: FillRecord[],
  position: ExchangePosition | undefined
): string {
  let held = startQty;
  let addNotional = "0";
  for (const fill of keyFills) {
    if (dirOf(fill.side) === dir) {
      held = add([held, fill.qty]);
      addNotional = add([addNotional, mul(fill.price, fill.qty)]);
      continue;
    }
    // realizedPnl = dir × (price − avg) × closeQty, and
    // avg = (seedPrice × startQty + addNotional) / held, so
    // seedPrice = ((price × closeQty − dir × pnl) × held − addNotional × closeQty)
    //             / (closeQty × startQty).
    const closeQty = min(fill.qty, held);
    const numerator = sub(
      mul(sub(mul(fill.price, closeQty), signed(dir, fill.realizedPnl)), held),
      mul(addNotional, closeQty)
    );
    return div(numerator, mul(closeQty, startQty), PRICE_SCALE);
  }
  if (!position) {
    throw new ExchangeError("unknown", `cannot price seed for ${key}`);
  }
  return div(
    sub(mul(position.entryPrice, abs(position.positionAmt)), addNotional),
    startQty,
    PRICE_SCALE
  );
}

function openTrade(
  tradeKey: string,
  fill: FillRecord,
  dir: Direction
): TradeState {
  return {
    tradeKey,
    symbol: fill.symbol,
    positionSide: fill.positionSide,
    dir,
    openTime: fill.time,
    openTimeApprox: fill.source === "seed",
    closeTime: null,
    entryQty: "0",
    entryNotional: "0",
    exitQty: "0",
    exitNotional: "0",
    remaining: "0",
    feeUsd: "0",
    realizedPnl: "0",
  };
}

/** Folds one (symbol, positionSide) worth of sorted fills into trades. */
function foldKey(fills: FillRecord[], logs: string[]): TradeState[] {
  const trades: TradeState[] = [];
  let trade: TradeState | null = null;

  for (const fill of fills) {
    const fillDir = dirOf(fill.side);
    if (!trade) {
      const reducesHedgeLeg =
        (fill.positionSide === "LONG" && fillDir < 0) ||
        (fill.positionSide === "SHORT" && fillDir > 0);
      if (reducesHedgeLeg) {
        logs.push(
          `[Sync] skipped fill ${fill.fillId}: ${fill.side} on ${keyOf(fill)} with no open position`
        );
        continue;
      }
      trade = openTrade(`${keyOf(fill)}#${fill.fillId}`, fill, fillDir);
    }

    if (fillDir === trade.dir) {
      trade.entryQty = add([trade.entryQty, fill.qty]);
      trade.entryNotional = add([
        trade.entryNotional,
        mul(fill.price, fill.qty),
      ]);
      trade.remaining = add([trade.remaining, fill.qty]);
      trade.feeUsd = add([trade.feeUsd, fill.feeUsd]);
      continue;
    }

    // Reduce / close / flip. The closing part takes all of the fill's
    // realizedPnl (an opening part has none) and a pro-rata share of its fee.
    const closeQty = min(fill.qty, trade.remaining);
    const rest = sub(fill.qty, closeQty);
    const closingFee = isZero(rest)
      ? fill.feeUsd
      : div(mul(fill.feeUsd, closeQty), fill.qty, PRICE_SCALE);
    trade.exitQty = add([trade.exitQty, closeQty]);
    trade.exitNotional = add([trade.exitNotional, mul(fill.price, closeQty)]);
    trade.remaining = sub(trade.remaining, closeQty);
    trade.realizedPnl = add([trade.realizedPnl, fill.realizedPnl]);
    trade.feeUsd = add([trade.feeUsd, closingFee]);
    if (!isZero(trade.remaining)) continue;

    trade.closeTime = fill.time;
    trades.push(trade);
    trade = null;
    if (isZero(rest)) continue;

    if (fill.positionSide !== "BOTH") {
      throw new ExchangeError(
        "unknown",
        `fill ${fill.fillId} over-reduces ${keyOf(fill)} by ${rest}`
      );
    }
    trade = openTrade(`${keyOf(fill)}#${fill.fillId}+flip`, fill, fillDir);
    trade.entryQty = rest;
    trade.entryNotional = mul(fill.price, rest);
    trade.remaining = rest;
    trade.feeUsd = sub(fill.feeUsd, closingFee);
  }

  if (trade) trades.push(trade);
  return trades;
}

/**
 * Current SL / TP of an open trade: close-position orders first, else
 * quantity orders covering the remaining size; the level that fires first.
 */
function pickLevel(
  trade: TradeState,
  orders: ExchangeConditionalOrder[],
  kind: ExchangeConditionalOrder["kind"]
): string | null {
  const candidates = orders.filter(
    o =>
      o.kind === kind &&
      o.symbol === trade.symbol &&
      o.positionSide === trade.positionSide &&
      dirOf(o.side) === -trade.dir
  );
  const closeAll = candidates.filter(o => o.closePosition);
  const pool = closeAll.length
    ? closeAll
    : candidates.filter(o => compare(o.quantity, trade.remaining) >= 0);
  if (!pool.length) return null;

  // Long: highest stop, lowest take-profit. Short: the reverse.
  const highest = (kind === "stop") === trade.dir > 0;
  return normalize(
    pool
      .map(o => o.triggerPrice)
      .reduce((a, b) => (compare(a, b) >= 0 === highest ? a : b))
  );
}

/** Logs a closed trade whose fill PnL disagrees with its prices. */
function checkConsistency(trade: TradeState, logs: string[]): void {
  // Closed means exitQty == entryQty, so dir × (exit − entry) × exitQty is
  // exactly dir × (exitNotional − entryNotional), free of average rounding.
  const expected = signed(
    trade.dir,
    sub(trade.exitNotional, trade.entryNotional)
  );
  const diff = sub(trade.realizedPnl, expected);
  if (compare(abs(diff), CONSISTENCY_TOLERANCE) > 0) {
    logs.push(
      `[Sync] ${trade.tradeKey} realizedPnl ${trade.realizedPnl} vs price check ${expected} (diff ${diff})`
    );
  }
}

export function reconstruct({
  fills,
  conditionalOrders,
  exchange,
}: ReconstructInput): { trades: TradeRecord[]; logs: string[] } {
  const logs: string[] = [];
  const states = [...groupByKey(fills).values()].flatMap(group =>
    foldKey(group, logs)
  );
  states.sort(
    (a, b) =>
      a.openTime - b.openTime ||
      (a.tradeKey < b.tradeKey ? -1 : a.tradeKey > b.tradeKey ? 1 : 0)
  );

  const trades = states.map((trade): TradeRecord => {
    const isOpen = trade.closeTime === null;
    if (!isOpen) checkConsistency(trade, logs);
    return {
      tradeKey: trade.tradeKey,
      exchange,
      exchangeSymbol: trade.symbol,
      symbol: trade.symbol.toUpperCase(),
      positionSide: trade.positionSide,
      side: trade.dir > 0 ? "long" : "short",
      status: isOpen ? "open" : "closed",
      openTime: trade.openTime,
      openTimeApprox: trade.openTimeApprox,
      closeTime: trade.closeTime,
      entryPrice: div(trade.entryNotional, trade.entryQty, PRICE_SCALE),
      exitPrice: isZero(trade.exitQty)
        ? null
        : div(trade.exitNotional, trade.exitQty, PRICE_SCALE),
      quantity: normalize(trade.entryQty),
      positionSizeUsdt: normalize(trade.entryNotional),
      feeUsd: normalize(trade.feeUsd),
      realizedPnlUsd: sub(trade.realizedPnl, trade.feeUsd),
      stopLossPrice: isOpen
        ? pickLevel(trade, conditionalOrders, "stop")
        : null,
      takeProfitPrice: isOpen
        ? pickLevel(trade, conditionalOrders, "takeProfit")
        : null,
    };
  });

  return { trades, logs };
}
