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
} from "./db";
import type { TrpcContext } from "./_core/context";
import type { Account, Goal } from "../drizzle/schema";
import { normalize as normalizeDecimal } from "./_core/decimal";
import { TIME_FRAMES } from "@shared/const";
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

const TRADING_PAIR_RE = /^[A-Z0-9]{4,20}$/;

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
