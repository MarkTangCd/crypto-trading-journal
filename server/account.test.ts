import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { Account } from "../drizzle/schema";
import * as db from "./db";
import * as sync from "./exchange/sync";
import { createBinanceAdapter } from "./exchange/binance";
import {
  createFakeAdapter,
  type FakeAdapterFixtures,
} from "./exchange/testing/fakeAdapter";

// Reversible stand-in so tests never touch the real master key file.
vi.mock("./agents/secrets", async importOriginal => ({
  ...(await importOriginal<typeof import("./agents/secrets")>()),
  encrypt: (plaintext: string) => `enc:${plaintext}`,
  decrypt: (token: string) => token.replace(/^enc:/, ""),
}));

vi.mock("./exchange/binance", () => ({ createBinanceAdapter: vi.fn() }));

vi.mock("./exchange/sync", () => ({
  runSync: vi.fn().mockResolvedValue(undefined),
  autoSync: vi.fn().mockResolvedValue([{ accountId: 1, ok: true }]),
}));

function accountRow(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    userId: 1,
    name: "Test Account",
    notes: "Test notes",
    initialBalance: "0",
    exchange: "binance",
    apiKey: "enc:key-abcd1234",
    apiSecret: "enc:secret-xyz",
    keyVerifiedAt: 1,
    balanceUsdt: null,
    unrealizedPnlUsdt: null,
    backfillStart: null,
    incomeCursorAt: null,
    lastSyncedAt: null,
    lastSyncAttemptAt: null,
    lastSyncErrorCode: null,
    lastSyncRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// node:sqlite cannot load under vitest, so toPublicAccount is mirrored here;
// the real one is covered by trade.db.test.ts.
vi.mock("./db", () => ({
  toPublicAccount: ({ apiKey, apiSecret: _apiSecret, ...rest }: Account) => ({
    ...rest,
    apiKeyTail: apiKey === null ? null : apiKey.slice(-4),
  }),
  createAccount: vi.fn(),
  getAccountById: vi.fn(),
  getAccountsByUserId: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccountCascade: vi.fn().mockResolvedValue(undefined),
  getAccountCount: vi.fn().mockResolvedValue(2),
}));

function useAdapter(fixtures: FakeAdapterFixtures = {}) {
  const fake = createFakeAdapter(fixtures);
  vi.mocked(createBinanceAdapter).mockReturnValue(fake.adapter);
  return fake;
}

function expectNoSecrets(account: object | undefined) {
  expect(account).not.toHaveProperty("apiKey");
  expect(account).not.toHaveProperty("apiSecret");
  expect(account).toHaveProperty("apiKeyTail", "1234");
}

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
    },
  };

  const caller = appRouter.createCaller(mockCtx);

  const createInput = {
    name: "Test Account",
    exchange: "binance" as const,
    apiKey: "key-abcd1234",
    apiSecret: "secret-xyz",
    notes: "Test notes",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.createAccount).mockImplementation(async data =>
      accountRow({ ...data, id: 1 })
    );
    vi.mocked(db.getAccountById).mockResolvedValue(accountRow());
    vi.mocked(db.getAccountsByUserId).mockResolvedValue([accountRow()]);
    vi.mocked(db.updateAccount).mockImplementation(async (_id, _userId, data) =>
      accountRow(data)
    );
  });

  describe("create", () => {
    it("verifies the key, encrypts both secrets and inserts", async () => {
      const fake = useAdapter();

      const result = await caller.account.create(createInput);

      expect(fake.calls).toEqual([
        {
          method: "verifyKey",
          args: [{ apiKey: "key-abcd1234", apiSecret: "secret-xyz" }],
        },
      ]);
      expect(db.createAccount).toHaveBeenCalledWith({
        userId: 1,
        name: "Test Account",
        notes: "Test notes",
        exchange: "binance",
        apiKey: "enc:key-abcd1234",
        apiSecret: "enc:secret-xyz",
        keyVerifiedAt: expect.any(Number),
      });
      expectNoSecrets(result);
    });

    it("trims the account name", async () => {
      useAdapter();

      await caller.account.create({ ...createInput, name: "  Test Account  " });

      expect(db.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test Account" })
      );
    });

    it("rejects an empty name after trimming", async () => {
      useAdapter();

      await expect(
        caller.account.create({ ...createInput, name: "   " })
      ).rejects.toThrow("Account name cannot be empty");
      expect(db.createAccount).not.toHaveBeenCalled();
    });

    it("rejects a failed verification with the code and writes nothing", async () => {
      useAdapter({ verifyKey: { ok: false, code: "permissions_changed" } });

      await expect(caller.account.create(createInput)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "permissions_changed",
      });
      expect(db.createAccount).not.toHaveBeenCalled();
    });

    it("rejects a verification that throws with the code and writes nothing", async () => {
      useAdapter({ throws: { verifyKey: "clock_skew" } });

      await expect(caller.account.create(createInput)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "clock_skew",
      });
      expect(db.createAccount).not.toHaveBeenCalled();
    });
  });

  describe("list / get", () => {
    it("returns accounts without secrets and with apiKeyTail", async () => {
      const result = await caller.account.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, name: "Test Account" });
      expectNoSecrets(result[0]);
      expect(db.getAccountsByUserId).toHaveBeenCalledWith(1);
    });

    it("returns one account without secrets and with apiKeyTail", async () => {
      const result = await caller.account.get({ id: 1 });

      expect(result).toMatchObject({ id: 1, name: "Test Account" });
      expectNoSecrets(result);
      expect(db.getAccountById).toHaveBeenCalledWith(1, 1);
    });

    it("returns undefined for a missing account", async () => {
      vi.mocked(db.getAccountById).mockResolvedValueOnce(undefined);

      expect(await caller.account.get({ id: 999 })).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates name and notes only", async () => {
      const result = await caller.account.update({
        id: 1,
        name: "  Updated Account  ",
        notes: "Updated notes",
      });

      expect(db.updateAccount).toHaveBeenCalledWith(1, 1, {
        name: "Updated Account",
        notes: "Updated notes",
      });
      expectNoSecrets(result);
    });
  });

  describe("replaceKey", () => {
    it("verifies, encrypts, updates and clears the sync error", async () => {
      useAdapter();
      vi.mocked(db.updateAccount).mockResolvedValueOnce(
        accountRow({ apiKey: "enc:new-key-1234" })
      );

      const result = await caller.account.replaceKey({
        id: 1,
        apiKey: "new-key-1234",
        apiSecret: "new-secret",
      });

      // Only key and error fields: fills, trades and cursors stay untouched.
      expect(db.updateAccount).toHaveBeenCalledWith(1, 1, {
        apiKey: "enc:new-key-1234",
        apiSecret: "enc:new-secret",
        keyVerifiedAt: expect.any(Number),
        lastSyncErrorCode: null,
        lastSyncRetryAt: null,
      });
      expect(db.deleteAccountCascade).not.toHaveBeenCalled();
      expectNoSecrets(result);
    });

    it("rejects a failed verification and writes nothing", async () => {
      useAdapter({ verifyKey: { ok: false, code: "invalid_key" } });

      await expect(
        caller.account.replaceKey({ id: 1, apiKey: "bad", apiSecret: "bad" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "invalid_key" });
      expect(db.updateAccount).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("cascades through deleteAccountCascade", async () => {
      const result = await caller.account.delete({ id: 1 });

      expect(result).toEqual({ success: true });
      expect(db.deleteAccountCascade).toHaveBeenCalledWith(1, 1);
    });

    it("prevents deleting the last account", async () => {
      vi.mocked(db.getAccountCount).mockResolvedValueOnce(1);

      await expect(caller.account.delete({ id: 1 })).rejects.toThrow(
        "Cannot delete the last account"
      );
      expect(db.deleteAccountCascade).not.toHaveBeenCalled();
    });
  });

  describe("sync / autoSync", () => {
    it("runs a manual sync and returns the refreshed public account", async () => {
      vi.mocked(db.getAccountById)
        .mockResolvedValueOnce(accountRow())
        .mockResolvedValueOnce(accountRow({ balanceUsdt: "1234.5" }));

      const result = await caller.account.sync({ id: 1 });

      expect(sync.runSync).toHaveBeenCalledWith(1, 1, { reason: "manual" });
      expect(result).toMatchObject({ balanceUsdt: "1234.5" });
      expectNoSecrets(result);
    });

    it("returns the per-account outcome list", async () => {
      expect(await caller.account.autoSync()).toEqual([
        { accountId: 1, ok: true },
      ]);
      expect(sync.autoSync).toHaveBeenCalledWith(1);
    });
  });
});
