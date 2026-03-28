import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
  updateUserInitialBalance,
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
} from "./db";
import { add as addFixedPoint } from "./_core/fixedPoint";

export const appRouter = router({
  system: systemRouter,

  // User settings
  user: router({
    getSettings: publicProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return {
        initialBalance: user?.initialBalance || "0",
        activeTradingSystemId: user?.activeTradingSystemId || null,
      };
    }),

    setInitialBalance: publicProcedure
      .input(z.object({ initialBalance: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await updateUserInitialBalance(ctx.user.id, input.initialBalance);
        return { success: true };
      }),
  }),

  // Trading Elements (opportunity tags)
  tradingElement: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          confidenceLevel: z.number().min(0).max(100).default(50),
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
          confidenceLevel: z.number().min(0).max(100).optional(),
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
        z.object({
          tradingPair: z.string().min(1),
          timeFrame: z.string().min(1),
          startTime: z.number(),
          endTime: z.number(),
          direction: z.enum(["long", "short"]),
          tradingLogic: z.string().min(1),
          outcome: z.enum(["win", "loss", "breakeven"]),
          riskRewardRatio: z.string(),
          returnAmount: z.string(),
          tvUrl: z.string().optional(),
          tradingSystemId: z.number().optional(),
          selectedElementIds: z.array(z.number()).default([]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        const initialBalance = user?.initialBalance || "0";

        // Calculate current balance before this trade
        const currentBalance = await getCurrentBalance(
          ctx.user.id,
          initialBalance
        );

        // Calculate consecutive losses
        let consecutiveLosses = await getConsecutiveLosses(ctx.user.id);
        if (input.outcome === "loss") {
          consecutiveLosses += 1;
        } else if (input.outcome === "win") {
          consecutiveLosses = 0;
        }
        // breakeven keeps the current streak

        // New balance after this trade
        const newBalance = addFixedPoint([currentBalance, input.returnAmount]);

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
            tradingSystemId,
            accountBalance: newBalance,
            tradingPair: input.tradingPair.toUpperCase(),
            timeFrame: input.timeFrame,
            startTime: input.startTime,
            endTime: input.endTime,
            direction: input.direction,
            tradingLogic: input.tradingLogic,
            outcome: input.outcome,
            consecutiveLosses,
            riskRewardRatio: input.riskRewardRatio,
            returnAmount: input.returnAmount,
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
        z
          .object({
            sortBy: z
              .enum(["createdAt", "startTime", "endTime", "returnAmount"])
              .optional(),
            sortOrder: z.enum(["asc", "desc"]).optional(),
            outcome: z.enum(["win", "loss", "breakeven"]).optional(),
            direction: z.enum(["long", "short"]).optional(),
            tradingPair: z.string().optional(),
            isReviewed: z.boolean().optional(),
            tradingSystemId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return getTransactionsByUserId(ctx.user.id, input);
      }),

    // Update transaction (for reviews)
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          reviewFeedback: z.string().optional(),
          reviewChartUrl: z.string().optional(),
          isReviewed: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return updateTransaction(id, ctx.user.id, {
          ...data,
          isReviewed: data.isReviewed ? 1 : 0,
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
    getFormDefaults: publicProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      const initialBalance = user?.initialBalance || "0";
      const currentBalance = await getCurrentBalance(
        ctx.user.id,
        initialBalance
      );
      const consecutiveLosses = await getConsecutiveLosses(ctx.user.id);
      const activeSystem = await getActiveTradingSystem(ctx.user.id);

      return {
        currentBalance,
        consecutiveLosses,
        initialBalance,
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
    getTradingPairs: publicProcedure.query(async ({ ctx }) => {
      return getUniqueTradingPairs(ctx.user.id);
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
    get: publicProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      const initialBalance = user?.initialBalance || "0";
      return getStatistics(ctx.user.id, initialBalance);
    }),

    getBySystem: publicProcedure.query(async ({ ctx }) => {
      return getSystemStatistics(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
