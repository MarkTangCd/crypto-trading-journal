import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTransactionWithElements,
  getTransactionById,
  getTransactionsByUserId,
  updateTransaction,
  deleteTransactionWithElements,
  getConsecutiveLosses,
  getCurrentBalance,
  getStatistics,
  getSystemStatistics,
  getUniqueTradingPairs,
  getUserById,
  // Trading Elements
  createTradingElement,
  getTradingElementById,
  getTradingElementsByUserId,
  updateTradingElement,
  deleteTradingElement,
  // Trading Systems
  createTradingSystem,
  getTradingSystemById,
  getTradingSystemsByUserId,
  updateTradingSystem,
  deleteTradingSystem,
  activateTradingSystem,
  deactivateTradingSystem,
  getActiveTradingSystem,
  // Transaction Elements
  getTransactionElements,
  calculateConfidenceLevel,
  replaceTransactionElements,
  // Accounts
  createAccount,
  getAccountById,
  getAccountsByUserId,
  updateAccount,
  deleteAccountWithTransactions,
  getAccountCount,
} from "./db";
import { add as addFixedPoint } from "./_core/fixedPoint";
import {
  ALLOWED_TRANSITIONS,
  MARKET_CYCLES,
  TRANSACTION_TYPES,
} from "@shared/const";

export const appRouter = router({
  system: systemRouter,

  // User settings
  user: router({
    getSettings: publicProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return {
        activeTradingSystemId: user?.activeTradingSystemId || null,
      };
    }),
  }),

  // Trading Elements (opportunity tags)
  tradingElement: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          confidenceLevel: z.number().int().min(1).max(5).default(3),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return createTradingElement({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          confidenceLevel: input.confidenceLevel,
        });
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getTradingElementById(input.id, ctx.user.id);
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      return getTradingElementsByUserId(ctx.user.id);
    }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          confidenceLevel: z.number().int().min(1).max(5).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return updateTradingElement(id, ctx.user.id, data);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTradingElement(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // Trading Systems
  tradingSystem: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          notes: z.string().optional(),
          elementIds: z.array(z.number()).default([]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return createTradingSystem(
          {
            userId: ctx.user.id,
            name: input.name,
            notes: input.notes || null,
          },
          input.elementIds
        );
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getTradingSystemById(input.id, ctx.user.id);
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      return getTradingSystemsByUserId(ctx.user.id);
    }),

    getActive: publicProcedure.query(async ({ ctx }) => {
      return getActiveTradingSystem(ctx.user.id);
    }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          notes: z.string().optional(),
          elementIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, elementIds, ...data } = input;
        return updateTradingSystem(id, ctx.user.id, data, elementIds);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTradingSystem(input.id, ctx.user.id);
        return { success: true };
      }),

    activate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return activateTradingSystem(input.id, ctx.user.id);
      }),

    deactivate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deactivateTradingSystem(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // Transaction operations
  transaction: router({
    // Create a new transaction
    create: publicProcedure
      .input(
        z
          .object({
            accountId: z.number().int().positive(),
            tradingPair: z.string().min(1),
            timeFrame: z.string().min(1),
            startTime: z.number(),
            direction: z.enum(["long", "short"]),
            tradingLogic: z.string().min(1),
            marketCycle: z.enum(MARKET_CYCLES),
            transactionType: z.enum(TRANSACTION_TYPES),
            tvUrl: z.string().optional(),
            tradingSystemId: z.number().optional(),
            selectedElementIds: z.array(z.number()).default([]),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        // Validate account ownership before doing any other work
        const account = await getAccountById(input.accountId, ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }

        // Get active trading system if not specified
        let tradingSystemId: number | undefined = input.tradingSystemId;
        if (tradingSystemId === undefined) {
          const activeSystem = await getActiveTradingSystem(ctx.user.id);
          tradingSystemId = activeSystem?.id ?? undefined;
        }

        // Calculate confidence level from selected elements
        const confidenceLevel = await calculateConfidenceLevel(
          input.selectedElementIds
        );

        const transaction = await createTransactionWithElements(
          {
            userId: ctx.user.id,
            accountId: account.id,
            tradingSystemId,
            status: "open",
            tradingPair: input.tradingPair.toUpperCase(),
            timeFrame: input.timeFrame,
            startTime: input.startTime,
            endTime: null,
            direction: input.direction,
            tradingLogic: input.tradingLogic,
            marketCycle: input.marketCycle,
            transactionType: input.transactionType,
            outcome: null,
            riskRewardRatio: null,
            returnAmount: null,
            confidenceLevel,
            tvUrl: input.tvUrl || null,
          },
          input.selectedElementIds
        );

        return transaction;
      }),

    // Get a single transaction with elements
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const transaction = await getTransactionById(input.id, ctx.user.id);
        if (!transaction) return null;

        const elements = await getTransactionElements(transaction.id);
        return { ...transaction, elements };
      }),

    // List transactions with filters
    list: publicProcedure
      .input(
        z.object({
          accountId: z.number(),
          sortBy: z
            .enum(["createdAt", "startTime", "endTime", "returnAmount"])
            .optional(),
          sortOrder: z.enum(["asc", "desc"]).optional(),
          outcome: z.enum(["win", "loss", "breakeven"]).optional(),
          direction: z.enum(["long", "short"]).optional(),
          tradingPair: z.string().optional(),
          status: z.enum(["open", "closed", "reviewed"]).optional(),
          tradingSystemId: z.number().optional(),
          marketCycle: z.enum(MARKET_CYCLES).optional(),
          transactionType: z.enum(TRANSACTION_TYPES).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { accountId, ...options } = input;
        // Verify account ownership
        const account = await getAccountById(accountId, ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }
        return getTransactionsByUserId(ctx.user.id, { ...options, accountId });
      }),

    close: publicProcedure
      .input(
        z.object({
          id: z.number(),
          endTime: z.number(),
          outcome: z.enum(["win", "loss", "breakeven"]),
          riskRewardRatio: z.string(),
          returnAmount: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const transaction = await getTransactionById(input.id, ctx.user.id);
        if (!transaction) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (!(transaction.status in ALLOWED_TRANSITIONS)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid transaction status: ${transaction.status}`,
          });
        }

        const currentStatus =
          transaction.status as keyof typeof ALLOWED_TRANSITIONS;
        const allowedTransition = ALLOWED_TRANSITIONS[currentStatus];
        if (allowedTransition !== "closed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transition transaction from ${currentStatus} to closed`,
          });
        }

        if (input.endTime <= transaction.startTime) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "endTime must be greater than startTime",
          });
        }

        const user = await getUserById(ctx.user.id);
        const initialBalance = user?.initialBalance || "0";
        const currentBalance = await getCurrentBalance(
          ctx.user.id,
          initialBalance
        );

        let consecutiveLosses = await getConsecutiveLosses(ctx.user.id);
        if (input.outcome === "loss") {
          consecutiveLosses += 1;
        } else if (input.outcome === "win") {
          consecutiveLosses = 0;
        }

        const accountBalance = addFixedPoint([
          currentBalance,
          input.returnAmount,
        ]);

        return updateTransaction(input.id, ctx.user.id, {
          status: "closed",
          endTime: input.endTime,
          outcome: input.outcome,
          riskRewardRatio: input.riskRewardRatio,
          returnAmount: input.returnAmount,
          accountBalance,
          consecutiveLosses,
        });
      }),

    // Update transaction (for reviews)
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          tradingPair: z.string().min(1).optional(),
          timeFrame: z.string().min(1).optional(),
          startTime: z.number().optional(),
          endTime: z.number().optional(),
          direction: z.enum(["long", "short"]).optional(),
          tradingLogic: z.string().min(1).optional(),
          outcome: z.enum(["win", "loss", "breakeven"]).optional(),
          riskRewardRatio: z.string().optional(),
          returnAmount: z.string().optional(),
          tvUrl: z.string().optional(),
          tradingSystemId: z.number().optional(),
          selectedElementIds: z.array(z.number()).optional(),
          reviewFeedback: z.string().optional(),
          reviewChartUrl: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, selectedElementIds, ...data } = input;

        const existingTransaction = await getTransactionById(id, ctx.user.id);
        if (!existingTransaction) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        const hasEntryFieldUpdates =
          data.tradingPair !== undefined ||
          data.timeFrame !== undefined ||
          data.startTime !== undefined ||
          data.endTime !== undefined ||
          data.direction !== undefined ||
          data.tradingLogic !== undefined ||
          data.outcome !== undefined ||
          data.riskRewardRatio !== undefined ||
          data.returnAmount !== undefined ||
          data.tvUrl !== undefined ||
          data.tradingSystemId !== undefined ||
          selectedElementIds !== undefined;

        const hasReviewFieldUpdates =
          data.reviewFeedback !== undefined ||
          data.reviewChartUrl !== undefined;

        if (existingTransaction.status === "open") {
          if (hasReviewFieldUpdates) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Review fields can only be edited after trade is closed",
            });
          }

          if (
            data.endTime !== undefined ||
            data.outcome !== undefined ||
            data.riskRewardRatio !== undefined ||
            data.returnAmount !== undefined
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Close-stage fields cannot be edited on open trades",
            });
          }

          const confidenceLevel =
            selectedElementIds !== undefined
              ? await calculateConfidenceLevel(selectedElementIds)
              : existingTransaction.confidenceLevel;

          const updatedTransaction = await updateTransaction(id, ctx.user.id, {
            tradingPair:
              data.tradingPair !== undefined
                ? data.tradingPair.toUpperCase()
                : undefined,
            timeFrame: data.timeFrame,
            startTime: data.startTime,
            direction: data.direction,
            tradingLogic: data.tradingLogic,
            tvUrl: data.tvUrl,
            tradingSystemId: data.tradingSystemId,
            confidenceLevel,
          });

          if (selectedElementIds !== undefined) {
            await replaceTransactionElements(id, selectedElementIds);
          }

          return updatedTransaction;
        }

        if (hasEntryFieldUpdates) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This transaction status only allows review field updates",
          });
        }

        if (existingTransaction.status === "closed") {
          return updateTransaction(id, ctx.user.id, {
            reviewFeedback: data.reviewFeedback,
            reviewChartUrl: data.reviewChartUrl,
            status:
              data.reviewFeedback !== undefined
                ? "reviewed"
                : existingTransaction.status,
          });
        }

        return updateTransaction(id, ctx.user.id, {
          reviewFeedback: data.reviewFeedback,
          reviewChartUrl: data.reviewChartUrl,
        });
      }),

    // Delete transaction
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTransactionWithElements(input.id, ctx.user.id);
        return { success: true };
      }),

    // Get current state for new transaction form
    getFormDefaults: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getAccountById(input.accountId, ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }
        const currentBalance = await getCurrentBalance(
          account.id,
          account.initialBalance
        );
        const consecutiveLosses = await getConsecutiveLosses(account.id);
        const activeSystem = await getActiveTradingSystem(ctx.user.id);

        return {
          currentBalance,
          consecutiveLosses,
          initialBalance: account.initialBalance,
          activeSystem: activeSystem
            ? {
                id: activeSystem.id,
                name: activeSystem.name,
                elements: activeSystem.elements || [],
              }
            : null,
        };
      }),

    // Get unique trading pairs for filter dropdown
    getTradingPairs: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getAccountById(input.accountId, ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }
        return getUniqueTradingPairs(ctx.user.id, input.accountId);
      }),

    // Get elements for a transaction
    getElements: publicProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(async ({ input }) => {
        return getTransactionElements(input.transactionId);
      }),
  }),

  // Statistics
  stats: router({
    get: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await getAccountById(input.accountId, ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }
        return getStatistics(account.id, account.initialBalance);
      }),

    getBySystem: publicProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        return getSystemStatistics(input.accountId, ctx.user.id);
      }),
  }),

  // Accounts
  account: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          notes: z.string().optional(),
          initialBalance: z.string().optional(),
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

        return createAccount({
          userId: ctx.user.id,
          name: trimmedName,
          notes: input.notes || null,
          initialBalance: input.initialBalance || "0",
        });
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      return getAccountsByUserId(ctx.user.id);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getAccountById(input.id, ctx.user.id);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          notes: z.string().optional(),
          initialBalance: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;

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

        return updateAccount(id, ctx.user.id, {
          ...data,
          notes: data.notes !== undefined ? data.notes || null : undefined,
        });
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const accountCount = await getAccountCount(ctx.user.id);
        if (accountCount < 2) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete the last account",
          });
        }

        await deleteAccountWithTransactions(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
