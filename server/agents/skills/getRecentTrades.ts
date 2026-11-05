import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getAccountsByUserId, listTrades } from "../../db";
import { formatUtc8Prompt } from "@shared/time";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

const parameters = z.object({
  symbol: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional pair filter, e.g. BTCUSDT. Will be normalized to uppercase."
    ),
  side: z.enum(["long", "short"]).optional().describe("Optional side filter."),
  status: z
    .enum(["open", "closed"])
    .optional()
    .describe("Optional status filter."),
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
    "Fetch the user's recent trades (synced from the exchange), newest-first by open time. Use this to ground review with comparable historical setups (same pair, same side). Returns exchange facts only, scoped to the current user: prices, quantity, size, fees and net PnL (realizedPnlUsd, after fees). openTime/closeTime are epoch milliseconds (pass directly as anchorMs to kline tools); openTimeText/closeTimeText are the same instants as UTC+8 wall-clock strings — quote these when mentioning times. openTimeApprox=true means the open time is only approximate.",
  parameters,
  async run(args, context) {
    // ctx.userId is the ONLY guard against cross-user reads — runTools always
    // forwards it from the caller's session. Defensive throw so a future
    // caller that forgets to thread context can never bypass scoping.
    if (context?.userId === undefined) {
      throw new Error("get_recent_trades requires ctx.userId for scoping");
    }
    const userId = context.userId;

    const symbol = args.symbol?.toUpperCase();
    const accounts = await getAccountsByUserId(userId);
    const rows = (
      await Promise.all(
        accounts.map(account => listTrades(account.id, userId, args.status))
      )
    )
      .flat()
      .filter(
        row =>
          (symbol === undefined || row.symbol === symbol) &&
          (args.side === undefined || row.side === args.side)
      )
      .sort((a, b) => b.openTime - a.openTime);

    const trades = rows.slice(0, args.limit).map(row => ({
      id: row.id,
      symbol: row.symbol,
      side: row.side,
      status: row.status,
      openTime: row.openTime,
      openTimeText: formatUtc8Prompt(row.openTime),
      openTimeApprox: row.openTimeApprox,
      closeTime: row.closeTime,
      closeTimeText:
        row.closeTime === null ? null : formatUtc8Prompt(row.closeTime),
      entryPrice: row.entryPrice,
      exitPrice: row.exitPrice,
      stopLossPrice: row.stopLossPrice,
      takeProfitPrice: row.takeProfitPrice,
      quantity: row.quantity,
      positionSizeUsdt: row.positionSizeUsdt,
      feeUsd: row.feeUsd,
      realizedPnlUsd: row.realizedPnlUsd,
    }));

    return {
      total: rows.length,
      returned: trades.length,
      trades,
    };
  },
};

register(getRecentTradesSkill);
