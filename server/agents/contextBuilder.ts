import type { Transaction } from "../../drizzle/schema";
import type { ChatMessage } from "./providers/types";
import {
  getAccountById,
  getAccountSnapshot,
  getTransactionsByUserId,
} from "../db";

const SIMILAR_TRADE_LIMIT = 5;

interface BuildOptions {
  userId: number;
  transaction: Transaction;
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
  transaction,
}: BuildOptions): Promise<{ system: ChatMessage; user: ChatMessage }> {
  const account = await getAccountById(transaction.accountId, userId);
  const snapshot = account
    ? await getAccountSnapshot(account.id, account.initialBalance)
    : { currentBalance: "未知", consecutiveLosses: 0 };

  const sameDirection = await getTransactionsByUserId(userId, {
    accountId: transaction.accountId,
    tradingPair: transaction.tradingPair,
    direction: transaction.direction,
    sortBy: "startTime",
    sortOrder: "desc",
  });

  const recent = sameDirection
    .filter(row => row.id !== transaction.id)
    .slice(0, SIMILAR_TRADE_LIMIT);

  return {
    system: { role: "system", content: SYSTEM_PROMPT },
    user: {
      role: "user",
      content: renderUserContext({ transaction, snapshot, recent }),
    },
  };
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
4. 如果信息不足以判断某一点，直接说"我不知道，需要 X 才能判断"。`;

interface RenderInput {
  transaction: Transaction;
  snapshot: { currentBalance: string; consecutiveLosses: number };
  recent: Transaction[];
}

function renderUserContext({
  transaction,
  snapshot,
  recent,
}: RenderInput): string {
  const lines: string[] = [];
  lines.push("以下是这笔交易的完整记录，请阅读后给出你的初步复盘意见。");
  lines.push("");
  lines.push("## 交易基本信息");
  lines.push(`- 交易对：${transaction.tradingPair}`);
  lines.push(`- 方向：${transaction.direction}`);
  lines.push(`- 周期：${transaction.timeFrame}`);
  lines.push(`- 开仓时间：${fmtTime(transaction.startTime)}`);
  lines.push(
    `- 平仓时间：${transaction.endTime ? fmtTime(transaction.endTime) : "未平仓"}`
  );
  lines.push(`- 状态：${transaction.status}`);
  if (transaction.outcome) lines.push(`- 结果：${transaction.outcome}`);
  if (transaction.returnAmount)
    lines.push(`- 盈亏：${transaction.returnAmount}`);

  lines.push("");
  lines.push("## 价格与风险");
  if (transaction.entryPrice)
    lines.push(`- 计划入场：${transaction.entryPrice}`);
  if (transaction.exitPrice) lines.push(`- 实际出场：${transaction.exitPrice}`);
  if (transaction.plannedStopLossPrice)
    lines.push(`- 计划止损：${transaction.plannedStopLossPrice}`);
  if (transaction.plannedTakeProfitPrice)
    lines.push(`- 计划止盈：${transaction.plannedTakeProfitPrice}`);
  if (transaction.plannedRiskRewardRatio)
    lines.push(`- 计划盈亏比：1:${transaction.plannedRiskRewardRatio}`);
  if (transaction.riskRewardRatio)
    lines.push(`- 实际盈亏比：1:${transaction.riskRewardRatio}`);
  if (transaction.positionSizeUsdt)
    lines.push(`- 仓位规模(USDT)：${transaction.positionSizeUsdt}`);

  lines.push("");
  lines.push("## 交易逻辑（trader 自己写的）");
  if (transaction.context) {
    lines.push(transaction.context);
  } else if (transaction.tradingLogic) {
    lines.push(transaction.tradingLogic);
  } else {
    lines.push("（未填写）");
  }
  if (transaction.tradeItems && transaction.tradeItems.length > 0) {
    lines.push("");
    lines.push("交易要点：");
    transaction.tradeItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  lines.push("");
  lines.push("## 账户状态");
  lines.push(`- 当前余额：${snapshot.currentBalance}`);
  lines.push(`- 连续亏损次数：${snapshot.consecutiveLosses}`);

  if (recent.length > 0) {
    lines.push("");
    lines.push(`## 最近 ${recent.length} 笔同向同 pair 历史（按开仓时间倒序）`);
    recent.forEach(row => {
      const outcome = row.outcome ?? "—";
      const pnl = row.returnAmount ?? "—";
      lines.push(
        `- ${fmtTime(row.startTime)} · ${row.timeFrame} · ${outcome} · pnl=${pnl}`
      );
    });
  }

  if (transaction.reviewFeedback) {
    lines.push("");
    lines.push("## 之前已写的复盘笔记");
    lines.push(transaction.reviewFeedback);
  }

  lines.push("");
  lines.push(
    "请先给出 3-5 句结构化初评（执行是否到位 / 风险敞口是否合理 / 关键的反问）。"
  );

  return lines.join("\n");
}

function fmtTime(ms: number): string {
  const date = new Date(ms);
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
