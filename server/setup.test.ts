import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { RichTextDoc } from "@shared/richText";
import { ENTRY_TRIGGER_MAX, SETUP_NAME_MAX } from "@shared/const";
import * as db from "./db";

const setup = {
  id: 1,
  userId: 1,
  name: "Range reclaim",
  description: null,
  triggers: [],
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
};

const savedAt = new Date(9000);

const textDoc: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "note" }] }],
};

vi.mock("./db", () => ({
  listSetups: vi.fn().mockResolvedValue([]),
  getSetup: vi.fn(),
  getSetupRow: vi.fn(),
  findSetupByName: vi.fn(),
  createSetup: vi.fn(),
  updateSetup: vi.fn(),
  deleteSetup: vi.fn(),
}));

describe("Setup Router", () => {
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
    vi.mocked(db.getSetup).mockResolvedValue({ ...setup, usageCount: 0 });
    vi.mocked(db.getSetupRow).mockResolvedValue(setup);
    vi.mocked(db.findSetupByName).mockResolvedValue(undefined);
    vi.mocked(db.createSetup).mockImplementation(async (userId, name) => ({
      ...setup,
      id: 42,
      userId,
      name,
    }));
    vi.mocked(db.updateSetup).mockResolvedValue({
      ...setup,
      updatedAt: savedAt,
    });
    vi.mocked(db.deleteSetup).mockResolvedValue(true);
  });

  describe("reads", () => {
    it("list is scoped to the user", async () => {
      await caller.setup.list();
      expect(db.listSetups).toHaveBeenCalledWith(1);
    });

    it("get returns the setup or NOT_FOUND", async () => {
      await expect(caller.setup.get({ id: 1 })).resolves.toMatchObject({
        id: 1,
        usageCount: 0,
      });
      vi.mocked(db.getSetup).mockResolvedValue(undefined);
      await expect(caller.setup.get({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(db.getSetup).toHaveBeenLastCalledWith(1, 99);
    });
  });

  describe("create", () => {
    it("trims the name and returns the new id", async () => {
      await expect(
        caller.setup.create({ name: "  Breakout  " })
      ).resolves.toEqual({ id: 42 });
      expect(db.findSetupByName).toHaveBeenCalledWith(1, "Breakout");
      expect(db.createSetup).toHaveBeenCalledWith(1, "Breakout");
    });

    it.each(["", "   ", "x".repeat(SETUP_NAME_MAX + 1)])(
      "rejects name %j with BAD_REQUEST",
      async name => {
        await expect(caller.setup.create({ name })).rejects.toMatchObject({
          code: "BAD_REQUEST",
        });
        expect(db.createSetup).not.toHaveBeenCalled();
      }
    );

    it("accepts a name of exactly SETUP_NAME_MAX after trimming", async () => {
      const name = "x".repeat(SETUP_NAME_MAX);
      await caller.setup.create({ name: ` ${name} ` });
      expect(db.createSetup).toHaveBeenCalledWith(1, name);
    });

    it("rejects a name taken case-insensitively with CONFLICT", async () => {
      vi.mocked(db.findSetupByName).mockResolvedValue({ id: 1 });
      await expect(
        caller.setup.create({ name: "RANGE RECLAIM" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.createSetup).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("saves name, description and triggers and returns updatedAt", async () => {
      await expect(
        caller.setup.update({
          id: 1,
          name: " Breakout ",
          description: textDoc,
          triggers: [" reclaim of the range high ", "volume spike"],
        })
      ).resolves.toEqual({ updatedAt: savedAt });
      expect(db.updateSetup).toHaveBeenCalledWith(1, 1, {
        name: "Breakout",
        description: textDoc,
        triggers: ["reclaim of the range high", "volume spike"],
      });
    });

    it("clears the description with null and accepts no triggers", async () => {
      await caller.setup.update({ id: 1, description: null, triggers: [] });
      expect(db.updateSetup).toHaveBeenCalledWith(1, 1, {
        description: null,
        triggers: [],
      });
      expect(db.findSetupByName).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND for an unknown or foreign setup", async () => {
      vi.mocked(db.getSetupRow).mockResolvedValue(undefined);
      await expect(
        caller.setup.update({ id: 99, name: "Breakout" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.getSetupRow).toHaveBeenCalledWith(1, 99);
      expect(db.updateSetup).not.toHaveBeenCalled();
    });

    it("rejects another setup's name with CONFLICT", async () => {
      vi.mocked(db.findSetupByName).mockResolvedValue({ id: 2 });
      await expect(
        caller.setup.update({ id: 1, name: "breakout" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.updateSetup).not.toHaveBeenCalled();
    });

    it("lets a setup change the case of its own name", async () => {
      vi.mocked(db.findSetupByName).mockResolvedValue({ id: 1 });
      await caller.setup.update({ id: 1, name: "RANGE RECLAIM" });
      expect(db.updateSetup).toHaveBeenCalledWith(1, 1, {
        name: "RANGE RECLAIM",
      });
    });

    it.each(["", "  ", "x".repeat(SETUP_NAME_MAX + 1)])(
      "rejects name %j with BAD_REQUEST",
      async name => {
        await expect(
          caller.setup.update({ id: 1, name })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(db.updateSetup).not.toHaveBeenCalled();
      }
    );

    it.each([
      ["an empty trigger", ["ok", "  "]],
      ["a trigger over ENTRY_TRIGGER_MAX", ["x".repeat(ENTRY_TRIGGER_MAX + 1)]],
      ["duplicate triggers", ["Volume spike", " volume SPIKE "]],
    ])("rejects %s with BAD_REQUEST", async (_label, triggers) => {
      await expect(
        caller.setup.update({ id: 1, triggers })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.updateSetup).not.toHaveBeenCalled();
    });

    it("accepts a trigger of exactly ENTRY_TRIGGER_MAX after trimming", async () => {
      const trigger = "x".repeat(ENTRY_TRIGGER_MAX);
      await caller.setup.update({ id: 1, triggers: [` ${trigger} `] });
      expect(db.updateSetup).toHaveBeenCalledWith(1, 1, {
        triggers: [trigger],
      });
    });
  });

  describe("delete", () => {
    it("deletes an unused setup", async () => {
      await expect(caller.setup.delete({ id: 1 })).resolves.toEqual({
        success: true,
      });
      expect(db.deleteSetup).toHaveBeenCalledWith(1, 1);
    });

    it("answers NOT_FOUND for an unknown or foreign setup", async () => {
      vi.mocked(db.getSetup).mockResolvedValue(undefined);
      await expect(caller.setup.delete({ id: 99 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(db.deleteSetup).not.toHaveBeenCalled();
    });

    it("refuses a setup in use with CONFLICT", async () => {
      vi.mocked(db.getSetup).mockResolvedValue({ ...setup, usageCount: 2 });
      await expect(caller.setup.delete({ id: 1 })).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(db.deleteSetup).not.toHaveBeenCalled();
    });
  });
});
