import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

const openGoal = {
  id: 1,
  userId: 1,
  text: "Open goal",
  completedAt: null,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
};

const laterGoal = {
  ...openGoal,
  id: 2,
  text: "Later goal",
  createdAt: new Date(2000),
  updatedAt: new Date(2000),
};

vi.mock("./db", () => ({
  createGoal: vi.fn().mockImplementation(data => ({
    id: 1,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  })),
  getGoalById: vi.fn(),
  listGoalsByUserId: vi.fn(),
  updateGoal: vi.fn().mockImplementation((id, userId, data) => ({
    ...openGoal,
    id,
    userId,
    ...data,
  })),
  deleteGoal: vi.fn().mockResolvedValue(undefined),
}));

describe("Goal Router", () => {
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
    vi.mocked(db.getGoalById).mockResolvedValue(openGoal);
    vi.mocked(db.listGoalsByUserId).mockResolvedValue([openGoal, laterGoal]);
  });

  describe("create", () => {
    it("trims text and scopes the goal to the user", async () => {
      const result = await caller.goal.create({
        text: "  Stop revenge trading  ",
      });

      expect(result).toMatchObject({ userId: 1, text: "Stop revenge trading" });
      expect(db.createGoal).toHaveBeenCalledWith({
        userId: 1,
        text: "Stop revenge trading",
      });
    });

    it("rejects empty or whitespace-only text", async () => {
      await expect(caller.goal.create({ text: "   " })).rejects.toThrow(
        "Goal text cannot be empty"
      );
      expect(db.createGoal).not.toHaveBeenCalled();
    });

    it("rejects text over 200 chars", async () => {
      await expect(
        caller.goal.create({ text: "x".repeat(201) })
      ).rejects.toThrow();
      expect(db.createGoal).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("returns goals in createdAt order for the user", async () => {
      const result = await caller.goal.list();

      expect(db.listGoalsByUserId).toHaveBeenCalledWith(1);
      expect(result.map(g => g.id)).toEqual([1, 2]);
    });
  });

  describe("setDone", () => {
    it("sets completedAt when done", async () => {
      const result = await caller.goal.setDone({ id: 1, done: true });

      expect(db.updateGoal).toHaveBeenCalledWith(1, 1, {
        completedAt: expect.any(Date),
      });
      expect(result?.completedAt).toBeInstanceOf(Date);
    });

    it("clears completedAt when reopened", async () => {
      const result = await caller.goal.setDone({ id: 1, done: false });

      expect(db.updateGoal).toHaveBeenCalledWith(1, 1, { completedAt: null });
      expect(result?.completedAt).toBeNull();
    });
  });

  describe("update", () => {
    it("trims text and rejects empty text", async () => {
      await caller.goal.update({ id: 1, text: "  Size down  " });
      expect(db.updateGoal).toHaveBeenCalledWith(1, 1, { text: "Size down" });

      await expect(caller.goal.update({ id: 1, text: " " })).rejects.toThrow(
        "Goal text cannot be empty"
      );
    });
  });

  describe("ownership", () => {
    beforeEach(() => {
      vi.mocked(db.getGoalById).mockResolvedValue(undefined);
    });

    it("rejects update of a goal the user does not own", async () => {
      await expect(
        caller.goal.update({ id: 99, text: "nope" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.updateGoal).not.toHaveBeenCalled();
    });

    it("rejects setDone of a goal the user does not own", async () => {
      await expect(
        caller.goal.setDone({ id: 99, done: true })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.updateGoal).not.toHaveBeenCalled();
    });

    it("rejects delete of a goal the user does not own", async () => {
      await expect(caller.goal.delete({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(db.deleteGoal).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("deletes an owned goal", async () => {
      const result = await caller.goal.delete({ id: 1 });

      expect(db.deleteGoal).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ success: true });
    });
  });
});
