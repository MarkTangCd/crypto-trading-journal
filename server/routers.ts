import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  // Accounts
  createAccount,
  getAccountById,
  getAccountsByUserId,
  updateAccount,
  deleteAccountCascade,
  getAccountCount,
  toPublicAccount,
  // Trades
  TradeEditError,
  getTradeById,
  getTradeStats,
  getDailyPnl,
  listTrades,
  updateTradeByHand,
  // Pre-trade
  listPreTradesByUser,
  // Goals
  createGoal,
  getGoalById,
  listGoalsByUserId,
  updateGoal,
  deleteGoal,
  // Plans
  getPlanRow,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  addScenario,
  updateScenario,
  deleteScenario,
  addObservation,
  updateObservation,
  deleteObservation,
  closePlan,
  reopenPlan,
  deletePlan,
  listTradeSymbols,
  // Journal
  listJournalEntries,
  getJournalEntry,
  listPickableTrades,
  getJournalEntryForTrade,
  createJournalEntry,
  updateJournalEntry,
  setJournalEntrySetups,
  addJournalEntryTrade,
  removeJournalEntryTrade,
  addSlotImage,
  removeSlotImage,
  setJournalEntryReviewedAt,
  deleteJournalEntry,
  getImageOwner,
  type JournalEntryDetail,
  // Setups
  listSetups,
  getSetup,
  getSetupRow,
  findSetupByName,
  createSetup,
  updateSetup,
  deleteSetup,
} from "./db";
import type { TrpcContext } from "./_core/context";
import type { Account, Goal, Plan, Trade } from "../drizzle/schema";
import { normalize as normalizeDecimal } from "./_core/decimal";
import {
  DECIMAL_PATTERN,
  EMOTIONS,
  ENTRY_TRIGGER_MAX,
  JOURNAL_SLOTS,
  SCENARIO_NAME_MAX,
  SCENARIO_OUTCOMES,
  SCENARIO_SIDES,
  SCENARIO_TIME_FRAMES,
  SETUP_NAME_MAX,
  SLOT_IMAGE_MAX,
  TIME_FRAMES,
  TRADING_PAIR_RE,
} from "@shared/const";
import { isEmptyDoc, richTextDocSchema } from "@shared/richText";
import { fetchCandles } from "./_core/coinank";
import {
  getActiveConversation,
  listReviewMessages,
  openConversation,
  sendUserMessage,
} from "./agents/reviewAgent";
import {
  createSession as createPreTradeSession,
  getActiveConversation as getActivePreTradeConversation,
  listPreTradeMessages,
  sendUserMessage as sendPreTradeUserMessage,
} from "./agents/preTradeAgent";
import { ProviderError } from "./agents/providers/types";
import { listProviders } from "./agents/providers/registry";
import { listSkillMetadata } from "./agents/skillRegistry";
import {
  encrypt,
  getProviderConfig,
  hasToolApiKey,
  setProviderConfig,
  setToolApiKey,
  type ToolId,
} from "./agents/secrets";
import { getAgentSettings, upsertAgentSettings } from "./db";
import { createBinanceAdapter } from "./exchange/binance";
import { ExchangeError } from "./exchange/errors";
import { autoSync, runSync } from "./exchange/sync";

// Derived from the static registry at module load. z.enum needs a non-empty
// tuple, so cast after asserting at least one provider exists.
const SUPPORTED_PROVIDER_IDS = listProviders().map(p => p.id) as [
  string,
  ...string[],
];
const providerIdSchema = z.enum(SUPPORTED_PROVIDER_IDS);

// Hand-entered price level: a positive plain decimal, stored normalized.
const priceLevel = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "Invalid price")
  .refine(value => /[1-9]/.test(value), "Price must be positive")
  .transform(normalizeDecimal);

/**
 * Key verification at link time: any failure, returned or thrown by the
 * adapter, is BAD_REQUEST with the sync error code as message and nothing
 * is written. Returns the encrypted pair on success.
 */
async function verifyAndEncryptKey(apiKey: string, apiSecret: string) {
  let code: string | undefined;
  try {
    const verification = await createBinanceAdapter().verifyKey({
      apiKey,
      apiSecret,
    });
    if (!verification.ok) code = verification.code;
  } catch (error) {
    if (!(error instanceof ExchangeError)) throw error;
    console.error(`[Account] key verification ${error.code}`, error.detail);
    code = error.code;
  }
  if (code) throw new TRPCError({ code: "BAD_REQUEST", message: code });
  return { apiKey: encrypt(apiKey), apiSecret: encrypt(apiSecret) };
}

// Ownership guards. Both throw FORBIDDEN when the row is missing or owned by
// another user so that the procedure never silently leaks foreign data.
async function requireOwnedAccount(
  ctx: TrpcContext,
  accountId: number
): Promise<Account> {
  const account = await getAccountById(accountId, ctx.user.id);
  if (!account) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account not found or not owned by user",
    });
  }
  return account;
}

async function requireOwnedGoal(
  ctx: TrpcContext,
  goalId: number
): Promise<Goal> {
  const goal = await getGoalById(goalId, ctx.user.id);
  if (!goal) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Goal not found",
    });
  }
  return goal;
}

function normalizeGoalText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Goal text cannot be empty",
    });
  }
  return trimmed;
}

const planSymbol = z.string().trim().toUpperCase().regex(TRADING_PAIR_RE, {
  message: "Invalid symbol",
});
const scenarioName = z.string().trim().min(1).max(SCENARIO_NAME_MAX);
const observationContent = richTextDocSchema.refine(doc => !isEmptyDoc(doc), {
  message: "Observation cannot be empty",
});

const setupName = z.string().trim().min(1).max(SETUP_NAME_MAX);
const setupTriggers = z
  .array(z.string().trim().min(1).max(ENTRY_TRIGGER_MAX))
  .refine(
    triggers =>
      new Set(triggers.map(t => t.toLowerCase())).size === triggers.length,
    { message: "Duplicate entry trigger" }
  );

// Planned price: a positive plain decimal, stored as typed (trimmed); blank
// clears it.
const plannedPrice = z
  .string()
  .trim()
  .refine(
    value =>
      value === "" || (DECIMAL_PATTERN.test(value) && /[1-9]/.test(value)),
    "Invalid price"
  )
  .transform(value => (value === "" ? null : value))
  .nullable()
  .optional();
const richTextField = richTextDocSchema.nullable().optional();
const distinct = (ids: number[]) => new Set(ids).size === ids.length;
const REVIEW_FIELDS = [
  "mistakes",
  "rules",
  "managementDecisions",
  "nextTime",
] as const;

function notFound(
  what:
    | "Plan"
    | "Scenario"
    | "Observation"
    | "Setup"
    | "Journal entry"
    | "Trade"
    | "Image"
): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

// Setup names are unique per user, case-insensitively.
async function requireFreeSetupName(
  ctx: TrpcContext,
  name: string,
  setupId?: number
): Promise<void> {
  const taken = await findSetupByName(ctx.user.id, name);
  if (taken && taken.id !== setupId) {
    throw new TRPCError({ code: "CONFLICT", message: "Setup name is taken" });
  }
}

async function requireEntry(
  ctx: TrpcContext,
  entryId: number
): Promise<JournalEntryDetail> {
  const entry = await getJournalEntry(ctx.user.id, entryId);
  if (!entry) throw notFound("Journal entry");
  return entry;
}

// Every write to a reviewed entry except reopen and delete is a CONFLICT.
async function requireUnreviewedEntry(
  ctx: TrpcContext,
  entryId: number
): Promise<JournalEntryDetail> {
  const entry = await requireEntry(ctx, entryId);
  if (entry.reviewedAt !== null) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Journal entry is reviewed",
    });
  }
  return entry;
}

// The review (fields, after slot, markReviewed) waits for every linked trade
// to close.
function requireClosedTrades(entry: JournalEntryDetail): void {
  if (entry.openTradeCount > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Waiting for ${entry.openTradeCount} open trade(s) to close`,
    });
  }
}

async function requireTrade(ctx: TrpcContext, tradeId: number): Promise<Trade> {
  const trade = await getTradeById(tradeId, ctx.user.id);
  if (!trade) throw notFound("Trade");
  return trade;
}

// A trade belongs to at most one entry, enforced by a unique index: when
// `link` fails and one of the trades turns out linked, that is a CONFLICT
// (already linked before, or a concurrent link won).
async function linkTrades<T>(
  ctx: TrpcContext,
  tradeIds: number[],
  link: () => Promise<T>
): Promise<T> {
  try {
    return await link();
  } catch (error) {
    for (const tradeId of tradeIds) {
      if (await getJournalEntryForTrade(ctx.user.id, tradeId)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Trade is already in a journal entry",
        });
      }
    }
    throw error;
  }
}

async function requirePlan(ctx: TrpcContext, planId: number): Promise<Plan> {
  const plan = await getPlanRow(ctx.user.id, planId);
  if (!plan) throw notFound("Plan");
  return plan;
}

// Every write to a closed plan except reopen and delete is a CONFLICT.
async function requireOpenPlan(
  ctx: TrpcContext,
  planId: number
): Promise<Plan> {
  const plan = await requirePlan(ctx, planId);
  if (plan.closedAt !== null) {
    throw new TRPCError({ code: "CONFLICT", message: "Plan is closed" });
  }
  return plan;
}

export const appRouter = router({
  system: systemRouter,

  // Trades reconstructed from exchange fills; only a few fields are hand-edited.
  trade: router({
    list: publicProcedure
      .input(
        z.object({
          accountId: z.number(),
          status: z.enum(["open", "closed"]).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        await requireOwnedAccount(ctx, input.accountId);
        return listTrades(input.accountId, ctx.user.id, input.status);
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const trade = await getTradeById(input.id, ctx.user.id);
        if (!trade) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trade not found",
          });
        }
        return trade;
      }),

    update: publicProcedure
      .input(
        z
          .object({
            id: z.number(),
            stopLossPrice: priceLevel.nullable().optional(),
            takeProfitPrice: priceLevel.nullable().optional(),
            openTime: z.number().int().positive().optional(),
          })
          .refine(
            ({ id: _id, ...patch }) =>
              Object.values(patch).some(value => value !== undefined),
            "Nothing to update"
          )
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        let trade;
        try {
          trade = await updateTradeByHand(id, ctx.user.id, patch);
        } catch (error) {
          if (error instanceof TradeEditError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          }
          throw error;
        }
        if (!trade) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trade not found",
          });
        }
        return trade;
      }),
  }),

  // Statistics
  stats: router({
    get: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await requireOwnedAccount(ctx, input.accountId);
        const stats = await getTradeStats(account.id, ctx.user.id);
        return {
          ...stats,
          balanceUsdt: account.balanceUsdt,
          unrealizedPnlUsdt: account.unrealizedPnlUsdt,
          lastSyncedAt: account.lastSyncedAt,
        };
      }),

    dailyPnl: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await requireOwnedAccount(ctx, input.accountId);
        return getDailyPnl(account.id, ctx.user.id);
      }),
  }),

  // Market data (read-only proxy to CoinAnk's public kline endpoint).
  market: router({
    getCandles: publicProcedure
      .input(
        z.object({
          tradingPair: z
            .string()
            .transform(s => s.toUpperCase())
            .refine(s => TRADING_PAIR_RE.test(s), {
              message: "Invalid trading pair",
            }),
          timeFrame: z.enum(TIME_FRAMES),
        })
      )
      .query(async ({ input }) => {
        return fetchCandles(input);
      }),
  }),

  // Accounts
  account: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          exchange: z.literal("binance"),
          apiKey: z.string().trim().min(1),
          apiSecret: z.string().trim().min(1),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const trimmedName = input.name.trim();
        if (trimmedName.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Account name cannot be empty",
          });
        }

        const keys = await verifyAndEncryptKey(input.apiKey, input.apiSecret);
        const account = await createAccount({
          userId: ctx.user.id,
          name: trimmedName,
          notes: input.notes || null,
          exchange: input.exchange,
          ...keys,
          keyVerifiedAt: Date.now(),
        });
        return toPublicAccount(account);
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      return (await getAccountsByUserId(ctx.user.id)).map(toPublicAccount);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getAccountById(input.id, ctx.user.id);
        return account && toPublicAccount(account);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;

        await requireOwnedAccount(ctx, id);

        if (data.name !== undefined) {
          const trimmedName = data.name.trim();
          if (trimmedName.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Account name cannot be empty",
            });
          }
          data.name = trimmedName;
        }

        const account = await updateAccount(id, ctx.user.id, {
          ...data,
          notes: data.notes !== undefined ? data.notes || null : undefined,
        });
        return account && toPublicAccount(account);
      }),

    // Fills, trades and sync cursors are left untouched.
    replaceKey: publicProcedure
      .input(
        z.object({
          id: z.number(),
          apiKey: z.string().trim().min(1),
          apiSecret: z.string().trim().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedAccount(ctx, input.id);
        const keys = await verifyAndEncryptKey(input.apiKey, input.apiSecret);
        const account = await updateAccount(input.id, ctx.user.id, {
          ...keys,
          keyVerifiedAt: Date.now(),
          lastSyncErrorCode: null,
          lastSyncRetryAt: null,
        });
        return account && toPublicAccount(account);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedAccount(ctx, input.id);

        const accountCount = await getAccountCount(ctx.user.id);
        if (accountCount < 2) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete the last account",
          });
        }

        await deleteAccountCascade(input.id, ctx.user.id);
        return { success: true };
      }),

    sync: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedAccount(ctx, input.id);
        await runSync(input.id, ctx.user.id, { reason: "manual" });
        return toPublicAccount(await requireOwnedAccount(ctx, input.id));
      }),

    autoSync: publicProcedure.mutation(async ({ ctx }) => {
      return autoSync(ctx.user.id);
    }),
  }),

  // Trading goals: user-level, free text, status derived from completedAt.
  goal: router({
    list: publicProcedure.query(async ({ ctx }) => {
      return listGoalsByUserId(ctx.user.id);
    }),

    create: publicProcedure
      .input(z.object({ text: z.string().max(200) }))
      .mutation(async ({ ctx, input }) => {
        return createGoal({
          userId: ctx.user.id,
          text: normalizeGoalText(input.text),
        });
      }),

    update: publicProcedure
      .input(z.object({ id: z.number(), text: z.string().max(200) }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedGoal(ctx, input.id);
        return updateGoal(input.id, ctx.user.id, {
          text: normalizeGoalText(input.text),
        });
      }),

    setDone: publicProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedGoal(ctx, input.id);
        return updateGoal(input.id, ctx.user.id, {
          completedAt: input.done ? new Date() : null,
        });
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedGoal(ctx, input.id);
        await deleteGoal(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // Trading plans: open/closed derived from closedAt; outcomes set only by close.
  plan: router({
    list: publicProcedure.query(async ({ ctx }) => {
      return listPlans(ctx.user.id);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const plan = await getPlan(ctx.user.id, input.id);
        if (!plan) throw notFound("Plan");
        return plan;
      }),

    symbolSuggestions: publicProcedure.query(async ({ ctx }) => {
      return listTradeSymbols(ctx.user.id);
    }),

    create: publicProcedure
      .input(z.object({ symbol: planSymbol }))
      .mutation(async ({ ctx, input }) => {
        const plan = await createPlan(ctx.user.id, input.symbol);
        return { id: plan.id };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          symbol: planSymbol.optional(),
          marketContext: richTextDocSchema.nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        await requireOpenPlan(ctx, id);
        const plan = await updatePlan(ctx.user.id, id, patch);
        if (!plan) throw notFound("Plan");
        return { updatedAt: plan.updatedAt };
      }),

    addScenario: publicProcedure
      .input(
        z.object({
          planId: z.number(),
          name: scenarioName,
          side: z.enum(SCENARIO_SIDES),
          primaryTimeFrame: z.enum(SCENARIO_TIME_FRAMES),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { planId, ...data } = input;
        await requireOpenPlan(ctx, planId);
        const scenario = await addScenario(ctx.user.id, planId, data);
        if (!scenario) throw notFound("Plan");
        return scenario;
      }),

    updateScenario: publicProcedure
      .input(
        z.object({
          planId: z.number(),
          scenarioId: z.number(),
          name: scenarioName.optional(),
          side: z.enum(SCENARIO_SIDES).optional(),
          primaryTimeFrame: z.enum(SCENARIO_TIME_FRAMES).optional(),
          content: richTextDocSchema.nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { planId, scenarioId, ...patch } = input;
        await requireOpenPlan(ctx, planId);
        const scenario = await updateScenario(
          ctx.user.id,
          planId,
          scenarioId,
          patch
        );
        if (!scenario) throw notFound("Scenario");
        return { updatedAt: scenario.updatedAt };
      }),

    deleteScenario: publicProcedure
      .input(z.object({ planId: z.number(), scenarioId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOpenPlan(ctx, input.planId);
        const deleted = await deleteScenario(
          ctx.user.id,
          input.planId,
          input.scenarioId
        );
        if (!deleted) throw notFound("Scenario");
        return { success: true };
      }),

    addObservation: publicProcedure
      .input(z.object({ planId: z.number(), content: observationContent }))
      .mutation(async ({ ctx, input }) => {
        await requireOpenPlan(ctx, input.planId);
        const observation = await addObservation(
          ctx.user.id,
          input.planId,
          input.content
        );
        if (!observation) throw notFound("Plan");
        return observation;
      }),

    updateObservation: publicProcedure
      .input(
        z.object({
          planId: z.number(),
          observationId: z.number(),
          content: observationContent,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOpenPlan(ctx, input.planId);
        const observation = await updateObservation(
          ctx.user.id,
          input.planId,
          input.observationId,
          input.content
        );
        if (!observation) throw notFound("Observation");
        return { updatedAt: observation.updatedAt };
      }),

    deleteObservation: publicProcedure
      .input(z.object({ planId: z.number(), observationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOpenPlan(ctx, input.planId);
        const deleted = await deleteObservation(
          ctx.user.id,
          input.planId,
          input.observationId
        );
        if (!deleted) throw notFound("Observation");
        return { success: true };
      }),

    close: publicProcedure
      .input(
        z.object({
          id: z.number(),
          verdicts: z.array(
            z.object({
              scenarioId: z.number(),
              outcome: z.enum(SCENARIO_OUTCOMES),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const plan = await getPlan(ctx.user.id, input.id);
        if (!plan) throw notFound("Plan");
        if (plan.closedAt !== null) {
          throw new TRPCError({ code: "CONFLICT", message: "Plan is closed" });
        }
        // Verdict ids must equal the plan's scenario ids exactly.
        const verdictIds = new Set(input.verdicts.map(v => v.scenarioId));
        const exact =
          verdictIds.size === input.verdicts.length &&
          verdictIds.size === plan.scenarios.length &&
          plan.scenarios.every(scenario => verdictIds.has(scenario.id));
        if (!exact) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Every scenario needs exactly one verdict",
          });
        }
        await closePlan(ctx.user.id, input.id, input.verdicts);
        return { success: true };
      }),

    reopen: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await requirePlan(ctx, input.id);
        if (plan.closedAt === null) {
          throw new TRPCError({ code: "CONFLICT", message: "Plan is open" });
        }
        await reopenPlan(ctx.user.id, input.id);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await deletePlan(ctx.user.id, input.id);
        if (!deleted) throw notFound("Plan");
        return { success: true };
      }),
  }),

  // Trade journal setups; one in use by any entry cannot be deleted.
  setup: router({
    list: publicProcedure.query(async ({ ctx }) => {
      return listSetups(ctx.user.id);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const setup = await getSetup(ctx.user.id, input.id);
        if (!setup) throw notFound("Setup");
        return setup;
      }),

    create: publicProcedure
      .input(z.object({ name: setupName }))
      .mutation(async ({ ctx, input }) => {
        await requireFreeSetupName(ctx, input.name);
        const setup = await createSetup(ctx.user.id, input.name);
        return { id: setup.id };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: setupName.optional(),
          description: richTextDocSchema.nullable().optional(),
          triggers: setupTriggers.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        if (!(await getSetupRow(ctx.user.id, id))) throw notFound("Setup");
        if (patch.name !== undefined) {
          await requireFreeSetupName(ctx, patch.name, id);
        }
        const setup = await updateSetup(ctx.user.id, id, patch);
        if (!setup) throw notFound("Setup");
        return { updatedAt: setup.updatedAt };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const setup = await getSetup(ctx.user.id, input.id);
        if (!setup) throw notFound("Setup");
        if (setup.usageCount > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Setup is in use" });
        }
        const deleted = await deleteSetup(ctx.user.id, input.id);
        if (!deleted) throw notFound("Setup");
        return { success: true };
      }),
  }),

  // Trade journal entries: linked trades, recording fields, then the review.
  journal: router({
    list: publicProcedure.query(async ({ ctx }) => {
      return listJournalEntries(ctx.user.id);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return requireEntry(ctx, input.id);
      }),

    pickableTrades: publicProcedure
      .input(z.object({ accountId: z.number(), symbol: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return listPickableTrades(ctx.user.id, input.accountId, input.symbol);
      }),

    forTrade: publicProcedure
      .input(z.object({ tradeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireTrade(ctx, input.tradeId);
        return (
          (await getJournalEntryForTrade(ctx.user.id, input.tradeId)) ?? null
        );
      }),

    create: publicProcedure
      .input(
        z.object({
          tradeIds: z
            .array(z.number())
            .min(1)
            .refine(distinct, "Duplicate trade id"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const picked: Trade[] = [];
        for (const tradeId of input.tradeIds) {
          picked.push(await requireTrade(ctx, tradeId));
        }
        const [first] = picked;
        const mixed = picked.some(
          trade =>
            trade.symbol !== first.symbol || trade.accountId !== first.accountId
        );
        if (mixed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Trades must share one symbol and account",
          });
        }
        const entry = await linkTrades(ctx, input.tradeIds, () =>
          createJournalEntry(ctx.user.id, input.tradeIds)
        );
        if (!entry) throw notFound("Trade");
        return { id: entry.id };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          plannedEntry: plannedPrice,
          plannedStopLoss: plannedPrice,
          plannedTakeProfit: plannedPrice,
          emotion: z.enum(EMOTIONS).nullable().optional(),
          entryReason: richTextField,
          marketContext: richTextField,
          invalidation: richTextField,
          mistakes: richTextField,
          rules: richTextField,
          managementDecisions: richTextField,
          nextTime: richTextField,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        const entry = await requireUnreviewedEntry(ctx, id);
        if (REVIEW_FIELDS.some(field => patch[field] !== undefined)) {
          requireClosedTrades(entry);
        }
        const updatedAt = await updateJournalEntry(ctx.user.id, id, patch);
        if (!updatedAt) throw notFound("Journal entry");
        return { updatedAt };
      }),

    setSetups: publicProcedure
      .input(
        z.object({
          id: z.number(),
          setupIds: z.array(z.number()).refine(distinct, "Duplicate setup id"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireUnreviewedEntry(ctx, input.id);
        for (const setupId of input.setupIds) {
          if (!(await getSetupRow(ctx.user.id, setupId))) {
            throw notFound("Setup");
          }
        }
        const saved = await setJournalEntrySetups(
          ctx.user.id,
          input.id,
          input.setupIds
        );
        if (!saved) throw notFound("Journal entry");
        return { success: true };
      }),

    addTrade: publicProcedure
      .input(z.object({ id: z.number(), tradeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await requireUnreviewedEntry(ctx, input.id);
        const trade = await requireTrade(ctx, input.tradeId);
        if (
          trade.symbol !== entry.symbol ||
          trade.accountId !== entry.accountId
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Trade must match the entry's symbol and account",
          });
        }
        const added = await linkTrades(ctx, [trade.id], () =>
          addJournalEntryTrade(ctx.user.id, entry.id, trade.id)
        );
        if (!added) throw notFound("Journal entry");
        return { success: true };
      }),

    removeTrade: publicProcedure
      .input(z.object({ id: z.number(), tradeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await requireUnreviewedEntry(ctx, input.id);
        if (!entry.trades.some(trade => trade.id === input.tradeId)) {
          throw notFound("Trade");
        }
        if (entry.trades.length === 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An entry keeps at least one trade",
          });
        }
        const removed = await removeJournalEntryTrade(
          ctx.user.id,
          entry.id,
          input.tradeId
        );
        if (!removed) throw notFound("Trade");
        return { success: true };
      }),

    addSlotImage: publicProcedure
      .input(
        z.object({
          id: z.number(),
          slot: z.enum(JOURNAL_SLOTS),
          imageId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const entry = await requireUnreviewedEntry(ctx, input.id);
        const owner = await getImageOwner(ctx.user.id, input.imageId);
        if (
          owner?.ownerKind !== "journal_entry" ||
          owner.ownerId !== entry.id
        ) {
          throw notFound("Image");
        }
        if (input.slot === "after") requireClosedTrades(entry);
        const current =
          input.slot === "before" ? entry.beforeImageIds : entry.afterImageIds;
        if (
          !current.includes(input.imageId) &&
          current.length >= SLOT_IMAGE_MAX
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A slot holds at most ${SLOT_IMAGE_MAX} images`,
          });
        }
        const imageIds = await addSlotImage(
          ctx.user.id,
          entry.id,
          input.slot,
          input.imageId
        );
        if (!imageIds) throw notFound("Journal entry");
        return { imageIds };
      }),

    // The image row is orphaned, not deleted.
    removeSlotImage: publicProcedure
      .input(
        z.object({
          id: z.number(),
          slot: z.enum(JOURNAL_SLOTS),
          imageId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const entry = await requireUnreviewedEntry(ctx, input.id);
        if (input.slot === "after") requireClosedTrades(entry);
        const imageIds = await removeSlotImage(
          ctx.user.id,
          entry.id,
          input.slot,
          input.imageId
        );
        if (!imageIds) throw notFound("Journal entry");
        return { imageIds };
      }),

    markReviewed: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await requireUnreviewedEntry(ctx, input.id);
        requireClosedTrades(entry);
        await setJournalEntryReviewedAt(ctx.user.id, entry.id, new Date());
        return { success: true };
      }),

    reopen: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await requireEntry(ctx, input.id);
        if (entry.reviewedAt === null) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Journal entry is not reviewed",
          });
        }
        await setJournalEntryReviewedAt(ctx.user.id, entry.id, null);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await deleteJournalEntry(ctx.user.id, input.id);
        if (!deleted) throw notFound("Journal entry");
        return { success: true };
      }),
  }),

  // Agent / provider settings. API keys are encrypted at rest; this router
  // never returns plaintext keys to the client — only a hasKey boolean.
  settings: router({
    // Catalogue of every registered provider, joined with per-user config
    // status. Plaintext apiKey is intentionally NEVER part of the payload —
    // only the boolean `hasKey` and the user's optional baseUrl override.
    listProviders: publicProcedure.query(async ({ ctx }) => {
      const providers = listProviders();
      return Promise.all(
        providers.map(async meta => {
          const config = await getProviderConfig(ctx.user.id, meta.id);
          return {
            id: meta.id,
            label: meta.label,
            defaultBaseUrl: meta.defaultBaseUrl,
            defaultModel: meta.defaultModel,
            hasKey: Boolean(config?.apiKey),
            configuredBaseUrl: config?.baseUrl ?? null,
          };
        })
      );
    }),

    getProviderConfig: publicProcedure
      .input(z.object({ providerId: providerIdSchema }))
      .query(async ({ ctx, input }) => {
        const config = await getProviderConfig(ctx.user.id, input.providerId);
        return {
          providerId: input.providerId,
          hasKey: Boolean(config?.apiKey),
          baseUrl: config?.baseUrl ?? null,
        };
      }),

    setProviderConfig: publicProcedure
      .input(
        z.object({
          providerId: providerIdSchema,
          apiKey: z.string().trim().min(1).max(200).optional(),
          baseUrl: z
            .string()
            .trim()
            .max(500)
            .optional()
            .transform(value =>
              value && value.length > 0 ? value : undefined
            ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await setProviderConfig(ctx.user.id, input.providerId, {
          apiKey: input.apiKey,
          baseUrl: input.baseUrl ?? null,
        });
        return { success: true };
      }),

    // External tool keys (web_search backends etc.) live outside the
    // ChatProvider enum on purpose — they're not selectable as the agent
    // brain, just optional capability switches.
    getToolKeyStatus: publicProcedure.query(async ({ ctx }) => {
      const tools: ToolId[] = ["tavily"];
      const entries = await Promise.all(
        tools.map(
          async tool =>
            [tool, { hasKey: await hasToolApiKey(ctx.user.id, tool) }] as const
        )
      );
      return Object.fromEntries(entries) as Record<ToolId, { hasKey: boolean }>;
    }),

    setToolKey: publicProcedure
      .input(
        z.object({
          tool: z.enum(["tavily"]),
          apiKey: z.string().trim().min(1).max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await setToolApiKey(ctx.user.id, input.tool, input.apiKey);
        return { success: true };
      }),

    // Returns the user's stored default provider id. Falls back to "deepseek"
    // (matches `agentSettings.defaultProvider` column default) when no row
    // exists yet, so the client always gets a non-null id to render against.
    getDefaultProvider: publicProcedure.query(async ({ ctx }) => {
      const settings = await getAgentSettings(ctx.user.id);
      return { defaultProvider: settings?.defaultProvider ?? "deepseek" };
    }),

    // Writes the user's default provider. NO hasKey check on purpose — the
    // user may be about to fill in that provider's key. The UI surfaces a
    // friendly hint instead.
    setDefaultProvider: publicProcedure
      .input(z.object({ providerId: providerIdSchema }))
      .mutation(async ({ ctx, input }) => {
        await upsertAgentSettings(ctx.user.id, {
          defaultProvider: input.providerId,
        });
        return { success: true };
      }),

    // Catalogue of every registered skill, projected to client-safe metadata
    // (no Zod parameter schemas, no `run` handles). Drives the Settings page
    // toggle list (TASK-33).
    listSkills: publicProcedure.query(() => {
      return listSkillMetadata();
    }),

    // Returns the user's enabled-skill allowlist. Empty array means
    // "default-all-enabled" — the same semantics runTools applies; the client
    // hydrates this into a fully-checked UI so future-registered skills also
    // auto-enable for users who never touched the setting.
    getEnabledSkillIds: publicProcedure.query(async ({ ctx }) => {
      const settings = await getAgentSettings(ctx.user.id);
      return { enabledSkillIds: settings?.enabledSkillIds ?? [] };
    }),

    // Persists the user's allowlist. The UI is expected to collapse "all
    // skills checked" into [] before calling, so future skills remain enabled
    // by default; that policy is enforced on the client, not here.
    setEnabledSkillIds: publicProcedure
      .input(
        z.object({
          enabledSkillIds: z.array(z.string().min(1).max(50)).max(50),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertAgentSettings(ctx.user.id, {
          enabledSkillIds: input.enabledSkillIds,
        });
        return { success: true };
      }),
  }),

  // AI review agent — per-trade conversation backed by a ChatProvider.
  reviewAgent: router({
    // Lightweight lookup used by the client to decide whether to render the
    // provider picker (no conversation yet) or the locked label (already
    // open). Never creates a conversation row.
    getActive: publicProcedure
      .input(z.object({ tradeId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const trade = await getTradeById(input.tradeId, ctx.user.id);
        if (!trade) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trade not found",
          });
        }
        const active = await getActiveConversation({
          userId: ctx.user.id,
          tradeId: trade.id,
        });
        if (!active) return null;
        return {
          conversationId: active.conversation.id,
          providerId: active.conversation.providerId,
          messages: active.messages,
        };
      }),

    open: publicProcedure
      .input(
        z.object({
          tradeId: z.number().int().positive(),
          providerId: providerIdSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const trade = await getTradeById(input.tradeId, ctx.user.id);
        if (!trade) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trade not found",
          });
        }
        return runAgent(() =>
          openConversation({
            userId: ctx.user.id,
            trade,
            providerId: input.providerId,
          })
        );
      }),

    send: publicProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          userText: z.string().trim().min(1).max(4000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return runAgent(() =>
          sendUserMessage({
            userId: ctx.user.id,
            conversationId: input.conversationId,
            userText: input.userText,
          })
        );
      }),

    list: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) =>
        listReviewMessages({
          userId: ctx.user.id,
          conversationId: input.conversationId,
        })
      ),
  }),

  // AI pre-trade planning agent — discuss a trade idea BEFORE opening it.
  preTradeAgent: router({
    // List past pre-trade sessions for the sidebar/history view (phase 5).
    listSessions: publicProcedure.query(async ({ ctx }) => {
      return listPreTradesByUser(ctx.user.id);
    }),

    // Resume an existing session: returns the pre-trade config + conversation
    // + messages. Null when the session doesn't exist or isn't owned.
    getActive: publicProcedure
      .input(z.object({ preTradeId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const active = await getActivePreTradeConversation({
          userId: ctx.user.id,
          preTradeId: input.preTradeId,
        });
        if (!active) return null;
        return {
          preTrade: active.preTrade,
          conversationId: active.conversation.id,
          providerId: active.conversation.providerId,
          messages: active.messages,
        };
      }),

    // Create a new session AND its conversation atomically. Seeds the first
    // assistant reply so the client renders a live thread immediately.
    create: publicProcedure
      .input(
        z
          .object({
            tradingPair: z.string().regex(TRADING_PAIR_RE),
            direction: z.enum(["long", "short"]).nullable(),
            primaryTimeFrame: z.enum(TIME_FRAMES),
            primaryCandleCount: z.number().int().min(20).max(500),
            contextTimeframes: z
              .array(
                z.object({
                  tf: z.enum(TIME_FRAMES),
                  candleCount: z.number().int().min(20).max(500),
                })
              )
              .max(4),
            anchorMs: z.number().int().positive().nullable(),
            idea: z.string().trim().min(1).max(4000),
            providerId: providerIdSchema.optional(),
          })
          .refine(
            data =>
              !data.contextTimeframes.some(
                entry => entry.tf === data.primaryTimeFrame
              ),
            {
              message: "context timeframes cannot include the primary tf",
              path: ["contextTimeframes"],
            }
          )
          .refine(
            data => {
              const seen = new Set<string>();
              for (const entry of data.contextTimeframes) {
                if (seen.has(entry.tf)) return false;
                seen.add(entry.tf);
              }
              return true;
            },
            {
              message: "context timeframes must be unique",
              path: ["contextTimeframes"],
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        return runAgent(() =>
          createPreTradeSession({
            userId: ctx.user.id,
            tradingPair: input.tradingPair,
            direction: input.direction,
            primaryTimeFrame: input.primaryTimeFrame,
            primaryCandleCount: input.primaryCandleCount,
            contextTimeframes: input.contextTimeframes,
            anchorMs: input.anchorMs,
            idea: input.idea,
            providerId: input.providerId,
          })
        );
      }),

    send: publicProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          userText: z.string().trim().min(1).max(4000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return runAgent(() =>
          sendPreTradeUserMessage({
            userId: ctx.user.id,
            conversationId: input.conversationId,
            userText: input.userText,
          })
        );
      }),

    list: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) =>
        listPreTradeMessages({
          userId: ctx.user.id,
          conversationId: input.conversationId,
        })
      ),
  }),
});

/**
 * Map ProviderError (typed, user-safe) to TRPCError. AUTH and RATE_LIMIT
 * are user-actionable → BAD_REQUEST. NETWORK / UPSTREAM / INVALID_RESPONSE
 * are upstream issues → INTERNAL_SERVER_ERROR. All messages are pre-translated
 * to Chinese inside the provider, so we surface them as-is.
 */
async function runAgent<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderError) {
      const code =
        error.code === "AUTH" || error.code === "RATE_LIMIT"
          ? "BAD_REQUEST"
          : "INTERNAL_SERVER_ERROR";
      throw new TRPCError({ code, message: error.message });
    }
    throw error;
  }
}

export type AppRouter = typeof appRouter;
