import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
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

const tempDbPath = join(tmpDir, "review-agent-db.sqlite");

beforeAll(() => {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  if (existsSync(tempDbPath)) {
    rmSync(tempDbPath);
  }
});

afterAll(() => {
  if (existsSync(tempDbPath)) {
    rmSync(tempDbPath);
  }
});

describe("review agent db helpers (integration)", () => {
  it("exercises getOrCreateConversation, appendMessage, listMessages, agent settings", () => {
    const script = `
const db = await import("./server/db.ts");
await db.getOrCreateAnonymousUser();

const first = await db.getOrCreateConversation({
  userId: 1, transactionId: 42, providerId: "deepseek", model: "deepseek-chat",
});
const second = await db.getOrCreateConversation({
  userId: 1, transactionId: 42, providerId: "deepseek", model: "deepseek-chat",
});
if (first.id !== second.id) throw new Error("convo-not-idempotent");

const other = await db.getOrCreateConversation({
  userId: 1, transactionId: 43, providerId: "deepseek", model: "deepseek-chat",
});
if (other.id === first.id) throw new Error("convo-not-scoped-by-tx");

await db.appendMessage({ conversationId: first.id, role: "system", content: JSON.stringify({ text: "boot" }) });
await db.appendMessage({ conversationId: first.id, role: "user", content: JSON.stringify({ text: "review" }) });
await db.appendMessage({ conversationId: first.id, role: "assistant", content: JSON.stringify({ text: "ok" }) });

const own = await db.listMessages({ conversationId: first.id, userId: 1 });
const roles = own.map(m => m.role).join(",");
if (roles !== "system,user,assistant") throw new Error("bad-order:" + roles);

const stranger = await db.listMessages({ conversationId: first.id, userId: 999 });
if (stranger.length !== 0) throw new Error("user-scope-leak");

if ((await db.getAgentSettings(1)) !== undefined) throw new Error("settings-should-be-empty");

const saved = await db.upsertAgentSettings(1, { providerConfigs: "cipher-v1" });
if (saved.providerConfigs !== "cipher-v1") throw new Error("settings-not-saved");
if (saved.defaultProvider !== "deepseek") throw new Error("settings-default-missing");

const patched = await db.upsertAgentSettings(1, { enabledSkillIds: ["skill-a"] });
if (patched.providerConfigs !== "cipher-v1") throw new Error("settings-patch-overwrote-existing");
if (JSON.stringify(patched.enabledSkillIds) !== '["skill-a"]') throw new Error("settings-skills-bad:" + JSON.stringify(patched.enabledSkillIds));

db.closeDb();
console.log("ok");
`;

    const result = runNodeEval(script, tempDbPath);
    expect(result).toContain("ok");
  });
});
