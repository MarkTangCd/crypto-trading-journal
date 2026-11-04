import { describe, expect, it } from "vitest";

import { add, div, mul, sub } from "../_core/decimal";
import type { ExchangeConditionalOrder, ExchangePosition } from "./adapter";
import { ExchangeError } from "./errors";
import {
  computeSeeds,
  type FillRecord,
  reconstruct,
  type TradeRecord,
} from "./reconstruct";

// Fixtures follow the eight scenarios of the task-46 prototype
// (server/exchange/PROTOTYPE-fill-to-trade.html on prototype/fill-to-trade).
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const DAY = 86_400_000;
const MINUTE = 60_000;
const WINDOW_START = NOW - 30 * DAY;
const T = (daysAgo: number, minutes = 0) =>
  NOW - daysAgo * DAY + minutes * MINUTE;

const fill = (
  id: number,
  symbol: string,
  positionSide: FillRecord["positionSide"],
  side: FillRecord["side"],
  price: string,
  qty: string,
  time: number,
  realizedPnl = "0",
  commission = "0",
  commissionAsset = "USDT",
  feeUsd = commission
): FillRecord => ({
  source: "exchange",
  fillId: String(id),
  orderId: String(9000 + id),
  symbol,
  positionSide,
  side,
  price,
  qty,
  realizedPnl,
  commission,
  commissionAsset,
  feeUsd,
  time,
});

const position = (
  symbol: string,
  positionSide: ExchangePosition["positionSide"],
  positionAmt: string,
  entryPrice: string,
  updateTime: number
): ExchangePosition => ({
  symbol,
  positionSide,
  positionAmt,
  entryPrice,
  notional: mul(positionAmt, entryPrice),
  updateTime,
});

const order = (
  symbol: string,
  positionSide: ExchangeConditionalOrder["positionSide"],
  side: ExchangeConditionalOrder["side"],
  kind: ExchangeConditionalOrder["kind"],
  triggerPrice: string,
  closePosition = true,
  quantity = "0"
): ExchangeConditionalOrder => ({
  symbol,
  positionSide,
  side,
  kind,
  triggerPrice,
  closePosition,
  quantity,
});

const run = (
  fills: FillRecord[],
  conditionalOrders: ExchangeConditionalOrder[] = []
) => reconstruct({ fills, conditionalOrders, exchange: "binance" });

/** Σ fill realizedPnl == dir × (exit − entry) × exitQty, to the cent. */
function expectPnlIdentity(trades: TradeRecord[]) {
  const cents = (value: string) => div(value, "1", 2);
  for (const trade of trades.filter(t => t.status === "closed")) {
    const fillPnl = add([trade.realizedPnlUsd, trade.feeUsd]);
    const move = sub(trade.exitPrice ?? "0", trade.entryPrice);
    const check = mul(
      trade.side === "long" ? move : sub("0", move),
      trade.quantity
    );
    expect(cents(fillPnl), trade.tradeKey).toBe(cents(check));
  }
}

const byKey = (trades: TradeRecord[], tradeKey: string) => {
  const trade = trades.find(t => t.tradeKey === tradeKey);
  if (!trade) throw new Error(`no trade ${tradeKey}`);
  return trade;
};

describe("reconstruct: scale-in, one exit", () => {
  const buys = [
    fill(1, "BTCUSDT", "BOTH", "BUY", "100000", "0.1", T(3), "0", "2"),
    fill(2, "BTCUSDT", "BOTH", "BUY", "98000", "0.1", T(3, 30), "0", "1.96"),
  ];

  it("folds two buys into one open trade with weighted entry and live SL/TP", () => {
    const { trades, logs } = run(buys, [
      order("BTCUSDT", "BOTH", "SELL", "stop", "95000"),
      order("BTCUSDT", "BOTH", "SELL", "takeProfit", "105000"),
    ]);

    expect(logs).toEqual([]);
    expect(trades).toEqual([
      {
        tradeKey: "BTCUSDT|BOTH#1",
        exchange: "binance",
        exchangeSymbol: "BTCUSDT",
        symbol: "BTCUSDT",
        positionSide: "BOTH",
        side: "long",
        status: "open",
        openTime: T(3),
        openTimeApprox: false,
        closeTime: null,
        entryPrice: "99000",
        exitPrice: null,
        quantity: "0.2",
        positionSizeUsdt: "19800",
        feeUsd: "3.96",
        realizedPnlUsd: "-3.96",
        stopLossPrice: "95000",
        takeProfitPrice: "105000",
      },
    ]);
  });

  it("closes on one sell; SL/TP are null in the rebuild (frozen by the DB merge)", () => {
    const { trades } = run([
      ...buys,
      fill(3, "BTCUSDT", "BOTH", "SELL", "104000", "0.2", T(2), "1000", "4.16"),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      tradeKey: "BTCUSDT|BOTH#1",
      status: "closed",
      closeTime: T(2),
      entryPrice: "99000",
      exitPrice: "104000",
      quantity: "0.2",
      feeUsd: "8.12",
      realizedPnlUsd: "991.88",
      stopLossPrice: null,
      takeProfitPrice: null,
    });
    expectPnlIdentity(trades);
  });
});

describe("reconstruct: partial exits", () => {
  const fills = [
    fill(11, "ETHUSDT", "BOTH", "BUY", "100000", "0.3", T(5), "0", "6"),
    fill(12, "ETHUSDT", "BOTH", "SELL", "102000", "0.1", T(4), "200", "2.04"),
    fill(13, "ETHUSDT", "BOTH", "SELL", "101000", "0.2", T(3), "200", "4.04"),
  ];

  it("keeps a partially reduced trade open with the exit so far", () => {
    const { trades } = run(fills.slice(0, 2));
    expect(trades[0]).toMatchObject({
      status: "open",
      exitPrice: "102000",
      quantity: "0.3",
      realizedPnlUsd: "191.96",
    });
  });

  it("weights the exit price across partial exits", () => {
    const { trades, logs } = run(fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      status: "closed",
      closeTime: T(3),
      entryPrice: "100000",
      exitPrice: "101333.33333333",
      feeUsd: "12.08",
      realizedPnlUsd: "387.92",
    });
    expect(logs).toEqual([]);
    expectPnlIdentity(trades);
  });
});

describe("reconstruct: flip", () => {
  const fills = [
    fill(21, "BTCUSDT", "BOTH", "BUY", "100000", "0.1", T(6), "0", "2"),
    fill(22, "BTCUSDT", "BOTH", "SELL", "101000", "0.3", T(5), "100", "3"),
    fill(23, "BTCUSDT", "BOTH", "BUY", "99000", "0.2", T(4), "400", "3.96"),
  ];

  it("splits the flip fill: closing half takes all PnL and 1/3 of the fee", () => {
    const { trades } = run(fills.slice(0, 2), [
      order("BTCUSDT", "BOTH", "BUY", "stop", "103000"),
    ]);

    expect(byKey(trades, "BTCUSDT|BOTH#21")).toMatchObject({
      status: "closed",
      closeTime: T(5),
      exitPrice: "101000",
      feeUsd: "3",
      realizedPnlUsd: "97",
    });
    expect(byKey(trades, "BTCUSDT|BOTH#22+flip")).toMatchObject({
      side: "short",
      status: "open",
      openTime: T(5),
      entryPrice: "101000",
      quantity: "0.2",
      feeUsd: "2",
      realizedPnlUsd: "-2",
      stopLossPrice: "103000",
      takeProfitPrice: null,
    });
  });

  it("closes the flipped short independently", () => {
    const { trades } = run(fills);
    expect(trades.map(t => t.tradeKey)).toEqual([
      "BTCUSDT|BOTH#21",
      "BTCUSDT|BOTH#22+flip",
    ]);
    expect(byKey(trades, "BTCUSDT|BOTH#22+flip")).toMatchObject({
      status: "closed",
      exitPrice: "99000",
      feeUsd: "5.96",
      realizedPnlUsd: "394.04",
    });
    expectPnlIdentity(trades);
  });
});

describe("reconstruct: hedge mode", () => {
  const opens = [
    fill(31, "BTCUSDT", "LONG", "BUY", "100000", "0.1", T(2), "0", "2"),
    fill(32, "BTCUSDT", "SHORT", "SELL", "100500", "0.1", T(2, 5), "0", "2.01"),
  ];

  it("keeps LONG and SHORT legs as independent trades with their own SL", () => {
    const { trades } = run(opens, [
      order("BTCUSDT", "LONG", "SELL", "stop", "97000"),
      order("BTCUSDT", "SHORT", "BUY", "stop", "103000"),
    ]);
    expect(byKey(trades, "BTCUSDT|LONG#31")).toMatchObject({
      side: "long",
      stopLossPrice: "97000",
    });
    expect(byKey(trades, "BTCUSDT|SHORT#32")).toMatchObject({
      side: "short",
      stopLossPrice: "103000",
    });
  });

  it("closes both legs", () => {
    const { trades } = run([
      ...opens,
      fill(33, "BTCUSDT", "LONG", "SELL", "101000", "0.1", T(1), "100", "2.02"),
      fill(
        34,
        "BTCUSDT",
        "SHORT",
        "BUY",
        "99500",
        "0.1",
        T(1, 10),
        "100",
        "1.99"
      ),
    ]);
    expect(byKey(trades, "BTCUSDT|LONG#31")).toMatchObject({
      status: "closed",
      realizedPnlUsd: "95.98",
    });
    expect(byKey(trades, "BTCUSDT|SHORT#32")).toMatchObject({
      status: "closed",
      realizedPnlUsd: "96",
    });
    expectPnlIdentity(trades);
  });

  it("skips and logs a reducing fill on a leg with no open position", () => {
    const { trades, logs } = run([
      fill(35, "BTCUSDT", "LONG", "SELL", "101000", "0.1", T(3)),
    ]);
    expect(trades).toEqual([]);
    expect(logs).toEqual([
      "[Sync] skipped fill 35: SELL on BTCUSDT|LONG with no open position",
    ]);
  });

  it("throws when a fill over-reduces a hedge leg", () => {
    const error = (() => {
      try {
        run([
          opens[0],
          fill(36, "BTCUSDT", "LONG", "SELL", "101000", "0.2", T(1), "100"),
        ]);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ExchangeError);
    expect(error).toMatchObject({ code: "unknown" });
  });
});

describe("reconstruct: position older than the window", () => {
  const windowBuy = fill(
    41,
    "ETHUSDT",
    "BOTH",
    "BUY",
    "3600",
    "1.0",
    T(10),
    "0",
    "1.8"
  );
  const positions = [position("ETHUSDT", "BOTH", "2.0", "3500", T(10))];

  it("seeds the pre-window part from positionRisk entry minus window adds", () => {
    expect(computeSeeds([windowBuy], positions, WINDOW_START)).toEqual([
      {
        source: "seed",
        fillId: `seed@${WINDOW_START}`,
        orderId: null,
        symbol: "ETHUSDT",
        positionSide: "BOTH",
        side: "BUY",
        price: "3400",
        qty: "1",
        realizedPnl: "0",
        commission: "0",
        commissionAsset: "USDT",
        feeUsd: "0",
        time: WINDOW_START,
      },
    ]);
  });

  it("folds the seed as the first opening fill of a seeded trade", () => {
    const seeds = computeSeeds([windowBuy], positions, WINDOW_START);
    const sell = fill(
      42,
      "ETHUSDT",
      "BOTH",
      "SELL",
      "3700",
      "2.0",
      T(1),
      "400",
      "3.7"
    );

    const open = run(
      [windowBuy, ...seeds],
      [order("ETHUSDT", "BOTH", "SELL", "stop", "3300")]
    ).trades;
    expect(open).toEqual([
      expect.objectContaining({
        tradeKey: `ETHUSDT|BOTH#seed@${WINDOW_START}`,
        openTime: WINDOW_START,
        openTimeApprox: true,
        entryPrice: "3500",
        quantity: "2",
        stopLossPrice: "3300",
      }),
    ]);

    const { trades, logs } = run([windowBuy, ...seeds, sell]);
    expect(trades[0]).toMatchObject({
      tradeKey: `ETHUSDT|BOTH#seed@${WINDOW_START}`,
      status: "closed",
      exitPrice: "3700",
      feeUsd: "5.5",
      realizedPnlUsd: "394.5",
    });
    expect(logs).toEqual([]);
    expectPnlIdentity(trades);
  });

  it("back-solves the same price from realizedPnl when the window also holds the close", () => {
    const sell = fill(
      42,
      "ETHUSDT",
      "BOTH",
      "SELL",
      "3700",
      "2.0",
      T(1),
      "400",
      "3.7"
    );
    expect(computeSeeds([windowBuy, sell], [], WINDOW_START)[0]).toMatchObject({
      side: "BUY",
      qty: "1",
      price: "3400",
    });
  });

  it("back-solves from the closing part only when the first reduce is a flip", () => {
    const flip = fill(
      43,
      "BTCUSDT",
      "BOTH",
      "SELL",
      "101000",
      "0.3",
      T(5),
      "100",
      "3"
    );
    const seeds = computeSeeds(
      [flip],
      [position("BTCUSDT", "BOTH", "-0.2", "101000", T(5))],
      WINDOW_START
    );
    expect(seeds[0]).toMatchObject({
      side: "BUY",
      qty: "0.1",
      price: "100000",
    });
    expectPnlIdentity(run([...seeds, flip]).trades);
  });

  it("signs hedge legs by positionSide", () => {
    const seeds = computeSeeds(
      [],
      [position("BTCUSDT", "SHORT", "0.5", "90000", T(40))],
      WINDOW_START
    );
    expect(seeds[0]).toMatchObject({
      positionSide: "SHORT",
      side: "SELL",
      qty: "0.5",
      price: "90000",
    });
  });
});

describe("reconstruct: opened before the window, closed inside it", () => {
  it("recovers entry from the exchange's realizedPnl and leaves SL/TP null", () => {
    const sell = fill(
      51,
      "SOLUSDT",
      "BOTH",
      "SELL",
      "2000",
      "0.5",
      T(20),
      "-50",
      "1"
    );
    const seeds = computeSeeds([sell], [], WINDOW_START);
    expect(seeds[0]).toMatchObject({ side: "BUY", qty: "0.5", price: "2100" });

    const { trades } = run([...seeds, sell]);
    expect(trades).toEqual([
      expect.objectContaining({
        tradeKey: `SOLUSDT|BOTH#seed@${WINDOW_START}`,
        status: "closed",
        openTimeApprox: true,
        entryPrice: "2100",
        exitPrice: "2000",
        realizedPnlUsd: "-51",
        stopLossPrice: null,
        takeProfitPrice: null,
      }),
    ]);
    expectPnlIdentity(trades);
  });
});

describe("reconstruct: fee paid in BNB", () => {
  it("sums the adapter-converted feeUsd and nets it from realizedPnl", () => {
    const { trades } = run([
      fill(
        61,
        "BTCUSDT",
        "BOTH",
        "BUY",
        "100000",
        "0.1",
        T(2),
        "0",
        "0.005",
        "BNB",
        "3"
      ),
      fill(
        62,
        "BTCUSDT",
        "BOTH",
        "SELL",
        "100500",
        "0.1",
        T(1),
        "50",
        "0.004",
        "BNB",
        "2.6"
      ),
    ]);
    expect(trades[0]).toMatchObject({
      status: "closed",
      feeUsd: "5.6",
      realizedPnlUsd: "44.4",
    });
    expectPnlIdentity(trades);
  });
});

describe("reconstruct: re-sync with overlap (idempotency)", () => {
  const buy = fill(71, "BTCUSDT", "BOTH", "BUY", "100000", "0.1", T(1));

  it("rebuilds identical trades with a stable tradeKey", () => {
    const orders = [order("BTCUSDT", "BOTH", "SELL", "stop", "95000")];
    const first = run([buy], orders);
    const second = run([buy], orders);
    expect(second).toEqual(first);
    expect(first.trades[0]).toMatchObject({
      tradeKey: "BTCUSDT|BOTH#71",
      stopLossPrice: "95000",
    });
  });

  it("refreshes a moved stop and ignores a partial TP ladder", () => {
    const { trades } = run(
      [buy],
      [
        order("BTCUSDT", "BOTH", "SELL", "stop", "98000"),
        order("BTCUSDT", "BOTH", "SELL", "takeProfit", "103000", false, "0.05"),
        order("BTCUSDT", "BOTH", "SELL", "takeProfit", "106000", false, "0.05"),
      ]
    );
    expect(trades[0]).toMatchObject({
      tradeKey: "BTCUSDT|BOTH#71",
      stopLossPrice: "98000",
      takeProfitPrice: null,
    });
  });
});

describe("reconstruct: SL/TP pick", () => {
  const longBuy = fill(81, "BTCUSDT", "BOTH", "BUY", "100000", "0.1", T(1));
  const shortSell = fill(82, "ETHUSDT", "BOTH", "SELL", "3000", "1", T(1));

  it("prefers closePosition orders, then the level that fires first", () => {
    const { trades } = run(
      [longBuy, shortSell],
      [
        order("BTCUSDT", "BOTH", "SELL", "stop", "96000", false, "0.1"),
        order("BTCUSDT", "BOTH", "SELL", "stop", "94000"),
        order("BTCUSDT", "BOTH", "SELL", "takeProfit", "104000", false, "0.2"),
        order("BTCUSDT", "BOTH", "SELL", "takeProfit", "103000", false, "0.1"),
        order("BTCUSDT", "BOTH", "BUY", "stop", "99000"), // wrong side for a long
        order("ETHUSDT", "BOTH", "BUY", "stop", "3100", false, "1"),
        order("ETHUSDT", "BOTH", "BUY", "stop", "3200", false, "1"),
        order("ETHUSDT", "BOTH", "BUY", "takeProfit", "2800", false, "1"),
        order("ETHUSDT", "BOTH", "BUY", "takeProfit", "2900", false, "1"),
      ]
    );
    expect(byKey(trades, "BTCUSDT|BOTH#81")).toMatchObject({
      stopLossPrice: "94000",
      takeProfitPrice: "103000",
    });
    expect(byKey(trades, "ETHUSDT|BOTH#82")).toMatchObject({
      stopLossPrice: "3100",
      takeProfitPrice: "2900",
    });
  });
});

describe("reconstruct: consistency check", () => {
  it("logs a [Sync] line when fill PnL disagrees with prices, without changing the trade", () => {
    const fills = [
      fill(91, "BTCUSDT", "BOTH", "BUY", "100000", "0.1", T(2)),
      fill(92, "BTCUSDT", "BOTH", "SELL", "101000", "0.1", T(1), "90"),
    ];
    const { trades, logs } = run(fills);
    expect(logs).toEqual([
      "[Sync] BTCUSDT|BOTH#91 realizedPnl 90 vs price check 100 (diff -10)",
    ]);
    expect(trades[0]).toMatchObject({ status: "closed", realizedPnlUsd: "90" });
  });
});
