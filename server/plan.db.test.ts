import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const tmpDir = join(repoRoot, ".tmp");
const dbPaths: string[] = [];

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

// Each case gets a fresh migrated database; `db`, `check`, `doc(...)` and
// `scenario(...)` are in scope for the case body. User 1 is the anonymous
// user; user 2 stands in for a foreign owner.
function runCase(name: string, body: string): string {
  const dbPath = join(tmpDir, `plan-db-${name}.sqlite`);
  if (existsSync(dbPath)) rmSync(dbPath);
  dbPaths.push(dbPath);

  const script = `
const db = await import("./server/db.ts");
await db.getOrCreateAnonymousUser();
const check = (cond, label, value) => {
  if (!cond) throw new Error(label + ":" + JSON.stringify(value));
};
const doc = text => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const scenario = (name, over = {}) => ({ name, side: "long", primaryTimeFrame: "1H", ...over });
${body}
db.closeDb();
console.log("ok");
`;
  return runNodeEval(script, dbPath);
}

beforeAll(() => {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  for (const dbPath of dbPaths) {
    if (existsSync(dbPath)) rmSync(dbPath);
  }
});

describe("plan db helpers (integration)", () => {
  it("lists open plans newest first, then closed by closedAt, with derived counts", () => {
    const output = runCase(
      "list",
      `
const a = await db.createPlan(1, "BTCUSDT");
const b = await db.createPlan(1, "ETHUSDT");
const c = await db.createPlan(1, "SOLUSDT");
const d = await db.createPlan(1, "BTCUSDT");
await db.createPlan(2, "XRPUSDT");

const sa = await db.addScenario(1, a.id, scenario("breakout"));
const sa2 = await db.addScenario(1, a.id, scenario("fade", { side: "short" }));
await db.addObservation(1, a.id, doc("first"));
await db.addObservation(1, a.id, doc("second"));
await db.addObservation(1, b.id, doc("only"));

await db.closePlan(1, a.id, [
  { scenarioId: sa.id, outcome: "triggered" },
  { scenarioId: sa2.id, outcome: "invalidated" },
]);
await new Promise(r => setTimeout(r, 5));
await db.closePlan(1, c.id, []);

const list = await db.listPlans(1);
check(list.length === 4, "user scoped", list.map(p => p.symbol));
check(JSON.stringify(list.map(p => p.id)) === JSON.stringify([d.id, b.id, c.id, a.id]), "order", list.map(p => p.id));
const la = list.find(p => p.id === a.id);
check(la.scenarioCount === 2 && la.observationCount === 2, "counts a", la);
check(JSON.stringify(la.outcomes) === JSON.stringify(["triggered", "invalidated"]), "outcomes a", la.outcomes);
const lb = list.find(p => p.id === b.id);
check(lb.scenarioCount === 0 && lb.observationCount === 1 && lb.outcomes.length === 0, "counts b", lb);
check(lb.closedAt === null, "b open", lb.closedAt);
check((await db.listPlans(3)).length === 0, "empty list", null);
`
    );
    expect(output).toContain("ok");
  });

  it("returns a plan with ordered children and keeps child writes inside their plan", () => {
    const output = runCase(
      "detail",
      `
const p = await db.createPlan(1, "BTCUSDT");
const other = await db.createPlan(1, "ETHUSDT");
const foreign = await db.createPlan(2, "SOLUSDT");
const s1 = await db.addScenario(1, p.id, scenario("a"));
const s2 = await db.addScenario(1, p.id, scenario("b", { primaryTimeFrame: "12H" }));
check(s1.content === null && s1.outcome === null, "scenario defaults", s1);
const o1 = await db.addObservation(1, p.id, doc("one"));
const o2 = await db.addObservation(1, p.id, doc("two"));

const detail = await db.getPlan(1, p.id);
check(JSON.stringify(detail.scenarios.map(s => s.id)) === JSON.stringify([s1.id, s2.id]), "scenario order", detail.scenarios);
check(JSON.stringify(detail.observations.map(o => o.id)) === JSON.stringify([o1.id, o2.id]), "observation order", detail.observations);
check(detail.observations[0].content.content[0].content[0].text === "one", "json content", detail.observations[0].content);
check((await db.getPlan(1, foreign.id)) === undefined, "foreign plan hidden", null);
check((await db.getPlan(1, 9999)) === undefined, "unknown plan", null);

const updated = await db.updatePlan(1, p.id, { symbol: "BTCUSDC", marketContext: doc("ctx") });
check(updated.symbol === "BTCUSDC" && updated.marketContext.type === "doc", "updatePlan", updated);
check((await db.updatePlan(1, foreign.id, { symbol: "X" })) === undefined, "updatePlan foreign", null);
const cleared = await db.updatePlan(1, p.id, { marketContext: null });
check(cleared.marketContext === null, "marketContext cleared", cleared);

const s1u = await db.updateScenario(1, p.id, s1.id, { name: "renamed", content: doc("body") });
check(s1u.name === "renamed" && s1u.content.type === "doc", "updateScenario", s1u);
check((await db.updateScenario(1, other.id, s1.id, { name: "x" })) === undefined, "scenario wrong plan", null);
check((await db.updateScenario(1, foreign.id, s1.id, { name: "x" })) === undefined, "scenario foreign plan", null);
check((await db.addScenario(1, foreign.id, scenario("x"))) === undefined, "addScenario foreign", null);
check((await db.deleteScenario(1, other.id, s2.id)) === false, "delete scenario wrong plan", null);
check((await db.deleteScenario(1, p.id, s2.id)) === true, "delete scenario", null);
check((await db.deleteScenario(1, p.id, s2.id)) === false, "delete scenario twice", null);

const before = (await db.getPlan(1, p.id)).observations[0].createdAt.getTime();
await new Promise(r => setTimeout(r, 5));
const o1u = await db.updateObservation(1, p.id, o1.id, doc("edited"));
check(o1u.createdAt.getTime() === before, "createdAt unchanged", o1u);
check(o1u.updatedAt.getTime() >= before, "updatedAt bumped", o1u);
check((await db.updateObservation(1, other.id, o1.id, doc("x"))) === undefined, "observation wrong plan", null);
check((await db.addObservation(1, foreign.id, doc("x"))) === undefined, "addObservation foreign", null);
check((await db.deleteObservation(1, other.id, o2.id)) === false, "delete observation wrong plan", null);
check((await db.deleteObservation(1, p.id, o2.id)) === true, "delete observation", null);

const final = await db.getPlan(1, p.id);
check(final.scenarios.length === 1 && final.observations.length === 1, "final children", final);
check(final.observations[0].content.content[0].content[0].text === "edited", "edited content", final.observations[0]);
`
    );
    expect(output).toContain("ok");
  });

  it("closes atomically and reopen keeps stored outcomes", () => {
    const output = runCase(
      "close",
      `
const p = await db.createPlan(1, "BTCUSDT");
const s1 = await db.addScenario(1, p.id, scenario("a"));
const s2 = await db.addScenario(1, p.id, scenario("b"));

const closed = await db.closePlan(1, p.id, [
  { scenarioId: s1.id, outcome: "triggered" },
  { scenarioId: s2.id, outcome: "invalidated" },
]);
check(closed.closedAt instanceof Date, "closedAt set", closed);
let detail = await db.getPlan(1, p.id);
check(detail.scenarios[0].outcome === "triggered" && detail.scenarios[1].outcome === "invalidated", "outcomes written", detail.scenarios);

const reopened = await db.reopenPlan(1, p.id);
check(reopened.closedAt === null, "reopened", reopened);
detail = await db.getPlan(1, p.id);
check(detail.scenarios[0].outcome === "triggered" && detail.scenarios[1].outcome === "invalidated", "outcomes kept", detail.scenarios);

check((await db.closePlan(2, p.id, [])) === undefined, "close foreign", null);
check((await db.reopenPlan(2, p.id)) === undefined, "reopen foreign", null);

// A failing verdict write rolls the whole close back.
let threw = false;
try {
  await db.closePlan(1, p.id, [
    { scenarioId: s1.id, outcome: "invalidated" },
    { scenarioId: s2.id, outcome: "missed" },
  ]);
} catch {
  threw = true;
}
check(threw, "check constraint throws", null);
detail = await db.getPlan(1, p.id);
check(detail.closedAt === null, "closedAt rolled back", detail.closedAt);
check(detail.scenarios[0].outcome === "triggered", "outcome rolled back", detail.scenarios[0]);
`
    );
    expect(output).toContain("ok");
  });

  it("deletes a plan with its scenarios, observations and images", () => {
    const output = runCase(
      "delete",
      `
const { DatabaseSync } = await import("node:sqlite");
const p = await db.createPlan(1, "BTCUSDT");
const keep = await db.createPlan(1, "ETHUSDT");
await db.addScenario(1, p.id, scenario("a"));
await db.addObservation(1, p.id, doc("x"));
await db.insertImage({ userId: 1, ownerKind: "plan", ownerId: p.id, sha256: "aa", mime: "image/png", size: 1, bytes: Buffer.from([1]) });
await db.addScenario(1, keep.id, scenario("kept"));
const kept = await db.insertImage({ userId: 1, ownerKind: "plan", ownerId: keep.id, sha256: "aa", mime: "image/png", size: 1, bytes: Buffer.from([1]) });

check((await db.deletePlan(2, p.id)) === false, "delete foreign", null);
check((await db.deletePlan(1, p.id)) === true, "delete", null);
check((await db.deletePlan(1, p.id)) === false, "delete twice", null);

const raw = new DatabaseSync(process.env.DATABASE_URL);
const n = table => raw.prepare("select count(*) n from " + table + " where planId = ?").get(p.id).n;
const images = raw.prepare("select count(*) n from images where ownerKind = 'plan' and ownerId = ?").get(p.id).n;
check(n("plan_scenarios") === 0 && n("plan_observations") === 0 && images === 0, "cascaded", null);
check((await db.getPlan(1, keep.id)).scenarios.length === 1, "other plan kept", null);
check((await db.getImage(1, kept.id)) !== undefined, "other image kept", null);
raw.close();
`
    );
    expect(output).toContain("ok");
  });

  it("stores images per plan with dedupe, owner-only reads and exact bytes", () => {
    const output = runCase(
      "images",
      `
const p = await db.createPlan(1, "BTCUSDT");
const q = await db.createPlan(1, "ETHUSDT");
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 7]);
const img = { userId: 1, ownerKind: "plan", ownerId: p.id, sha256: "abc", mime: "image/png", size: bytes.length, bytes };

check((await db.findImageBySha(1, "plan", p.id, "abc")) === undefined, "no image yet", null);
const { id } = await db.insertImage(img);
const found = await db.findImageBySha(1, "plan", p.id, "abc");
check(found.id === id && Object.keys(found).length === 1, "found by sha, metadata only", found);
check((await db.findImageBySha(1, "plan", q.id, "abc")) === undefined, "sha scoped by plan", null);
check((await db.findImageBySha(1, "setup", p.id, "abc")) === undefined, "sha scoped by owner kind", null);
check((await db.findImageBySha(2, "plan", p.id, "abc")) === undefined, "sha scoped by user", null);

let dup = false;
try {
  await db.insertImage(img);
} catch {
  dup = true;
}
check(dup, "unique (ownerKind, ownerId, sha256)", null);
const other = await db.insertImage({ ...img, ownerId: q.id });
check(other.id !== id, "same bytes in another plan", other);
const crossKind = await db.insertImage({ ...img, ownerKind: "journal_entry" });
check(crossKind.id !== id && crossKind.id !== other.id, "same bytes, same id, another owner kind", crossKind);
check((await db.findImageBySha(1, "journal_entry", p.id, "abc")).id === crossKind.id, "found under its own kind", null);

const got = await db.getImage(1, id);
check(got.mime === "image/png" && got.sha256 === "abc", "metadata", got);
check(Buffer.isBuffer(got.bytes) && Buffer.compare(got.bytes, bytes) === 0, "bytes round-trip", [...got.bytes]);
check((await db.getImage(2, id)) === undefined, "foreign image hidden", null);
check((await db.getImage(1, 9999)) === undefined, "unknown image", null);
`
    );
    expect(output).toContain("ok");
  });

  it("lists distinct trade symbols for the user, sorted", () => {
    const output = runCase(
      "symbols",
      `
check((await db.listTradeSymbols(1)).length === 0, "no trades", null);
const account = await db.createAccount({ userId: 1, name: "Main", apiKey: "k", apiSecret: "s" });
const trade = (tradeKey, symbol) => ({
  tradeKey, exchange: "binance", exchangeSymbol: symbol, symbol,
  positionSide: "BOTH", side: "long", status: "open",
  openTime: 1000, openTimeApprox: false, closeTime: null,
  entryPrice: "100", exitPrice: null, quantity: "1", positionSizeUsdt: "100",
  feeUsd: "0", realizedPnlUsd: "0", stopLossPrice: null, takeProfitPrice: null,
});
await db.upsertTradesByTradeKey(account.id, 1, [
  trade("ETHUSDT|BOTH#1", "ETHUSDT"),
  trade("BTCUSDT|BOTH#2", "BTCUSDT"),
  trade("ETHUSDT|BOTH#3", "ETHUSDT"),
], 2000);
const symbols = await db.listTradeSymbols(1);
check(JSON.stringify(symbols) === JSON.stringify(["BTCUSDT", "ETHUSDT"]), "symbols", symbols);
check((await db.listTradeSymbols(2)).length === 0, "user scoped", null);
`
    );
    expect(output).toContain("ok");
  });
});
