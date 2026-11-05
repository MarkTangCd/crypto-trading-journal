import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "../../drizzle/schema";
import type { Candle, CandleWindow } from "../_core/coinank";

vi.mock("../db", () => ({
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "main",
    balanceUsdt: "1100.5",
  }),
  getTradeStats: vi.fn().mockResolvedValue({ losingStreak: 1 }),
  listTrades: vi.fn().mockResolvedValue([]),
}));

vi.mock("../_core/coinank", () => ({
  fetchCandleWindowAround: vi.fn(),
}));

const { buildInitialMessages } = await import("./contextBuilder");
const { fetchCandleWindowAround } = await import("../_core/coinank");
const { listTrades } = await import("../db");

const ANCHOR_MS = 1_700_000_000_000;
const ANCHOR_SEC = Math.floor(ANCHOR_MS / 1000);
const INTERVAL_SEC = 60 * 60; // 1H

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 42,
    userId: 1,
    accountId: 1,
    tradeKey: "BTCUSDT|BOTH#1",
    exchange: "binance",
    exchangeSymbol: "BTCUSDT",
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: ANCHOR_MS,
    openTimeApprox: false,
    closeTime: ANCHOR_MS + INTERVAL_SEC * 1000,
    entryPrice: "68000",
    exitPrice: "69000",
    quantity: "0.01",
    positionSizeUsdt: "680",
    feeUsd: "0.68",
    realizedPnlUsd: "9.32",
    stopLossPrice: "67500",
    takeProfitPrice: "69500",
    syncedAt: ANCHOR_MS,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCandle(timeSec: number, base: number, volume = 100): Candle {
  return {
    time: timeSec,
    open: base,
    high: base + 50,
    low: base - 50,
    close: base + 25,
    volume,
  };
}

function makeFullWindow(): CandleWindow {
  // 100 before + 100 after, anchor lands at index 100.
  const candles: Candle[] = [];
  for (let i = -100; i < 100; i += 1) {
    candles.push(makeCandle(ANCHOR_SEC + i * INTERVAL_SEC, 68000 + i));
  }
  return { candles, entryIndex: 100, before: 100, after: 100 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildInitialMessages — K-line section", () => {
  it("appends a full ±100 window with header counts and entry index", async () => {
    vi.mocked(fetchCandleWindowAround).mockResolvedValue(makeFullWindow());

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade(),
    });

    expect(user.content).toContain("## 行情上下文 · K 线（1H）");
    expect(user.content).toContain(
      "before=100 · after=100 · entryIndex=100 · 列=[t,o,h,l,c,v]"
    );
    // Compact rows are JSON-array-shaped.
    expect(user.content).toMatch(/\["20[0-9]{2}-[0-9]{2}-[0-9]{2} /);
    expect(fetchCandleWindowAround).toHaveBeenCalledWith({
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      anchorMs: ANCHOR_MS,
      halfSize: 100,
    });
  });

  it("reports after=N when only a partial post-entry window exists (recent trade)", async () => {
    const candles: Candle[] = [];
    for (let i = -100; i < 30; i += 1) {
      candles.push(makeCandle(ANCHOR_SEC + i * INTERVAL_SEC, 68000 + i));
    }
    vi.mocked(fetchCandleWindowAround).mockResolvedValue({
      candles,
      entryIndex: 100,
      before: 100,
      after: 30,
    });

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade(),
    });

    expect(user.content).toContain(
      "before=100 · after=30 · entryIndex=100 · 列=[t,o,h,l,c,v]"
    );
  });

  it("ships the rest of the message and notes the failure when the fetch throws", async () => {
    vi.mocked(fetchCandleWindowAround).mockRejectedValue(
      new Error("network down")
    );

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade(),
    });

    expect(user.content).toContain("## 行情上下文 · K 线（1H）");
    expect(user.content).toContain("无法加载 K 线上下文");
    expect(user.content).toContain("network down");
    // Trade fields still rendered.
    expect(user.content).toContain("## 交易基本信息");
    // No code-fenced kline block leaked through.
    expect(user.content).not.toContain("```");
  });

  it("drops the volume column when the section would exceed the cap", async () => {
    const candles: Candle[] = [];
    for (let i = -100; i < 100; i += 1) {
      // Inflate volume so the with-volume render bloats past the cap.
      candles.push(
        makeCandle(ANCHOR_SEC + i * INTERVAL_SEC, 68000 + i, 1234567890.99)
      );
    }
    vi.mocked(fetchCandleWindowAround).mockResolvedValue({
      candles,
      entryIndex: 100,
      before: 100,
      after: 100,
    });

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade(),
    });

    // After drop, header advertises 5 columns and no row carries a 6th cell.
    expect(user.content).toContain("列=[t,o,h,l,c]");
    expect(user.content).not.toContain("列=[t,o,h,l,c,v]");
    const section = user.content.split(
      "## 行情上下文 · K 线（1H）"
    )[1] as string;
    expect(section.length).toBeLessThan(12000);
  });

  it("rounds prices to the trade's entry-price precision", async () => {
    const candles: Candle[] = [
      {
        time: ANCHOR_SEC,
        open: 0.123456789,
        high: 0.234567,
        low: 0.111111,
        close: 0.222222,
        volume: 10,
      },
    ];
    vi.mocked(fetchCandleWindowAround).mockResolvedValue({
      candles,
      entryIndex: 0,
      before: 0,
      after: 1,
    });

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade({ entryPrice: "0.1234" }),
    });

    // entryPrice has 4 decimals → values truncated/rounded to 4 decimals.
    expect(user.content).toMatch(/0\.1235/);
    expect(user.content).not.toMatch(/0\.123456789/);
  });
});

describe("buildInitialMessages — trade facts", () => {
  beforeEach(() => {
    vi.mocked(fetchCandleWindowAround).mockResolvedValue(makeFullWindow());
  });

  it("renders exchange facts, account state and no manual-entry sections", async () => {
    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade({ openTimeApprox: true }),
    });

    for (const line of [
      "- 交易ID：42",
      "- 交易对：BTCUSDT",
      "- 方向：long",
      "（近似）",
      "- 状态：closed",
      "- 净盈亏(USD)：9.32",
      "- 入场均价：68000",
      "- 出场均价：69000",
      "- 止损：67500",
      "- 止盈：69500",
      "- 数量：0.01",
      "- 仓位规模(USDT)：680",
      "- 手续费(USD)：0.68",
      "- 当前余额：1100.5",
      "- 连续亏损次数：1",
    ]) {
      expect(user.content).toContain(line);
    }
    for (const removed of [
      "周期",
      "交易逻辑",
      "交易要点",
      "复盘笔记",
      "计划",
    ]) {
      expect(user.content).not.toContain(removed);
    }
  });

  it("lists recent same symbol + side trades from listTrades, newest first", async () => {
    vi.mocked(listTrades).mockResolvedValueOnce([
      makeTrade({ id: 50, status: "open", openTime: ANCHOR_MS + 1 }),
      makeTrade({ id: 42 }),
      makeTrade({ id: 41, openTime: ANCHOR_MS - 2, realizedPnlUsd: "-3" }),
      makeTrade({ id: 40, openTime: ANCHOR_MS - 1, realizedPnlUsd: "7" }),
      makeTrade({ id: 39, side: "short" }),
      makeTrade({ id: 38, symbol: "ETHUSDT" }),
    ]);

    const { user } = await buildInitialMessages({
      userId: 1,
      trade: makeTrade(),
    });

    expect(listTrades).toHaveBeenCalledWith(1, 1);
    expect(user.content).toContain("## 最近 3 笔同向同 pair 历史");
    const section = user.content.split("## 最近 3 笔")[1] as string;
    const pnls = Array.from(section.matchAll(/pnl=(\S+)/g)).map(m => m[1]);
    expect(pnls.slice(0, 3)).toEqual(["9.32", "7", "-3"]);
  });
});
