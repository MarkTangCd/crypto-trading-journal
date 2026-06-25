import { describe, expect, it } from "vitest";
import { getProvider, listProviders } from "./registry";

describe("provider registry", () => {
  it("exports deepseek + kimi + glm + openai + gemini in stable order", () => {
    expect(listProviders().map(p => p.id)).toEqual([
      "deepseek",
      "kimi",
      "glm",
      "openai",
      "gemini",
    ]);
  });

  it("deepseek metadata matches the plan", () => {
    const meta = listProviders().find(p => p.id === "deepseek");
    expect(meta).toBeDefined();
    expect(meta?.label).toBe("deepseek");
    expect(meta?.defaultBaseUrl).toBe("https://api.deepseek.com");
    expect(meta?.defaultModel).toBe("deepseek-chat");
    expect(meta?.envApiKey).toBe("DEEPSEEK_API_KEY");
    expect(meta?.envBaseUrl).toBe("DEEPSEEK_BASE_URL");
    const provider = getProvider("deepseek");
    expect(provider?.id).toBe("deepseek");
    expect(provider?.defaultModel).toBe("deepseek-chat");
  });

  it("kimi metadata matches the plan", () => {
    const meta = listProviders().find(p => p.id === "kimi");
    expect(meta).toBeDefined();
    expect(meta?.label).toBe("kimi · moonshot");
    expect(meta?.defaultBaseUrl).toBe("https://api.moonshot.cn/v1");
    expect(meta?.defaultModel).toBe("moonshot-v1-128k");
    expect(meta?.envApiKey).toBe("MOONSHOT_API_KEY");
    expect(meta?.envBaseUrl).toBe("MOONSHOT_BASE_URL");
    const provider = getProvider("kimi");
    expect(provider?.id).toBe("kimi");
    expect(provider?.defaultModel).toBe("moonshot-v1-128k");
  });

  it("glm metadata matches the plan", () => {
    const meta = listProviders().find(p => p.id === "glm");
    expect(meta).toBeDefined();
    expect(meta?.label).toBe("glm · 智谱");
    expect(meta?.defaultBaseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(meta?.defaultModel).toBe("glm-4.5");
    expect(meta?.envApiKey).toBe("GLM_API_KEY");
    expect(meta?.envBaseUrl).toBe("GLM_BASE_URL");
    const provider = getProvider("glm");
    expect(provider?.id).toBe("glm");
    expect(provider?.defaultModel).toBe("glm-4.5");
  });

  it("openai metadata matches the plan", () => {
    const meta = listProviders().find(p => p.id === "openai");
    expect(meta).toBeDefined();
    expect(meta?.label).toBe("openai");
    expect(meta?.defaultBaseUrl).toBe("https://api.openai.com/v1");
    expect(meta?.defaultModel).toBe("gpt-5");
    expect(meta?.envApiKey).toBe("OPENAI_API_KEY");
    expect(meta?.envBaseUrl).toBe("OPENAI_BASE_URL");
    const provider = getProvider("openai");
    expect(provider?.id).toBe("openai");
    expect(provider?.defaultModel).toBe("gpt-5");
  });

  it("gemini metadata matches the plan", () => {
    const meta = listProviders().find(p => p.id === "gemini");
    expect(meta).toBeDefined();
    expect(meta?.label).toBe("gemini");
    expect(meta?.defaultBaseUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta"
    );
    expect(meta?.defaultModel).toBe("gemini-2.5-flash");
    expect(meta?.envApiKey).toBe("GEMINI_API_KEY");
    expect(meta?.envBaseUrl).toBe("GEMINI_BASE_URL");
    const provider = getProvider("gemini");
    expect(provider?.id).toBe("gemini");
    expect(provider?.defaultModel).toBe("gemini-2.5-flash");
  });

  it("getProvider returns undefined for unknown ids", () => {
    expect(getProvider("gpt-9")).toBeUndefined();
  });
});
