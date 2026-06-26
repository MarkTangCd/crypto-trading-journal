import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getTransactionsByUserId } from "../../db";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

const parameters = z.object({
  tradingPair: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional pair filter, e.g. BTCUSDT. Will be normalized to uppercase."
    ),
  direction: z
    .enum(["long", "short"])
    .optional()
    .describe("Optional direction filter."),
  outcome: z
    .enum(["win", "loss", "breakeven"])
    .optional()
    .describe("Optional outcome filter; only matches closed trades."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Row cap. Hard ceiling ${MAX_LIMIT}.`),
});

export const getRecentTradesSkill: Skill<typeof parameters> = {
  name: "get_recent_trades",
  category: "internal",
  description:
    "Fetch the user's recent trades, newest-first by start time. Use this to ground review with comparable historical setups (same pair, same direction, similar outcome). Returns a compact field set scoped to the current user.",
  parameters,
  async run(args, context) {
    // ctx.userId is the ONLY guard against cross-user reads — runTools always
    // forwards it from the caller's session. Defensive throw so a future
    // caller that forgets to thread context can never bypass scoping.
    if (context?.userId === undefined) {
      throw new Error("get_recent_trades requires ctx.userId for scoping");
    }

    const rows = await getTransactionsByUserId(context.userId, {
      ...(args.tradingPair
        ? { tradingPair: args.tradingPair.toUpperCase() }
        : {}),
      ...(args.direction ? { direction: args.direction } : {}),
      ...(args.outcome ? { outcome: args.outcome } : {}),
      sortBy: "startTime",
      sortOrder: "desc",
    });

    const trades = rows.slice(0, args.limit).map(row => ({
      id: row.id,
      tradingPair: row.tradingPair,
      direction: row.direction,
      status: row.status,
      outcome: row.outcome,
      riskRewardRatio: row.riskRewardRatio,
      returnAmount: row.returnAmount,
      startTime: row.startTime,
      endTime: row.endTime,
      context: row.context,
    }));

    return {
      total: rows.length,
      returned: trades.length,
      trades,
    };
  },
};

register(getRecentTradesSkill);
