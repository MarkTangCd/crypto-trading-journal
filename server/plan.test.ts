import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { RichTextDoc } from "@shared/richText";
import * as db from "./db";

const openPlan = {
  id: 1,
  userId: 1,
  symbol: "BTCUSDT",
  marketContext: null,
  closedAt: null,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
};

const closedPlan = { ...openPlan, closedAt: new Date(5000) };

const scenario = (id: number) => ({
  id,
  planId: 1,
  name: `Scenario ${id}`,
  side: "long" as const,
  primaryTimeFrame: "4H",
  content: null,
  outcome: null,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
});

const observation = {
  id: 7,
  planId: 1,
  content: { type: "doc" as const, content: [] },
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
};

const savedAt = new Date(9000);

const textDoc: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "note" }] }],
};
const blankDoc: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }],
};

vi.mock("./db", () => ({
  getPlanRow: vi.fn(),
  listPlans: vi.fn().mockResolvedValue([]),
  getPlan: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  addScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  addObservation: vi.fn(),
  updateObservation: vi.fn(),
  deleteObservation: vi.fn(),
  closePlan: vi.fn(),
  reopenPlan: vi.fn(),
  deletePlan: vi.fn(),
  listTradeSymbols: vi.fn().mockResolvedValue(["BTCUSDT"]),
}));

describe("Plan Router", () => {
  const mockCtx: TrpcContext = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };

  const caller = appRouter.createCaller(mockCtx);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getPlanRow).mockResolvedValue(openPlan);
    vi.mocked(db.getPlan).mockResolvedValue({
      ...openPlan,
      scenarios: [scenario(10), scenario(11)],
      observations: [],
    });
    vi.mocked(db.createPlan).mockImplementation(async (userId, symbol) => ({
      ...openPlan,
      id: 42,
      userId,
      symbol,
    }));
    vi.mocked(db.updatePlan).mockResolvedValue({
      ...openPlan,
      updatedAt: savedAt,
    });
    vi.mocked(db.addScenario).mockResolvedValue(scenario(12));
    vi.mocked(db.updateScenario).mockResolvedValue({
      ...scenario(10),
      updatedAt: savedAt,
    });
    vi.mocked(db.deleteScenario).mockResolvedValue(true);
    vi.mocked(db.addObservation).mockResolvedValue(observation);
    vi.mocked(db.updateObservation).mockResolvedValue({
      ...observation,
      updatedAt: savedAt,
    });
    vi.mocked(db.deleteObservation).mockResolvedValue(true);
    vi.mocked(db.closePlan).mockResolvedValue(closedPlan);
    vi.mocked(db.reopenPlan).mockResolvedValue(openPlan);
    vi.mocked(db.deletePlan).mockResolvedValue(true);
  });

  describe("reads", () => {
    it("list and symbolSuggestions are scoped to the user", async () => {
      await caller.plan.list();
      expect(await caller.plan.symbolSuggestions()).toEqual(["BTCUSDT"]);
      expect(db.listPlans).toHaveBeenCalledWith(1);
      expect(db.listTradeSymbols).toHaveBeenCalledWith(1);
    });

    it("get returns the plan or NOT_FOUND", async () => {
      await expect(caller.plan.get({ id: 1 })).resolves.toMatchObject({
        id: 1,
      });
      vi.mocked(db.getPlan).mockResolvedValue(undefined);
      await expect(caller.plan.get({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(db.getPlan).toHaveBeenLastCalledWith(1, 99);
    });
  });

  describe("symbol", () => {
    it("create trims and uppercases the symbol and returns { id }", async () => {
      const result = await caller.plan.create({ symbol: "  ethusdt " });
      expect(result).toEqual({ id: 42 });
      expect(db.createPlan).toHaveBeenCalledWith(1, "ETHUSDT");
    });

    it.each(["", "btc", "BTC-USDT", "A".repeat(21)])(
      "rejects invalid symbol %j with BAD_REQUEST",
      async symbol => {
        await expect(caller.plan.create({ symbol })).rejects.toMatchObject({
          code: "BAD_REQUEST",
        });
        await expect(
          caller.plan.update({ id: 1, symbol })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(db.createPlan).not.toHaveBeenCalled();
        expect(db.updatePlan).not.toHaveBeenCalled();
      }
    );
  });

  describe("update", () => {
    it("normalises the symbol, accepts null marketContext, returns updatedAt", async () => {
      const result = await caller.plan.update({
        id: 1,
        symbol: "solusdt",
        marketContext: null,
      });
      expect(result).toEqual({ updatedAt: savedAt });
      expect(db.updatePlan).toHaveBeenCalledWith(1, 1, {
        symbol: "SOLUSDT",
        marketContext: null,
      });
    });

    it("rejects a marketContext that is not a doc", async () => {
      await expect(
        caller.plan.update({
          id: 1,
          marketContext: { type: "paragraph" } as unknown as RichTextDoc,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("scenarios", () => {
    it("addScenario trims the name and validates side and timeframe", async () => {
      await caller.plan.addScenario({
        planId: 1,
        name: "  breakout  ",
        side: "short",
        primaryTimeFrame: "12H",
      });
      expect(db.addScenario).toHaveBeenCalledWith(1, 1, {
        name: "breakout",
        side: "short",
        primaryTimeFrame: "12H",
      });
    });

    it.each([
      { name: "   ", side: "long", primaryTimeFrame: "4H" },
      { name: "x".repeat(81), side: "long", primaryTimeFrame: "4H" },
      { name: "ok", side: "flat", primaryTimeFrame: "4H" },
      { name: "ok", side: "long", primaryTimeFrame: "1h" },
    ])("addScenario rejects %j with BAD_REQUEST", async input => {
      await expect(
        caller.plan.addScenario({
          planId: 1,
          ...input,
        } as Parameters<typeof caller.plan.addScenario>[0])
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.addScenario).not.toHaveBeenCalled();
    });

    it("accepts a name of exactly SCENARIO_NAME_MAX", async () => {
      await caller.plan.addScenario({
        planId: 1,
        name: "x".repeat(80),
        side: "long",
        primaryTimeFrame: "15m",
      });
      expect(db.addScenario).toHaveBeenCalled();
    });

    it("updateScenario passes the patch, accepts null content, returns updatedAt", async () => {
      const result = await caller.plan.updateScenario({
        planId: 1,
        scenarioId: 10,
        name: " renamed ",
        content: null,
      });
      expect(result).toEqual({ updatedAt: savedAt });
      expect(db.updateScenario).toHaveBeenCalledWith(1, 1, 10, {
        name: "renamed",
        content: null,
      });
    });

    it("unknown scenario → NOT_FOUND", async () => {
      vi.mocked(db.updateScenario).mockResolvedValue(undefined);
      vi.mocked(db.deleteScenario).mockResolvedValue(false);
      await expect(
        caller.plan.updateScenario({ planId: 1, scenarioId: 99, name: "a" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        caller.plan.deleteScenario({ planId: 1, scenarioId: 99 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("observations", () => {
    it("addObservation stores non-empty content", async () => {
      await caller.plan.addObservation({ planId: 1, content: textDoc });
      expect(db.addObservation).toHaveBeenCalledWith(1, 1, textDoc);
    });

    it("updateObservation returns updatedAt", async () => {
      await expect(
        caller.plan.updateObservation({
          planId: 1,
          observationId: 7,
          content: textDoc,
        })
      ).resolves.toEqual({ updatedAt: savedAt });
    });

    it.each([
      { type: "doc" as const },
      { type: "doc" as const, content: [] },
      blankDoc,
    ])("rejects empty doc %j with BAD_REQUEST", async content => {
      await expect(
        caller.plan.addObservation({ planId: 1, content })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.plan.updateObservation({ planId: 1, observationId: 7, content })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.addObservation).not.toHaveBeenCalled();
      expect(db.updateObservation).not.toHaveBeenCalled();
    });

    it("unknown observation → NOT_FOUND", async () => {
      vi.mocked(db.updateObservation).mockResolvedValue(undefined);
      vi.mocked(db.deleteObservation).mockResolvedValue(false);
      await expect(
        caller.plan.updateObservation({
          planId: 1,
          observationId: 99,
          content: textDoc,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        caller.plan.deleteObservation({ planId: 1, observationId: 99 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // Every write keyed by a plan id, for the NOT_FOUND / CONFLICT guards.
  const planWrites = {
    update: () => caller.plan.update({ id: 1, symbol: "BTCUSDT" }),
    addScenario: () =>
      caller.plan.addScenario({
        planId: 1,
        name: "a",
        side: "long",
        primaryTimeFrame: "1D",
      }),
    updateScenario: () =>
      caller.plan.updateScenario({ planId: 1, scenarioId: 10, side: "short" }),
    deleteScenario: () =>
      caller.plan.deleteScenario({ planId: 1, scenarioId: 10 }),
    addObservation: () =>
      caller.plan.addObservation({ planId: 1, content: textDoc }),
    updateObservation: () =>
      caller.plan.updateObservation({
        planId: 1,
        observationId: 7,
        content: textDoc,
      }),
    deleteObservation: () =>
      caller.plan.deleteObservation({ planId: 1, observationId: 7 }),
    close: () => caller.plan.close({ id: 1, verdicts: [] }),
  };

  describe("guards", () => {
    it.each(Object.entries(planWrites))(
      "%s on an unknown or foreign plan → NOT_FOUND",
      async (_name, write) => {
        vi.mocked(db.getPlanRow).mockResolvedValue(undefined);
        vi.mocked(db.getPlan).mockResolvedValue(undefined);
        await expect(write()).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    );

    it.each(Object.entries(planWrites))(
      "%s on a closed plan → CONFLICT",
      async (_name, write) => {
        vi.mocked(db.getPlanRow).mockResolvedValue(closedPlan);
        vi.mocked(db.getPlan).mockResolvedValue({
          ...closedPlan,
          scenarios: [],
          observations: [],
        });
        await expect(write()).rejects.toMatchObject({ code: "CONFLICT" });
        expect(db.updatePlan).not.toHaveBeenCalled();
        expect(db.addScenario).not.toHaveBeenCalled();
        expect(db.updateScenario).not.toHaveBeenCalled();
        expect(db.deleteScenario).not.toHaveBeenCalled();
        expect(db.addObservation).not.toHaveBeenCalled();
        expect(db.updateObservation).not.toHaveBeenCalled();
        expect(db.deleteObservation).not.toHaveBeenCalled();
        expect(db.closePlan).not.toHaveBeenCalled();
      }
    );
  });

  describe("close", () => {
    it("closes with a verdict for every scenario", async () => {
      const verdicts = [
        { scenarioId: 11, outcome: "invalidated" as const },
        { scenarioId: 10, outcome: "triggered" as const },
      ];
      await caller.plan.close({ id: 1, verdicts });
      expect(db.closePlan).toHaveBeenCalledWith(1, 1, verdicts);
    });

    it("closes a zero-scenario plan with verdicts []", async () => {
      vi.mocked(db.getPlan).mockResolvedValue({
        ...openPlan,
        scenarios: [],
        observations: [],
      });
      await caller.plan.close({ id: 1, verdicts: [] });
      expect(db.closePlan).toHaveBeenCalledWith(1, 1, []);
    });

    it.each([
      ["missing", [{ scenarioId: 10, outcome: "triggered" as const }]],
      [
        "extra",
        [
          { scenarioId: 10, outcome: "triggered" as const },
          { scenarioId: 11, outcome: "triggered" as const },
          { scenarioId: 12, outcome: "triggered" as const },
        ],
      ],
      [
        "duplicate",
        [
          { scenarioId: 10, outcome: "triggered" as const },
          { scenarioId: 10, outcome: "invalidated" as const },
        ],
      ],
      [
        "foreign",
        [
          { scenarioId: 10, outcome: "triggered" as const },
          { scenarioId: 99, outcome: "triggered" as const },
        ],
      ],
    ])("%s verdict → BAD_REQUEST", async (_label, verdicts) => {
      await expect(
        caller.plan.close({ id: 1, verdicts })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.closePlan).not.toHaveBeenCalled();
    });

    it("verdicts on a zero-scenario plan → BAD_REQUEST", async () => {
      vi.mocked(db.getPlan).mockResolvedValue({
        ...openPlan,
        scenarios: [],
        observations: [],
      });
      await expect(
        caller.plan.close({
          id: 1,
          verdicts: [{ scenarioId: 10, outcome: "triggered" }],
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects an unknown outcome", async () => {
      await expect(
        caller.plan.close({
          id: 1,
          verdicts: [
            { scenarioId: 10, outcome: "triggered" },
            { scenarioId: 11, outcome: "untriggered" },
          ],
        } as Parameters<typeof caller.plan.close>[0])
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("reopen and delete", () => {
    it("reopens a closed plan", async () => {
      vi.mocked(db.getPlanRow).mockResolvedValue(closedPlan);
      await expect(caller.plan.reopen({ id: 1 })).resolves.toEqual({
        success: true,
      });
      expect(db.reopenPlan).toHaveBeenCalledWith(1, 1);
    });

    it("reopen on an open plan → CONFLICT", async () => {
      await expect(caller.plan.reopen({ id: 1 })).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(db.reopenPlan).not.toHaveBeenCalled();
    });

    it("reopen on an unknown plan → NOT_FOUND", async () => {
      vi.mocked(db.getPlanRow).mockResolvedValue(undefined);
      await expect(caller.plan.reopen({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it.each([openPlan, closedPlan])(
      "deletes an open or closed plan",
      async plan => {
        vi.mocked(db.getPlanRow).mockResolvedValue(plan);
        await expect(caller.plan.delete({ id: 1 })).resolves.toEqual({
          success: true,
        });
        expect(db.deletePlan).toHaveBeenCalledWith(1, 1);
      }
    );

    it("delete on an unknown plan → NOT_FOUND", async () => {
      vi.mocked(db.deletePlan).mockResolvedValue(false);
      await expect(caller.plan.delete({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
