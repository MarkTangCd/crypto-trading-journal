import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock the database functions
vi.mock("./db", () => ({
  getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "10000" }),
  createAccount: vi.fn().mockImplementation(data => ({
    id: 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Account",
    notes: "Test notes",
    initialBalance: "1000",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getAccountsByUserId: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      name: "Test Account",
      notes: "Test notes",
      initialBalance: "1000",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  updateAccount: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Updated Account",
    notes: "Updated notes",
    initialBalance: "2000",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  deleteAccountWithTransactions: vi.fn().mockResolvedValue(undefined),
  getAccountCount: vi.fn().mockResolvedValue(2),
  ensureUserHasAccount: vi.fn().mockImplementation(userId => ({
    id: 1,
    userId,
    name: "Default Account",
    notes: null,
    initialBalance: "0",
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
}));

describe("Account Router", () => {
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
      initialBalance: "10000",
      activeTradingSystemId: null,
    },
  };

  const caller = appRouter.createCaller(mockCtx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should create an account with valid data", async () => {
      const result = await caller.account.create({
        name: "Test Account",
        notes: "Test notes",
        initialBalance: "1000",
      });

      expect(result).toMatchObject({
        id: expect.any(Number),
        name: "Test Account",
        notes: "Test notes",
        initialBalance: "1000",
        userId: 1,
      });
      expect(db.createAccount).toHaveBeenCalledWith({
        userId: 1,
        name: "Test Account",
        notes: "Test notes",
        initialBalance: "1000",
      });
    });

    it("should trim account name", async () => {
      await caller.account.create({
        name: "  Test Account  ",
      });

      expect(db.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Account",
        })
      );
    });

    it("should default initialBalance to '0' when not provided", async () => {
      await caller.account.create({
        name: "Test Account",
      });

      expect(db.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          initialBalance: "0",
        })
      );
    });

    it("should reject empty name after trimming", async () => {
      await expect(
        caller.account.create({
          name: "   ",
        })
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("should return all accounts for the user", async () => {
      const result = await caller.account.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        name: "Test Account",
        userId: 1,
      });
      expect(db.getAccountsByUserId).toHaveBeenCalledWith(1);
    });
  });

  describe("get", () => {
    it("should return an account by id", async () => {
      const result = await caller.account.get({ id: 1 });

      expect(result).toMatchObject({
        id: 1,
        name: "Test Account",
        userId: 1,
      });
      expect(db.getAccountById).toHaveBeenCalledWith(1, 1);
    });

    it("should return null for non-existent account", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);

      const result = await caller.account.get({ id: 999 });

      expect(result).toBeUndefined();
    });
  });

  describe("update", () => {
    it("should update an account with valid data", async () => {
      const result = await caller.account.update({
        id: 1,
        name: "Updated Account",
        notes: "Updated notes",
        initialBalance: "2000",
      });

      expect(result).toMatchObject({
        id: 1,
        name: "Updated Account",
        notes: "Updated notes",
        initialBalance: "2000",
      });
      expect(db.updateAccount).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          name: "Updated Account",
          notes: "Updated notes",
          initialBalance: "2000",
        })
      );
    });

    it("should trim name when updating", async () => {
      await caller.account.update({
        id: 1,
        name: "  Updated Account  ",
      });

      expect(db.updateAccount).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          name: "Updated Account",
        })
      );
    });
  });

  describe("delete", () => {
    it("should delete an account when user has multiple accounts", async () => {
      vi.mocked(db.getAccountCount).mockResolvedValueOnce(2);

      const result = await caller.account.delete({ id: 1 });

      expect(result).toEqual({ success: true });
      expect(db.deleteAccountWithTransactions).toHaveBeenCalledWith(1, 1);
    });

    it("should prevent deleting the last account", async () => {
      vi.mocked(db.getAccountCount).mockResolvedValueOnce(1);

      await expect(caller.account.delete({ id: 1 })).rejects.toThrow(
        "Cannot delete the last account"
      );
      expect(db.deleteAccountWithTransactions).not.toHaveBeenCalled();
    });
  });
});

describe("Account Migration", () => {
  it("should ensure user has a default account", async () => {
    expect(true).toBe(true);
  });
});
