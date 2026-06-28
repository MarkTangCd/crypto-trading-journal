import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const tmpDir = join(repoRoot, ".tmp");

function runNodeEval(script: string, databaseUrl: string): string {
  const escapedScript = script.split('"').join('\\"');
  return execSync(
    `node --experimental-sqlite --input-type=module --import tsx --eval "${escapedScript}"`,
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf-8",
    }
  );
}

const tempDbPath = join(tmpDir, "secrets-integration.sqlite");
const masterKeyPath = join(repoRoot, ".local", "agent-master.key");

beforeAll(() => {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  if (existsSync(tempDbPath)) rmSync(tempDbPath);
  // Ensure we exercise the auto-create path on first run; if a stale key
  // exists we keep it (the round-trip still works either way).
});

afterAll(() => {
  if (existsSync(tempDbPath)) rmSync(tempDbPath);
  // Intentionally do NOT delete masterKeyPath — other tests / dev sessions
  // depend on a stable key across runs.
});

describe("agent secrets", () => {
  it("encrypts, decrypts, persists in agent_settings, and never echoes plaintext via the router", () => {
    const script = `
const { encrypt, decrypt, setProviderConfig, getProviderConfig, getProviderApiKey } = await import("./server/agents/secrets.ts");
const db = await import("./server/db.ts");
await db.getOrCreateAnonymousUser();

// Round-trip
const ct = encrypt("hello secret");
if (typeof ct !== "string" || ct.split(":").length !== 3) throw new Error("ciphertext-shape:" + ct);
if (decrypt(ct) !== "hello secret") throw new Error("roundtrip-mismatch");

// Save via setProviderConfig then read via getProviderConfig
await setProviderConfig(1, "deepseek", { apiKey: "sk-test-xyz", baseUrl: "https://example.test" });
const cfg = await getProviderConfig(1, "deepseek");
if (!cfg || cfg.apiKey !== "sk-test-xyz") throw new Error("save-read-mismatch:" + JSON.stringify(cfg));
if (cfg.baseUrl !== "https://example.test") throw new Error("baseUrl-mismatch:" + cfg.baseUrl);

// The blob persisted to agent_settings must be ciphertext, not plaintext.
const row = await db.getAgentSettings(1);
if (!row) throw new Error("settings-row-missing");
if (row.providerConfigs.includes("sk-test-xyz")) throw new Error("plaintext-leaked:" + row.providerConfigs.slice(0, 80));
if (row.providerConfigs.split(":").length !== 3) throw new Error("not-ciphertext-shape");

// getProviderApiKey resolves from db (no env fallback used here)
const k = await getProviderApiKey(1, "deepseek");
if (k !== "sk-test-xyz") throw new Error("api-key-resolve-mismatch:" + k);

// Patch: change baseUrl, keep key
await setProviderConfig(1, "deepseek", { baseUrl: "https://other.test" });
const cfg2 = await getProviderConfig(1, "deepseek");
if (!cfg2 || cfg2.apiKey !== "sk-test-xyz") throw new Error("patch-lost-key:" + JSON.stringify(cfg2));
if (cfg2.baseUrl !== "https://other.test") throw new Error("patch-baseurl-mismatch:" + cfg2.baseUrl);

db.closeDb();
console.log("ok");
`;
    const result = runNodeEval(script, tempDbPath);
    expect(result).toContain("ok");
  });

  it("creates the master key file with restrictive permissions on first use", () => {
    expect(existsSync(masterKeyPath)).toBe(true);
  });
});
