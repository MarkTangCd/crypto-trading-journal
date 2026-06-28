import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getTransactionById, getTransactionsByUserId } from "../../db";
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
const R_DECIMALS = 2;
const HOLD_DECIMALS = 1;

const parameters = z.object({
  transactionId: z
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
  tradingPair: string;
  direction: "long" | "short";
  status: string;
  r: number;
  holdHours: number | null;
}

interface PercentileBlock {
  rRank: number;
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
  const bucket = classifyBucket(percentile.rRank);
  const rText = round(current.r, R_DECIMALS);
  const medianText = round(sample.medianR, R_DECIMALS);
  const winRateText = Math.round(sample.winRate);
  return `该手 r:r ${rText}，在你最近 ${windowUsed} 笔${scopeLabel(scope, current.tradingPair)}交易里位列第 ${percentile.rRank}%（${bucket}）。胜率 ${winRateText}%，r:r 中位数 ${medianText}。`;
}

export const compareWithMyBaselineSkill: Skill<typeof parameters> = {
  name: "compare_with_my_baseline",
  category: "analysis",
  description:
    "Compare the target trade's r:r against the user's recent sample (default last 50). Returns sample win-rate, r:r quartiles, hold-time stats, and the trade's percentile rank with a Chinese one-liner. Read-only; scoped to the caller's user.",
  parameters,
  async run(args, context): Promise<OkResult | ErrResult> {
    // ctx.userId is the only cross-user guard. Throw rather than ok=false
    // so a missing wiring bug is loud — mirrors get_recent_trades.
    if (context?.userId === undefined) {
      throw new Error(
        "compare_with_my_baseline requires ctx.userId for scoping"
      );
    }

    const target = await getTransactionById(args.transactionId, context.userId);
    if (!target) {
      return {
        ok: false,
        error: `找不到交易 #${args.transactionId}（不存在或不属于当前用户）。`,
      };
    }

    const targetR = target.riskRewardRatio
      ? parseFloat(target.riskRewardRatio)
      : NaN;
    if (!Number.isFinite(targetR)) {
      return {
        ok: false,
        error: `交易 #${args.transactionId} 没有可比较的 r:r 数据。`,
      };
    }

    const filterOpts: Parameters<typeof getTransactionsByUserId>[1] = {
      sortBy: "startTime",
      sortOrder: "desc",
    };
    if (args.pairScope === "same-pair") {
      filterOpts.tradingPair = target.tradingPair;
    } else if (args.pairScope === "same-direction") {
      filterOpts.direction = target.direction;
    }

    const rows = await getTransactionsByUserId(context.userId, filterOpts);

    interface SampleRow {
      r: number;
      outcome: "win" | "loss" | "breakeven";
      holdHours: number;
    }
    const sampleRows: SampleRow[] = [];
    for (const row of rows) {
      if (row.id === target.id) continue;
      if (row.status !== "closed" && row.status !== "reviewed") continue;
      if (!row.endTime) continue;
      if (!row.outcome) continue;
      if (!row.riskRewardRatio) continue;
      const r = parseFloat(row.riskRewardRatio);
      if (!Number.isFinite(r)) continue;
      sampleRows.push({
        r,
        outcome: row.outcome,
        holdHours: (row.endTime - row.startTime) / HOUR_MS,
      });
      if (sampleRows.length >= args.windowSize) break;
    }

    if (sampleRows.length < MIN_SAMPLE) {
      return {
        ok: false,
        error: `样本不足：仅找到 ${sampleRows.length} 笔可比较的历史交易，最少需要 ${MIN_SAMPLE} 笔。`,
      };
    }

    const rrValues = sampleRows.map(r => r.r);
    const outcomes = sampleRows.map(r => r.outcome);
    const holdValues = sampleRows.map(r => r.holdHours);
    const sample = summarizeSample(rrValues, outcomes, holdValues);

    const targetHoldHours =
      target.endTime != null
        ? (target.endTime - target.startTime) / HOUR_MS
        : null;

    const current: CurrentBlock = {
      id: target.id,
      tradingPair: target.tradingPair,
      direction: target.direction,
      status: target.status,
      r: round(targetR, R_DECIMALS),
      holdHours:
        targetHoldHours != null ? round(targetHoldHours, HOLD_DECIMALS) : null,
    };

    const percentile: PercentileBlock = {
      rRank: percentileRank(rrValues, targetR),
      holdRank:
        targetHoldHours != null
          ? percentileRank(holdValues, targetHoldHours)
          : null,
    };

    const sampleRounded: SampleSummary = {
      winRate: Math.round(sample.winRate),
      medianR: round(sample.medianR, R_DECIMALS),
      p25R: round(sample.p25R, R_DECIMALS),
      p75R: round(sample.p75R, R_DECIMALS),
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
