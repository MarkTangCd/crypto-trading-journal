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

vi.mock("./agents/providers/kimi", () => ({
  kimiProvider: {
    id: "kimi",
    defaultModel: "moonshot-v1-128k",
    chat: vi.fn(),
  },
}));

vi.mock("./agents/providers/glm", () => ({
  glmProvider: {
    id: "glm",
    defaultModel: "glm-4.5",
    chat: vi.fn(),
  },
}));

vi.mock("./agents/providers/openai", () => ({
  openaiProvider: {
    id: "openai",
    defaultModel: "gpt-5",
    chat: vi.fn(),
  },
}));

vi.mock("./agents/providers/gemini", () => ({
  geminiProvider: {
    id: "gemini",
    defaultModel: "gemini-2.5-flash",
    chat: vi.fn(),
  },
}));

const { appRouter } = await import("./routers");
const secrets = await import("./agents/secrets");
const db = await import("./db");

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
  describe("listProviders", () => {
    it("returns one entry per registered provider in stable order", async () => {
      vi.mocked(secrets.getProviderConfig).mockResolvedValue(undefined);
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.listProviders();

      expect(result.map(r => r.id)).toEqual([
        "deepseek",
        "kimi",
        "glm",
        "openai",
        "gemini",
      ]);
      expect(result.find(r => r.id === "kimi")).toMatchObject({
        label: "kimi · moonshot",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
        defaultModel: "moonshot-v1-128k",
      });
      expect(result.find(r => r.id === "gemini")).toMatchObject({
        label: "gemini",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        defaultModel: "gemini-2.5-flash",
      });
    });

    it("reflects hasKey + configuredBaseUrl from the secrets layer", async () => {
      vi.mocked(secrets.getProviderConfig).mockImplementation(
        async (_userId, providerId) => {
          if (providerId === "kimi") {
            return { apiKey: "sk-kimi", baseUrl: "https://proxy.test" };
          }
          return undefined;
        }
      );
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.listProviders();
      const kimi = result.find(r => r.id === "kimi");
      const openai = result.find(r => r.id === "openai");

      expect(kimi).toMatchObject({
        hasKey: true,
        configuredBaseUrl: "https://proxy.test",
      });
      expect(openai).toMatchObject({
        hasKey: false,
        configuredBaseUrl: null,
      });
    });

    it("NEVER returns plaintext apiKey for any provider", async () => {
      vi.mocked(secrets.getProviderConfig).mockImplementation(
        async (_userId, providerId) => ({
          apiKey: `sk-very-secret-${providerId}`,
          baseUrl: undefined,
        })
      );
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.listProviders();
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain("sk-very-secret");
      for (const row of result) {
        expect(row.hasKey).toBe(true);
        expect(Object.keys(row)).not.toContain("apiKey");
      }
    });
  });

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

  describe("getDefaultProvider", () => {
    it("returns the stored default provider", async () => {
      vi.mocked(db.getAgentSettings).mockResolvedValueOnce({
        userId: 1,
        defaultProvider: "kimi",
        providerConfigs: "",
        enabledSkillIds: [],
        updatedAt: new Date(),
      });
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getDefaultProvider();

      expect(result).toEqual({ defaultProvider: "kimi" });
    });

    it("falls back to deepseek when no settings row exists yet", async () => {
      vi.mocked(db.getAgentSettings).mockResolvedValueOnce(undefined);
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getDefaultProvider();

      expect(result).toEqual({ defaultProvider: "deepseek" });
    });
  });

  describe("setDefaultProvider", () => {
    it("upserts the chosen provider scoped to ctx.user.id", async () => {
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.setDefaultProvider({
        providerId: "glm",
      });

      expect(result).toEqual({ success: true });
      expect(db.upsertAgentSettings).toHaveBeenCalledWith(1, {
        defaultProvider: "glm",
      });
    });

    it("rejects unknown providerId via zod enum guard", async () => {
      const caller = appRouter.createCaller(makeCtx());

      await expect(
        // @ts-expect-error intentional invalid input
        caller.settings.setDefaultProvider({ providerId: "gpt-9" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.upsertAgentSettings).not.toHaveBeenCalled();
    });
  });

  describe("listSkills", () => {
    it("returns client-safe skill metadata for every production skill", async () => {
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.listSkills();

      // We don't pin a specific count — Phase 5 keeps registering new
      // skills — but the contract that internal-only skills (`__*`) stay
      // hidden and that the projection never leaks `parameters` / `run`
      // is load-bearing for the Settings UI and worth asserting.
      expect(result.every(skill => !skill.name.startsWith("__"))).toBe(true);
      for (const skill of result) {
        expect(skill).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
        });
        expect(Object.keys(skill)).not.toContain("parameters");
        expect(Object.keys(skill)).not.toContain("run");
      }
    });
  });

  describe("getEnabledSkillIds", () => {
    it("returns the stored allowlist verbatim", async () => {
      vi.mocked(db.getAgentSettings).mockResolvedValueOnce({
        userId: 1,
        defaultProvider: "deepseek",
        providerConfigs: "",
        enabledSkillIds: ["analyze", "web_search"],
        updatedAt: new Date(),
      });
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getEnabledSkillIds();

      expect(result).toEqual({ enabledSkillIds: ["analyze", "web_search"] });
    });

    it("falls back to [] when no settings row exists yet (default-all-enabled)", async () => {
      vi.mocked(db.getAgentSettings).mockResolvedValueOnce(undefined);
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.getEnabledSkillIds();

      expect(result).toEqual({ enabledSkillIds: [] });
    });
  });

  describe("setEnabledSkillIds", () => {
    it("upserts the allowlist scoped to ctx.user.id", async () => {
      const caller = appRouter.createCaller(makeCtx());

      const result = await caller.settings.setEnabledSkillIds({
        enabledSkillIds: ["analyze", "summarize"],
      });

      expect(result).toEqual({ success: true });
      expect(db.upsertAgentSettings).toHaveBeenCalledWith(1, {
        enabledSkillIds: ["analyze", "summarize"],
      });
    });

    it("accepts an empty array (the 'all enabled' sentinel)", async () => {
      const caller = appRouter.createCaller(makeCtx());

      await caller.settings.setEnabledSkillIds({ enabledSkillIds: [] });

      expect(db.upsertAgentSettings).toHaveBeenCalledWith(1, {
        enabledSkillIds: [],
      });
    });

    it("rejects payloads exceeding the 50-entry cap", async () => {
      const caller = appRouter.createCaller(makeCtx());

      const enabledSkillIds = Array.from(
        { length: 51 },
        (_, i) => `skill-${i}`
      );

      await expect(
        caller.settings.setEnabledSkillIds({ enabledSkillIds })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.upsertAgentSettings).not.toHaveBeenCalled();
    });
  });
});
