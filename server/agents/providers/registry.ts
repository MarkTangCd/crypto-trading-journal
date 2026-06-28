import type { ChatProvider } from "./types";
import { deepseekProvider } from "./deepseek";
import { kimiProvider } from "./kimi";
import { glmProvider } from "./glm";
import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";

export interface ProviderMetadata {
  /** Stable provider id, e.g. "deepseek". Used as registry key and DB value. */
  id: string;
  /** Display label shown to the user (e.g. in Settings). */
  label: string;
  /** Public default base URL the adapter uses when no override is set. */
  defaultBaseUrl: string;
  /** Default model id the adapter sends when the request omits one. */
  defaultModel: string;
  /** Env var name that holds the api key for local dev fallback. */
  envApiKey: string;
  /** Env var name that overrides the base URL for local dev fallback. */
  envBaseUrl: string;
}

interface RegistryEntry {
  metadata: ProviderMetadata;
  provider: ChatProvider;
}

// Insertion order is preserved by JS Map iteration — used as canonical display
// order in Settings UI down the road.
const REGISTRY = new Map<string, RegistryEntry>();

function register(entry: RegistryEntry): void {
  REGISTRY.set(entry.metadata.id, entry);
}

register({
  metadata: {
    id: "deepseek",
    label: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    envApiKey: "DEEPSEEK_API_KEY",
    envBaseUrl: "DEEPSEEK_BASE_URL",
  },
  provider: deepseekProvider,
});

register({
  metadata: {
    id: "kimi",
    label: "kimi · moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-128k",
    envApiKey: "MOONSHOT_API_KEY",
    envBaseUrl: "MOONSHOT_BASE_URL",
  },
  provider: kimiProvider,
});

register({
  metadata: {
    id: "glm",
    label: "glm · 智谱",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4.5",
    envApiKey: "GLM_API_KEY",
    envBaseUrl: "GLM_BASE_URL",
  },
  provider: glmProvider,
});

register({
  metadata: {
    id: "openai",
    label: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5",
    envApiKey: "OPENAI_API_KEY",
    envBaseUrl: "OPENAI_BASE_URL",
  },
  provider: openaiProvider,
});

register({
  metadata: {
    id: "gemini",
    label: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    envApiKey: "GEMINI_API_KEY",
    envBaseUrl: "GEMINI_BASE_URL",
  },
  provider: geminiProvider,
});

export function getProvider(id: string): ChatProvider | undefined {
  return REGISTRY.get(id)?.provider;
}

export function listProviders(): ProviderMetadata[] {
  return Array.from(REGISTRY.values()).map(entry => entry.metadata);
}
