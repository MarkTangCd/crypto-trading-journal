import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getAgentSettings, upsertAgentSettings } from "../db";

const MASTER_KEY_PATH = resolve(process.cwd(), ".local", "agent-master.key");
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedMasterKey: Buffer | null = null;

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export type ProviderConfigs = Record<string, ProviderConfig>;

/**
 * Load or lazily create the local AES-GCM master key. File mode is set to
 * 0600 so other shell users on the same machine can't read it. The path
 * lives outside the repo's tracked tree (.local/ is gitignored).
 */
function loadMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  try {
    cachedMasterKey = readFileSync(MASTER_KEY_PATH);
    if (cachedMasterKey.length !== KEY_BYTES) {
      throw new Error(
        `[Secrets] master key at ${MASTER_KEY_PATH} has wrong length`
      );
    }
    return cachedMasterKey;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  mkdirSync(dirname(MASTER_KEY_PATH), { recursive: true });
  const fresh = randomBytes(KEY_BYTES);
  writeFileSync(MASTER_KEY_PATH, fresh, { mode: 0o600 });
  try {
    chmodSync(MASTER_KEY_PATH, 0o600);
  } catch {
    // Best-effort chmod; some filesystems (e.g. exFAT) don't support it.
  }
  cachedMasterKey = fresh;
  return cachedMasterKey;
}

/** AES-256-GCM. Returns `${ivB64}:${tagB64}:${ctB64}`. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Inverse of encrypt. Throws on tampered / corrupt input. */
export function decrypt(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 3) {
    throw new Error("[Secrets] malformed ciphertext token");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, loadMasterKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf-8");
}

async function loadProviderConfigs(userId: number): Promise<ProviderConfigs> {
  const row = await getAgentSettings(userId);
  if (!row || !row.providerConfigs) return {};
  try {
    return JSON.parse(decrypt(row.providerConfigs)) as ProviderConfigs;
  } catch (error) {
    console.warn(
      "[Secrets] failed to decrypt providerConfigs; resetting to empty:",
      error
    );
    return {};
  }
}

async function saveProviderConfigs(
  userId: number,
  configs: ProviderConfigs
): Promise<void> {
  await upsertAgentSettings(userId, {
    providerConfigs: encrypt(JSON.stringify(configs)),
  });
}

export async function getProviderConfig(
  userId: number,
  providerId: string
): Promise<ProviderConfig | undefined> {
  const configs = await loadProviderConfigs(userId);
  return configs[providerId];
}

export async function setProviderConfig(
  userId: number,
  providerId: string,
  patch: { apiKey?: string; baseUrl?: string | null }
): Promise<void> {
  const configs = await loadProviderConfigs(userId);
  const existing = configs[providerId] ?? { apiKey: "" };
  const next: ProviderConfig = { ...existing };

  if (typeof patch.apiKey === "string" && patch.apiKey.length > 0) {
    next.apiKey = patch.apiKey;
  }
  if (patch.baseUrl === null || patch.baseUrl === "") {
    delete next.baseUrl;
  } else if (typeof patch.baseUrl === "string") {
    next.baseUrl = patch.baseUrl;
  }

  if (!next.apiKey) {
    delete configs[providerId];
  } else {
    configs[providerId] = next;
  }

  await saveProviderConfigs(userId, configs);
}

/**
 * Synchronous-look accessors used by the orchestrator. Reads the encrypted
 * settings for the anonymous user (single-tenant), falling back to env vars
 * for local dev. Returns undefined when neither is set.
 */
export async function getProviderApiKey(
  userId: number,
  providerId: string
): Promise<string | undefined> {
  const config = await getProviderConfig(userId, providerId);
  if (config?.apiKey) return config.apiKey;

  const envKey = ENV_KEY_BY_PROVIDER[providerId];
  if (!envKey) return undefined;
  const raw = process.env[envKey];
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

export async function getProviderBaseUrl(
  userId: number,
  providerId: string
): Promise<string | undefined> {
  const config = await getProviderConfig(userId, providerId);
  if (config?.baseUrl) return config.baseUrl;

  const envKey = ENV_BASE_URL_BY_PROVIDER[providerId];
  if (!envKey) return undefined;
  const raw = process.env[envKey];
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

const ENV_KEY_BY_PROVIDER: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
};

const ENV_BASE_URL_BY_PROVIDER: Record<string, string> = {
  deepseek: "DEEPSEEK_BASE_URL",
};
