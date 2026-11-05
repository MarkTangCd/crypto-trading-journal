import type { Trade } from "../../drizzle/schema";
import type { ChatMessage } from "./providers/types";
import { getAccountById, getTradeStats, listTrades } from "../db";
import {
  type Candle,
  type CandleWindow,
  fetchCandleWindowAround,
} from "../_core/coinank";
import { formatUtc8CandleTime, formatUtc8Prompt } from "@shared/time";

const SIMILAR_TRADE_LIMIT = 5;
const KLINE_HALF_SIZE = 100;
// Trades carry no timeFrame; one fixed interval anchored at openTime.
const KLINE_INTERVAL = "1H";
// Soft cap on the rendered K-line section. ±100 candles with timestamps +
// 4 prices is ~9-10 KB on its own; the cap exists to drop the volume column
// when high-volume markets push the block well above its typical width.
const KLINE_SECTION_CHAR_CAP = 12000;

interface BuildOptions {
  userId: number;
  trade: Trade;
}

/**
 * Builds the first two messages of a review conversation: a system prompt
 * defining the agent's role, plus a user-shaped message that lays out
 * everything the agent needs to know about this specific trade and the
 * surrounding account state.
 *
 * Phase 2 will extend this with a `kline` block; the shape here is
 * intentionally additive so that change is mechanical.
 */
export async function buildInitialMessages({
  userId,
  trade,
}: BuildOptions): Promise<{ system: ChatMessage; user: ChatMessage }> {
  const account = await getAccountById(trade.accountId, userId);
  const snapshot = {
    currentBalance: account?.balanceUsdt ?? "未知",
    consecutiveLosses: account
      ? (await getTradeStats(account.id, userId)).losingStreak
      : 0,
  };

  // listTrades orders open first; re-sort so "recent" means newest openTime.
  const recent = (await listTrades(trade.accountId, userId))
    .filter(
      row =>
        row.id !== trade.id &&
        row.symbol === trade.symbol &&
        row.side === trade.side
    )
    .sort((a, b) => b.openTime - a.openTime)
    .slice(0, SIMILAR_TRADE_LIMIT);

  const klineBlock = await loadKlineBlock(trade);

  return {
    system: { role: "system", content: SYSTEM_PROMPT },
    user: {
      role: "user",
      content: renderUserContext({ trade, snapshot, recent, klineBlock }),
    },
  };
}

async function loadKlineBlock(trade: Trade): Promise<string> {
  try {
    const window = await fetchCandleWindowAround({
      tradingPair: trade.symbol,
      timeFrame: KLINE_INTERVAL,
      anchorMs: trade.openTime,
      halfSize: KLINE_HALF_SIZE,
    });
    return renderKlineSection(trade, window);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[contextBuilder] kline fetch failed", reason);
    return [
      "",
      `## 行情上下文 · K 线（${KLINE_INTERVAL}）`,
      `> 无法加载 K 线上下文（${reason}），其余信息照常使用。`,
    ].join("\n");
  }
}

function renderKlineSection(trade: Trade, window: CandleWindow): string {
  if (window.candles.length === 0) {
    return [
      "",
      `## 行情上下文 · K 线（${KLINE_INTERVAL}）`,
      "> 该交易对在此时间段无可用 K 线数据。",
    ].join("\n");
  }

  const decimals = pricePrecision(trade.entryPrice);
  const withVolume = composeKlineBlock(window, decimals, true);
  if (withVolume.length <= KLINE_SECTION_CHAR_CAP) return withVolume;

  console.warn(
    `[contextBuilder] dropped volume column to fit ${KLINE_SECTION_CHAR_CAP}-char cap`
  );
  return composeKlineBlock(window, decimals, false);
}

function composeKlineBlock(
  window: CandleWindow,
  decimals: number,
  includeVolume: boolean
): string {
  const cols = includeVolume ? "[t,o,h,l,c,v]" : "[t,o,h,l,c]";
  const entryLabel = window.entryIndex === null ? "无" : window.entryIndex;
  const lines: string[] = [];
  lines.push("");
  lines.push(`## 行情上下文 · K 线（${KLINE_INTERVAL}）`);
  lines.push(
    `before=${window.before} · after=${window.after} · entryIndex=${entryLabel} · 列=${cols}`
  );
  lines.push("```");
  for (const candle of window.candles) {
    lines.push(formatCandle(candle, decimals, includeVolume));
  }
  lines.push("```");
  return lines.join("\n");
}

function formatCandle(
  candle: Candle,
  decimals: number,
  includeVolume: boolean
): string {
  const t = formatCandleTime(candle.time);
  const cells: (string | number)[] = [
    JSON.stringify(t),
    fmtPrice(candle.open, decimals),
    fmtPrice(candle.high, decimals),
    fmtPrice(candle.low, decimals),
    fmtPrice(candle.close, decimals),
  ];
  if (includeVolume) {
    cells.push(candle.volume != null ? Number(candle.volume.toFixed(2)) : 0);
  }
  return `[${cells.join(",")}],`;
}

function formatCandleTime(timeSec: number): string {
  return formatUtc8CandleTime(timeSec);
}

function pricePrecision(entryPrice: string | null | undefined): number {
  if (!entryPrice) return 6;
  const dot = entryPrice.indexOf(".");
  if (dot === -1) return 0;
  return Math.min(entryPrice.length - dot - 1, 10);
}

function fmtPrice(value: number, decimals: number): string {
  if (decimals === 0) return Math.round(value).toString();
  return value.toFixed(decimals);
}

const SYSTEM_PROMPT = `你是一名严格但克制的加密货币交易复盘搭子。
你的工作不是夸奖也不是劝阻，而是帮交易者把这一笔交易拆开看清楚：
- 计划与执行有无偏差；
- 入场、止损、止盈的依据是否成立；
- 仓位与账户状态（连亏次数、当前余额）是否匹配；
- 当时的市场背景是否真的支持这个方向。

回答规则：
1. 始终使用中文。
2. 用具体数字、具体时间点、具体的"如果当时…会怎样"来表达，避免空泛建议。
3. 主动提出 1 个最关键的反问，而不是堆砌结论。
4. 如果信息不足以判断某一点，直接说"我不知道，需要 X 才能判断"。
5. 所有时间均为 UTC+8：上下文中给出的时间已经是 UTC+8，你在回复中提及任何时间一律按 UTC+8 表述，不要自行做时区换算。`;

interface RenderInput {
  trade: Trade;
  snapshot: { currentBalance: string; consecutiveLosses: number };
  recent: Trade[];
  klineBlock: string;
}

function renderUserContext({
  trade,
  snapshot,
  recent,
  klineBlock,
}: RenderInput): string {
  const lines: string[] = [];
  lines.push("以下是这笔交易的完整记录，请阅读后给出你的初步复盘意见。");
  lines.push("");
  lines.push("## 交易基本信息");
  lines.push(`- 交易ID：${trade.id}`);
  lines.push(`- 交易对：${trade.symbol}`);
  lines.push(`- 方向：${trade.side}`);
  lines.push(
    `- 开仓时间：${fmtTime(trade.openTime)}${trade.openTimeApprox ? "（近似）" : ""}`
  );
  lines.push(
    `- 平仓时间：${trade.closeTime ? fmtTime(trade.closeTime) : "未平仓"}`
  );
  lines.push(`- 状态：${trade.status}`);
  lines.push(`- 净盈亏(USD)：${trade.realizedPnlUsd}`);

  lines.push("");
  lines.push("## 价格与风险");
  lines.push(`- 入场均价：${trade.entryPrice}`);
  if (trade.exitPrice) lines.push(`- 出场均价：${trade.exitPrice}`);
  if (trade.stopLossPrice) lines.push(`- 止损：${trade.stopLossPrice}`);
  if (trade.takeProfitPrice) lines.push(`- 止盈：${trade.takeProfitPrice}`);
  lines.push(`- 数量：${trade.quantity}`);
  lines.push(`- 仓位规模(USDT)：${trade.positionSizeUsdt}`);
  lines.push(`- 手续费(USD)：${trade.feeUsd}`);

  lines.push("");
  lines.push("## 账户状态");
  lines.push(`- 当前余额：${snapshot.currentBalance}`);
  lines.push(`- 连续亏损次数：${snapshot.consecutiveLosses}`);

  if (recent.length > 0) {
    lines.push("");
    lines.push(`## 最近 ${recent.length} 笔同向同 pair 历史（按开仓时间倒序）`);
    recent.forEach(row => {
      lines.push(
        `- ${fmtTime(row.openTime)} · ${row.status} · pnl=${row.realizedPnlUsd}`
      );
    });
  }

  if (klineBlock) lines.push(klineBlock);

  lines.push("");
  lines.push(
    "请先给出 3-5 句结构化初评（执行是否到位 / 风险敞口是否合理 / 关键的反问）。"
  );

  return lines.join("\n");
}

function fmtTime(ms: number): string {
  return formatUtc8Prompt(ms);
}
