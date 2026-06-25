import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "../../drizzle/schema";
import type { Candle, CandleWindow } from "../_core/coinank";

vi.mock("../db", () => ({
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "main",
    initialBalance: "1000",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getAccountSnapshot: vi
    .fn()
    .mockResolvedValue({ currentBalance: "1100.00", consecutiveLosses: 1 }),
  getTransactionsByUserId: vi.fn().mockResolvedValue([]),
}));

vi.mock("../_core/coinank", () => ({
  fetchCandleWindowAround: vi.fn(),
}));

const { buildInitialMessages } = await import("./contextBuilder");
const { fetchCandleWindowAround } = await import("../_core/coinank");

const ANCHOR_MS = 1_700_000_000_000;
const ANCHOR_SEC = Math.floor(ANCHOR_MS / 1000);
const INTERVAL_SEC = 60 * 60; // 1H

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 42,
    userId: 1,
    accountId: 1,
    status: "closed",
    accountBalance: "1100",
    tradingPair: "BTCUSDT",
    timeFrame: "1H",
    startTime: ANCHOR_MS,
    endTime: ANCHOR_MS + INTERVAL_SEC * 1000,
    direction: "long",
    tradingLogic: "breakout retest",
    context: "btc broke prior day high",
    tradeItems: ["entry on 1h close", "stop below pdl"],
    outcome: "win",
    consecutiveLosses: 0,
    riskRewardRatio: "2.1",
    returnAmount: "100",
    entryPrice: "68000",
    exitPrice: "69000",
    plannedStopLossPrice: "67500",
    plannedTakeProfitPrice: "69500",
    plannedRiskRewardRatio: "3",
    positionSizeUsdt: "500",
    tvUrl: null,
    marketCycle: null,
    transactionType: null,
    reviewFeedback: null,
    reviewChartUrl: null,
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
      transaction: makeTransaction(),
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
      transaction: makeTransaction(),
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
      transaction: makeTransaction(),
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
      transaction: makeTransaction(),
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
      transaction: makeTransaction({ entryPrice: "0.1234" }),
    });

    // entryPrice has 4 decimals → values truncated/rounded to 4 decimals.
    expect(user.content).toMatch(/0\.1235/);
    expect(user.content).not.toMatch(/0\.123456789/);
  });
});
