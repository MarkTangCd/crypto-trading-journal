import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  // unused by settings router but required by the broader appRouter graph
  getTransactionById: vi.fn(),
  getAccountById: vi.fn(),
  getAccountSnapshot: vi.fn(),
  getTransactionsByUserId: vi.fn(),
  getOrCreateConversation: vi.fn(),
  appendMessage: vi.fn(),
  listMessages: vi.fn(),
  getAgentSettings: vi.fn(),
  upsertAgentSettings: vi.fn(),
  createAccount: vi.fn(),
  getAccountsByUserId: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccountWithTransactions: vi.fn(),
  getAccountCount: vi.fn(),
  createTransactionWithElements: vi.fn(),
  updateTransaction: vi.fn(),
  closeOpenTransaction: vi.fn(),
  deleteTransactionWithElements: vi.fn(),
  getStatistics: vi.fn(),
  getUniqueTradingPairs: vi.fn(),
  runInSqliteTransaction: vi
    .fn()
    .mockImplementation(async (op: (db: unknown) => Promise<unknown>) =>
      op(undefined)
    ),
}));

vi.mock("./agents/secrets", () => ({
  getProviderApiKey: vi.fn(),
  getProviderBaseUrl: vi.fn(),
  getProviderConfig: vi.fn(),
  setProviderConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/providers/deepseek", () => ({
  deepseekProvider: {
    id: "deepseek",
    defaultModel: "deepseek-chat",
    chat: vi.fn(),
  },
}));

const { appRouter } = await import("./routers");
const secrets = await import("./agents/secrets");

const fakeUser = {
  id: 1,
  openId: "anon",
  email: null,
  name: "anon",
  loginMethod: "anonymous",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function makeCtx(): TrpcContext {
  return {
    user: fakeUser,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settings router", () => {
  describe("getProviderConfig", () => {
    it("returns hasKey=false when nothing is configured", async () => {
      vi.mocked(secrets.getProviderConfig).mockResolvedValueOnce(undefined);
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getProviderConfig({
        providerId: "deepseek",
      });

      expect(result).toEqual({
        providerId: "deepseek",
        hasKey: false,
        baseUrl: null,
      });
    });

    it("returns hasKey=true and the baseUrl but NEVER the plaintext apiKey", async () => {
      vi.mocked(secrets.getProviderConfig).mockResolvedValueOnce({
        apiKey: "sk-very-secret",
        baseUrl: "https://example.test",
      });
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getProviderConfig({
        providerId: "deepseek",
      });

      expect(result.hasKey).toBe(true);
      expect(result.baseUrl).toBe("https://example.test");
      expect(JSON.stringify(result)).not.toContain("sk-very-secret");
    });
  });

  describe("setProviderConfig", () => {
    it("forwards apiKey + baseUrl to the secrets layer scoped to ctx.user.id", async () => {
      const caller = appRouter.createCaller(makeCtx());
      const result = await caller.settings.setProviderConfig({
        providerId: "deepseek",
        apiKey: "sk-new",
        baseUrl: "https://custom.test",
      });

      expect(result).toEqual({ success: true });
      expect(secrets.setProviderConfig).toHaveBeenCalledWith(1, "deepseek", {
        apiKey: "sk-new",
        baseUrl: "https://custom.test",
      });
    });

    it("normalises empty baseUrl to null so the secrets layer can drop it", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await caller.settings.setProviderConfig({
        providerId: "deepseek",
        apiKey: "sk-new",
        baseUrl: "",
      });

      expect(secrets.setProviderConfig).toHaveBeenCalledWith(1, "deepseek", {
        apiKey: "sk-new",
        baseUrl: null,
      });
    });

    it("rejects unknown providerId via zod enum guard", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(
        // @ts-expect-error intentional invalid input
        caller.settings.setProviderConfig({ providerId: "gpt-9", apiKey: "x" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
