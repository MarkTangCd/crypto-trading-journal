import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { RichTextDoc } from "@shared/richText";
import { SLOT_IMAGE_MAX, type Emotion } from "@shared/const";
import type { Trade } from "../drizzle/schema";
import * as db from "./db";

const trade = (id: number, overrides: Partial<Trade> = {}): Trade =>
  ({
    id,
    userId: 1,
    accountId: 1,
    symbol: "BTCUSDT",
    side: "long",
    status: "closed",
    openTime: 1000 + id,
    quantity: "1",
    realizedPnlUsd: "10",
    ...overrides,
  }) as Trade;

const entry = (
  overrides: Partial<db.JournalEntryDetail> = {}
): db.JournalEntryDetail => ({
  id: 1,
  userId: 1,
  accountId: 1,
  symbol: "BTCUSDT",
  plannedEntry: null,
  plannedStopLoss: null,
  plannedTakeProfit: null,
  emotion: null,
  entryReason: null,
  marketContext: null,
  invalidation: null,
  mistakes: null,
  rules: null,
  managementDecisions: null,
  nextTime: null,
  beforeImageIds: [],
  afterImageIds: [],
  reviewedAt: null,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
  date: 1001,
  sides: ["long"],
  tradeCount: 2,
  openTradeCount: 0,
  netPnlUsd: 20,
  trades: [trade(1), trade(2)],
  setups: [],
  actualR: null,
  ...overrides,
});

const reviewed = entry({ reviewedAt: new Date(5000) });
const waiting = entry({ openTradeCount: 1 });
const savedAt = new Date(9000);

const textDoc: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "note" }] }],
};

const summary: db.JournalEntrySummary = {
  id: 7,
  date: 1001,
  setupNames: [],
  tradeCount: 1,
  state: "unreviewed",
};

vi.mock("./db", () => ({
  listJournalEntries: vi.fn().mockResolvedValue([]),
  getJournalEntry: vi.fn(),
  listPickableTrades: vi.fn().mockResolvedValue([]),
  getJournalEntryForTrade: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  setJournalEntrySetups: vi.fn(),
  addJournalEntryTrade: vi.fn(),
  removeJournalEntryTrade: vi.fn(),
  addSlotImage: vi.fn(),
  removeSlotImage: vi.fn(),
  setJournalEntryReviewedAt: vi.fn(),
  deleteJournalEntry: vi.fn(),
  getImageOwner: vi.fn(),
  getTradeById: vi.fn(),
  getSetupRow: vi.fn(),
}));

const uniqueViolation = new Error(
  "UNIQUE constraint failed: journal_entry_trades.tradeId"
);

describe("Journal Router", () => {
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
    vi.mocked(db.getJournalEntry).mockResolvedValue(entry());
    vi.mocked(db.getJournalEntryForTrade).mockResolvedValue(undefined);
    vi.mocked(db.getTradeById).mockImplementation(async id => trade(id));
    vi.mocked(db.createJournalEntry).mockResolvedValue({ id: 7 });
    vi.mocked(db.updateJournalEntry).mockResolvedValue(savedAt);
    vi.mocked(db.setJournalEntrySetups).mockResolvedValue(true);
    vi.mocked(db.addJournalEntryTrade).mockResolvedValue(true);
    vi.mocked(db.removeJournalEntryTrade).mockResolvedValue(true);
    vi.mocked(db.addSlotImage).mockResolvedValue([5]);
    vi.mocked(db.removeSlotImage).mockResolvedValue([]);
    vi.mocked(db.setJournalEntryReviewedAt).mockResolvedValue(entry());
    vi.mocked(db.deleteJournalEntry).mockResolvedValue(true);
    vi.mocked(db.getImageOwner).mockResolvedValue({
      ownerKind: "journal_entry",
      ownerId: 1,
    });
    vi.mocked(db.getSetupRow).mockImplementation(async (_userId, id) => ({
      id,
      userId: 1,
      name: `Setup ${id}`,
      description: null,
      triggers: [],
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    }));
  });

  describe("reads", () => {
    it("list and pickableTrades are scoped to the user", async () => {
      await caller.journal.list();
      await caller.journal.pickableTrades({ accountId: 3 });
      await caller.journal.pickableTrades({ accountId: 3, symbol: "ETHUSDT" });
      expect(db.listJournalEntries).toHaveBeenCalledWith(1);
      expect(db.listPickableTrades).toHaveBeenNthCalledWith(1, 1, 3, undefined);
      expect(db.listPickableTrades).toHaveBeenNthCalledWith(2, 1, 3, "ETHUSDT");
    });

    it("get returns the entry or NOT_FOUND", async () => {
      await expect(caller.journal.get({ id: 1 })).resolves.toMatchObject({
        id: 1,
      });
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(caller.journal.get({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(db.getJournalEntry).toHaveBeenLastCalledWith(1, 99);
    });

    it("forTrade returns the summary, null, or NOT_FOUND for an unknown trade", async () => {
      vi.mocked(db.getJournalEntryForTrade).mockResolvedValueOnce(summary);
      await expect(caller.journal.forTrade({ tradeId: 1 })).resolves.toEqual(
        summary
      );
      await expect(caller.journal.forTrade({ tradeId: 1 })).resolves.toBeNull();
      vi.mocked(db.getTradeById).mockResolvedValue(undefined);
      await expect(
        caller.journal.forTrade({ tradeId: 99 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("create", () => {
    it("creates an entry from the user's trades and returns its id", async () => {
      await expect(
        caller.journal.create({ tradeIds: [1, 2] })
      ).resolves.toEqual({ id: 7 });
      expect(db.createJournalEntry).toHaveBeenCalledWith(1, [1, 2]);
    });

    it("accepts mixed sides on one symbol and account", async () => {
      vi.mocked(db.getTradeById).mockImplementation(async id =>
        trade(id, { side: id === 2 ? "short" : "long" })
      );
      await expect(
        caller.journal.create({ tradeIds: [1, 2] })
      ).resolves.toEqual({ id: 7 });
    });

    it.each([
      ["no trades", []],
      ["duplicate trades", [1, 1]],
    ])("rejects %s with BAD_REQUEST", async (_label, tradeIds) => {
      await expect(caller.journal.create({ tradeIds })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(db.createJournalEntry).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND when a trade is unknown or foreign", async () => {
      vi.mocked(db.getTradeById).mockImplementation(async id =>
        id === 2 ? undefined : trade(id)
      );
      await expect(
        caller.journal.create({ tradeIds: [1, 2] })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.getTradeById).toHaveBeenCalledWith(2, 1);
      expect(db.createJournalEntry).not.toHaveBeenCalled();
    });

    it.each([
      ["symbols", { symbol: "ETHUSDT" }],
      ["accounts", { accountId: 2 }],
    ])("rejects mixed %s with BAD_REQUEST", async (_label, overrides) => {
      vi.mocked(db.getTradeById).mockImplementation(async id =>
        trade(id, id === 2 ? overrides : {})
      );
      await expect(
        caller.journal.create({ tradeIds: [1, 2] })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.createJournalEntry).not.toHaveBeenCalled();
    });

    it("answers CONFLICT when a trade is already linked (or a race won)", async () => {
      vi.mocked(db.createJournalEntry).mockRejectedValue(uniqueViolation);
      vi.mocked(db.getJournalEntryForTrade).mockImplementation(
        async (_userId, tradeId) => (tradeId === 2 ? summary : undefined)
      );
      await expect(
        caller.journal.create({ tradeIds: [1, 2] })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rethrows an insert failure when no trade is linked", async () => {
      vi.mocked(db.createJournalEntry).mockRejectedValue(new Error("disk"));
      await expect(
        caller.journal.create({ tradeIds: [1] })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  describe("update", () => {
    it("trims planned prices, clears blanks and returns updatedAt", async () => {
      await expect(
        caller.journal.update({
          id: 1,
          plannedEntry: " 100.5 ",
          plannedStopLoss: "   ",
          plannedTakeProfit: null,
          emotion: "fomo",
          entryReason: textDoc,
        })
      ).resolves.toEqual({ updatedAt: savedAt });
      expect(db.updateJournalEntry).toHaveBeenCalledWith(1, 1, {
        plannedEntry: "100.5",
        plannedStopLoss: null,
        plannedTakeProfit: null,
        emotion: "fomo",
        entryReason: textDoc,
      });
    });

    it("keeps the price text as typed", async () => {
      await caller.journal.update({ id: 1, plannedEntry: "0.0500" });
      expect(db.updateJournalEntry).toHaveBeenCalledWith(1, 1, {
        plannedEntry: "0.0500",
      });
    });

    it.each(["0", "0.000", "-1", "1e5", "abc", "1.", ".5", "1,000"])(
      "rejects planned price %j with BAD_REQUEST",
      async plannedStopLoss => {
        await expect(
          caller.journal.update({ id: 1, plannedStopLoss })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(db.updateJournalEntry).not.toHaveBeenCalled();
      }
    );

    it("rejects an unknown emotion with BAD_REQUEST", async () => {
      await expect(
        caller.journal.update({ id: 1, emotion: "joy" as unknown as Emotion })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("answers NOT_FOUND for an unknown entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(
        caller.journal.update({ id: 99, emotion: null })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("answers CONFLICT for a reviewed entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(
        caller.journal.update({ id: 1, plannedEntry: "100" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.updateJournalEntry).not.toHaveBeenCalled();
    });

    it("saves recording fields while trades are open", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(waiting);
      await caller.journal.update({ id: 1, marketContext: textDoc });
      expect(db.updateJournalEntry).toHaveBeenCalled();
    });

    it.each(["mistakes", "rules", "managementDecisions", "nextTime"] as const)(
      "answers CONFLICT for review field %s while trades are open",
      async field => {
        vi.mocked(db.getJournalEntry).mockResolvedValue(waiting);
        await expect(
          caller.journal.update({ id: 1, [field]: textDoc })
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect(db.updateJournalEntry).not.toHaveBeenCalled();
      }
    );

    it("saves review fields once every trade has closed", async () => {
      await caller.journal.update({ id: 1, mistakes: textDoc, rules: null });
      expect(db.updateJournalEntry).toHaveBeenCalledWith(1, 1, {
        mistakes: textDoc,
        rules: null,
      });
    });
  });

  describe("setSetups", () => {
    it("replaces the entry's setups", async () => {
      await expect(
        caller.journal.setSetups({ id: 1, setupIds: [3, 4] })
      ).resolves.toEqual({ success: true });
      expect(db.setJournalEntrySetups).toHaveBeenCalledWith(1, 1, [3, 4]);
    });

    it("answers NOT_FOUND for an unknown setup", async () => {
      vi.mocked(db.getSetupRow).mockResolvedValue(undefined);
      await expect(
        caller.journal.setSetups({ id: 1, setupIds: [99] })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.setJournalEntrySetups).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an unknown entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(
        caller.journal.setSetups({ id: 99, setupIds: [] })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects duplicate setup ids with BAD_REQUEST", async () => {
      await expect(
        caller.journal.setSetups({ id: 1, setupIds: [3, 3] })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("answers CONFLICT for a reviewed entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(
        caller.journal.setSetups({ id: 1, setupIds: [] })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("addTrade / removeTrade", () => {
    it("links a matching trade, open ones included", async () => {
      vi.mocked(db.getTradeById).mockResolvedValue(
        trade(3, { status: "open", side: "short" })
      );
      await expect(
        caller.journal.addTrade({ id: 1, tradeId: 3 })
      ).resolves.toEqual({ success: true });
      expect(db.addJournalEntryTrade).toHaveBeenCalledWith(1, 1, 3);
    });

    it("answers NOT_FOUND for an unknown trade or entry", async () => {
      vi.mocked(db.getTradeById).mockResolvedValueOnce(undefined);
      await expect(
        caller.journal.addTrade({ id: 1, tradeId: 99 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(
        caller.journal.addTrade({ id: 99, tradeId: 3 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.addJournalEntryTrade).not.toHaveBeenCalled();
    });

    it.each([
      ["symbol", { symbol: "ETHUSDT" }],
      ["account", { accountId: 2 }],
    ])("rejects another %s with BAD_REQUEST", async (_label, overrides) => {
      vi.mocked(db.getTradeById).mockResolvedValue(trade(3, overrides));
      await expect(
        caller.journal.addTrade({ id: 1, tradeId: 3 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.addJournalEntryTrade).not.toHaveBeenCalled();
    });

    it("answers CONFLICT for a trade already linked", async () => {
      vi.mocked(db.addJournalEntryTrade).mockRejectedValue(uniqueViolation);
      vi.mocked(db.getJournalEntryForTrade).mockResolvedValue(summary);
      await expect(
        caller.journal.addTrade({ id: 1, tradeId: 3 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.getJournalEntryForTrade).toHaveBeenCalledWith(1, 3);
    });

    it("answers CONFLICT for a reviewed entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(
        caller.journal.addTrade({ id: 1, tradeId: 3 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller.journal.removeTrade({ id: 1, tradeId: 2 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("unlinks a trade while others remain", async () => {
      await expect(
        caller.journal.removeTrade({ id: 1, tradeId: 2 })
      ).resolves.toEqual({ success: true });
      expect(db.removeJournalEntryTrade).toHaveBeenCalledWith(1, 1, 2);
    });

    it("answers NOT_FOUND for a trade not linked to this entry", async () => {
      await expect(
        caller.journal.removeTrade({ id: 1, tradeId: 3 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.removeJournalEntryTrade).not.toHaveBeenCalled();
    });

    it("refuses to remove the last trade with BAD_REQUEST", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(
        entry({ trades: [trade(1)], tradeCount: 1 })
      );
      await expect(
        caller.journal.removeTrade({ id: 1, tradeId: 1 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.removeJournalEntryTrade).not.toHaveBeenCalled();
    });
  });

  describe("slot images", () => {
    const full = Array.from({ length: SLOT_IMAGE_MAX }, (_, i) => i + 100);

    it("adds an image the entry owns and returns the slot", async () => {
      await expect(
        caller.journal.addSlotImage({ id: 1, slot: "before", imageId: 5 })
      ).resolves.toEqual({ imageIds: [5] });
      expect(db.getImageOwner).toHaveBeenCalledWith(1, 5);
      expect(db.addSlotImage).toHaveBeenCalledWith(1, 1, "before", 5);
    });

    it.each([
      ["unknown", undefined],
      ["owned by another entry", { ownerKind: "journal_entry", ownerId: 2 }],
      ["owned by a plan", { ownerKind: "plan", ownerId: 1 }],
      ["owned by a setup", { ownerKind: "setup", ownerId: 1 }],
    ] as const)("answers NOT_FOUND for an image %s", async (_label, owner) => {
      vi.mocked(db.getImageOwner).mockResolvedValue(owner);
      await expect(
        caller.journal.addSlotImage({ id: 1, slot: "before", imageId: 5 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.addSlotImage).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an unknown entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(
        caller.journal.addSlotImage({ id: 99, slot: "before", imageId: 5 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("locks the after slot while trades are open, not the before slot", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(waiting);
      await expect(
        caller.journal.addSlotImage({ id: 1, slot: "after", imageId: 5 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller.journal.removeSlotImage({ id: 1, slot: "after", imageId: 5 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await caller.journal.addSlotImage({ id: 1, slot: "before", imageId: 5 });
      await caller.journal.removeSlotImage({
        id: 1,
        slot: "before",
        imageId: 5,
      });
      expect(db.addSlotImage).toHaveBeenCalledTimes(1);
      expect(db.removeSlotImage).toHaveBeenCalledTimes(1);
    });

    it("answers CONFLICT on a reviewed entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(
        caller.journal.addSlotImage({ id: 1, slot: "before", imageId: 5 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller.journal.removeSlotImage({ id: 1, slot: "before", imageId: 5 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects a new image in a full slot with BAD_REQUEST", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(
        entry({ afterImageIds: full })
      );
      await expect(
        caller.journal.addSlotImage({ id: 1, slot: "after", imageId: 5 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.addSlotImage).not.toHaveBeenCalled();
    });

    it("lets an image already in a full slot through as a no-op", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(
        entry({ beforeImageIds: full })
      );
      await caller.journal.addSlotImage({
        id: 1,
        slot: "before",
        imageId: 100,
      });
      expect(db.addSlotImage).toHaveBeenCalledWith(1, 1, "before", 100);
    });

    it("removes an image from a slot and returns the slot", async () => {
      await expect(
        caller.journal.removeSlotImage({ id: 1, slot: "after", imageId: 5 })
      ).resolves.toEqual({ imageIds: [] });
      expect(db.removeSlotImage).toHaveBeenCalledWith(1, 1, "after", 5);
    });
  });

  describe("review state", () => {
    it("marks a closed entry reviewed", async () => {
      await expect(caller.journal.markReviewed({ id: 1 })).resolves.toEqual({
        success: true,
      });
      expect(db.setJournalEntryReviewedAt).toHaveBeenCalledWith(
        1,
        1,
        expect.any(Date)
      );
    });

    it("answers CONFLICT when marking while trades are open or already reviewed", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValueOnce(waiting);
      await expect(
        caller.journal.markReviewed({ id: 1 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      vi.mocked(db.getJournalEntry).mockResolvedValueOnce(reviewed);
      await expect(
        caller.journal.markReviewed({ id: 1 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.setJournalEntryReviewedAt).not.toHaveBeenCalled();
    });

    it("reopens a reviewed entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(caller.journal.reopen({ id: 1 })).resolves.toEqual({
        success: true,
      });
      expect(db.setJournalEntryReviewedAt).toHaveBeenCalledWith(1, 1, null);
    });

    it("answers CONFLICT when reopening an unreviewed entry", async () => {
      await expect(caller.journal.reopen({ id: 1 })).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(db.setJournalEntryReviewedAt).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an unknown entry", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(undefined);
      await expect(
        caller.journal.markReviewed({ id: 99 })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(caller.journal.reopen({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("delete", () => {
    it("deletes in either state", async () => {
      vi.mocked(db.getJournalEntry).mockResolvedValue(reviewed);
      await expect(caller.journal.delete({ id: 1 })).resolves.toEqual({
        success: true,
      });
      expect(db.deleteJournalEntry).toHaveBeenCalledWith(1, 1);
    });

    it("answers NOT_FOUND for an unknown entry", async () => {
      vi.mocked(db.deleteJournalEntry).mockResolvedValue(false);
      await expect(caller.journal.delete({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
