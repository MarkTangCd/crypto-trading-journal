import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getTradeById, listTrades } from "../../db";
import type { Trade } from "../../../drizzle/schema";
import {
  classifyBucket,
  percentileRank,
  summarizeSample,
  type SampleSummary,
} from "./_helpers/baseline";

const DEFAULT_WINDOW = 50;
const MIN_WINDOW = 10;
const MAX_WINDOW = 200;
const MIN_SAMPLE = 5;
const HOUR_MS = 3_600_000;
const RETURN_DECIMALS = 2;
const HOLD_DECIMALS = 1;

const parameters = z.object({
  tradeId: z
    .number()
    .int()
    .positive()
    .describe(
      "Target trade to compare. In a review conversation, use the '交易ID' value from the '## 交易基本信息' block; never invent or default this argument."
    ),
  windowSize: z
    .number()
    .int()
    .min(MIN_WINDOW)
    .max(MAX_WINDOW)
    .default(DEFAULT_WINDOW)
    .describe(
      `Recent-trade window length, ${MIN_WINDOW}–${MAX_WINDOW}. Default ${DEFAULT_WINDOW}.`
    ),
  pairScope: z
    .enum(["all", "same-pair", "same-direction"])
    .default("all")
    .describe(
      "Sample scope: all trades, same trading pair only, or same direction only."
    ),
});

type PairScope = z.infer<typeof parameters>["pairScope"];

interface CurrentBlock {
  id: number;
  symbol: string;
  side: "long" | "short";
  returnPct: number;
  holdHours: number | null;
}

interface PercentileBlock {
  returnRank: number;
  holdRank: number | null;
}

interface OkResult {
  ok: true;
  windowUsed: number;
  scope: PairScope;
  current: CurrentBlock;
  sample: SampleSummary;
  percentile: PercentileBlock;
  interpretation: string;
}

interface ErrResult {
  ok: false;
  error: string;
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function returnPct(trade: Trade): number {
  return (
    (parseFloat(trade.realizedPnlUsd) / parseFloat(trade.positionSizeUsdt)) *
    100
  );
}

function outcomeOf(trade: Trade): "win" | "loss" | "breakeven" {
  const pnl = parseFloat(trade.realizedPnlUsd);
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

// Seeded trades carry an approximate openTime, so their hold time is unknown.
function holdHoursOf(trade: Trade): number | null {
  if (trade.closeTime === null || trade.openTimeApprox) return null;
  return (trade.closeTime - trade.openTime) / HOUR_MS;
}

function scopeLabel(scope: PairScope, pair: string): string {
  if (scope === "same-pair") return `同币种（${pair}）`;
  if (scope === "same-direction") return "同方向";
  return "所有";
}

function buildInterpretation(
  current: CurrentBlock,
  windowUsed: number,
  scope: PairScope,
  sample: SampleSummary,
  percentile: PercentileBlock
): string {
  const bucket = classifyBucket(percentile.returnRank);
  const returnText = round(current.returnPct, RETURN_DECIMALS);
  const medianText = round(sample.medianReturnPct, RETURN_DECIMALS);
  const winRateText = Math.round(sample.winRate);
  return `该手净收益率 ${returnText}%，在你最近 ${windowUsed} 笔${scopeLabel(scope, current.symbol)}交易里位列第 ${percentile.returnRank}%（${bucket}）。胜率 ${winRateText}%，净收益率中位数 ${medianText}%。`;
}

export const compareWithMyBaselineSkill: Skill<typeof parameters> = {
  name: "compare_with_my_baseline",
  category: "analysis",
  description:
    "Compare the target closed trade's net return % (net PnL / position size) against the user's recent closed trades on the same account (default last 50). Returns sample win-rate, net return % quartiles, hold-time stats, and the trade's percentile rank with a Chinese one-liner. Read-only; scoped to the caller's user.",
  parameters,
  async run(args, context): Promise<OkResult | ErrResult> {
    // ctx.userId is the only cross-user guard. Throw rather than ok=false
    // so a missing wiring bug is loud — mirrors get_recent_trades.
    if (context?.userId === undefined) {
      throw new Error(
        "compare_with_my_baseline requires ctx.userId for scoping"
      );
    }

    const target = await getTradeById(args.tradeId, context.userId);
    if (!target) {
      return {
        ok: false,
        error: `找不到交易 #${args.tradeId}（不存在或不属于当前用户）。`,
      };
    }

    if (target.status !== "closed") {
      return {
        ok: false,
        error: `交易 #${args.tradeId} 尚未平仓，没有可比较的净收益率。`,
      };
    }

    const rows = await listTrades(target.accountId, context.userId, "closed");

    interface SampleRow {
      returnPct: number;
      outcome: "win" | "loss" | "breakeven";
      holdHours: number;
    }
    const sampleRows: SampleRow[] = [];
    for (const row of rows) {
      if (row.id === target.id) continue;
      if (args.pairScope === "same-pair" && row.symbol !== target.symbol) {
        continue;
      }
      if (args.pairScope === "same-direction" && row.side !== target.side) {
        continue;
      }
      const holdHours = holdHoursOf(row);
      if (holdHours === null) continue;
      sampleRows.push({
        returnPct: returnPct(row),
        outcome: outcomeOf(row),
        holdHours,
      });
      if (sampleRows.length >= args.windowSize) break;
    }

    if (sampleRows.length < MIN_SAMPLE) {
      return {
        ok: false,
        error: `样本不足：仅找到 ${sampleRows.length} 笔可比较的历史交易，最少需要 ${MIN_SAMPLE} 笔。`,
      };
    }

    const returnValues = sampleRows.map(r => r.returnPct);
    const outcomes = sampleRows.map(r => r.outcome);
    const holdValues = sampleRows.map(r => r.holdHours);
    const sample = summarizeSample(returnValues, outcomes, holdValues);

    const targetReturnPct = returnPct(target);
    const targetHoldHours = holdHoursOf(target);

    const current: CurrentBlock = {
      id: target.id,
      symbol: target.symbol,
      side: target.side,
      returnPct: round(targetReturnPct, RETURN_DECIMALS),
      holdHours:
        targetHoldHours != null ? round(targetHoldHours, HOLD_DECIMALS) : null,
    };

    const percentile: PercentileBlock = {
      returnRank: percentileRank(returnValues, targetReturnPct),
      holdRank:
        targetHoldHours != null
          ? percentileRank(holdValues, targetHoldHours)
          : null,
    };

    const sampleRounded: SampleSummary = {
      winRate: Math.round(sample.winRate),
      medianReturnPct: round(sample.medianReturnPct, RETURN_DECIMALS),
      p25ReturnPct: round(sample.p25ReturnPct, RETURN_DECIMALS),
      p75ReturnPct: round(sample.p75ReturnPct, RETURN_DECIMALS),
      avgHoldHours: round(sample.avgHoldHours, HOLD_DECIMALS),
      medianHoldHours: round(sample.medianHoldHours, HOLD_DECIMALS),
    };

    return {
      ok: true,
      windowUsed: sampleRows.length,
      scope: args.pairScope,
      current,
      sample: sampleRounded,
      percentile,
      interpretation: buildInterpretation(
        current,
        sampleRows.length,
        args.pairScope,
        sampleRounded,
        percentile
      ),
    };
  },
};

register(compareWithMyBaselineSkill);
