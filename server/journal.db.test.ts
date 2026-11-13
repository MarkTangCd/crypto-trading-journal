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

// Each case gets a fresh migrated database; `db`, `check`, `doc(...)`,
// `trade(...)`, `seed(...)`, `image(...)` and `account` are in scope for the
// case body. User 1 is the anonymous user; user 2 stands in for a foreign
// owner. `seed` upserts trades and returns them keyed by tradeKey.
function runCase(name: string, body: string): string {
  const dbPath = join(tmpDir, `journal-db-${name}.sqlite`);
  if (existsSync(dbPath)) rmSync(dbPath);
  dbPaths.push(dbPath);

  const script = `
const db = await import("./server/db.ts");
await db.getOrCreateAnonymousUser();
const check = (cond, label, value) => {
  if (!cond) throw new Error(label + ":" + JSON.stringify(value));
};
const doc = text => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const trade = (tradeKey, over = {}) => ({
  tradeKey, exchange: "binance", exchangeSymbol: "BTCUSDT", symbol: "BTCUSDT",
  positionSide: "BOTH", side: "long", status: "closed",
  openTime: 1000, openTimeApprox: false, closeTime: 1500,
  entryPrice: "100", exitPrice: "110", quantity: "1", positionSizeUsdt: "100",
  feeUsd: "0.1", realizedPnlUsd: "9.9", stopLossPrice: null, takeProfitPrice: null,
  ...over,
});
const account = await db.createAccount({ userId: 1, name: "Main", apiKey: "key-ct", apiSecret: "secret-ct" });
const seed = async (records, accountId = account.id, userId = 1) => {
  await db.upsertTradesByTradeKey(accountId, userId, records, 1);
  const rows = await db.listTrades(accountId, userId);
  return Object.fromEntries(rows.map(row => [row.tradeKey, row]));
};
const image = (ownerKind, ownerId, sha256 = "aa", userId = 1) =>
  db.insertImage({ userId, ownerKind, ownerId, sha256, mime: "image/png", size: 1, bytes: Buffer.from([1]) });
const keys = rows => rows.map(row => row.tradeKey).join(",");
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

describe("journal db helpers (integration)", () => {
  it("creates an entry with its trade links and reads it back", () => {
    const output = runCase(
      "create",
      `
const t = await seed([trade("A", { openTime: 2000 }), trade("B", { openTime: 1000, side: "short" })]);
const created = await db.createJournalEntry(1, [t.A.id, t.B.id]);
const entry = await db.getJournalEntry(1, created.id);
check(entry.userId === 1 && entry.accountId === account.id && entry.symbol === "BTCUSDT", "account and symbol from trades", entry);
check(keys(entry.trades) === "B,A", "trades by openTime asc", entry.trades);
check(entry.reviewedAt === null && entry.emotion === null && entry.entryReason === null, "empty fields", entry);
check(entry.beforeImageIds.length === 0 && entry.afterImageIds.length === 0, "empty slots", entry);
check(entry.setups.length === 0, "no setups", entry.setups);
check((await db.getJournalEntryRow(1, created.id)).id === created.id, "row lookup", null);

check((await db.createJournalEntry(1, [9999])) === undefined, "no owned trade", null);
check((await db.createJournalEntry(2, [t.A.id])) === undefined, "foreign trades", null);
check((await db.getJournalEntry(2, created.id)) === undefined, "foreign get", null);
check((await db.getJournalEntryRow(2, created.id)) === undefined, "foreign row", null);
check((await db.getJournalEntry(1, 9999)) === undefined, "unknown get", null);

const summary = await db.getJournalEntryForTrade(1, t.A.id);
check(summary.id === created.id && summary.date === 1000 && summary.tradeCount === 2 && summary.state === "unreviewed", "forTrade", summary);
check((await db.getJournalEntryForTrade(2, t.A.id)) === undefined, "foreign forTrade", null);
check((await db.getJournalEntryForTrade(1, 9999)) === undefined, "unlinked forTrade", null);

const reviewed = await db.setJournalEntryReviewedAt(1, created.id, new Date(5000));
check(reviewed.reviewedAt.getTime() === 5000, "reviewedAt set", reviewed);
check((await db.getJournalEntryForTrade(1, t.B.id)).state === "reviewed", "reviewed state", null);
check((await db.setJournalEntryReviewedAt(1, created.id, null)).reviewedAt === null, "reopen", null);
check((await db.setJournalEntryReviewedAt(2, created.id, new Date())) === undefined, "foreign reviewedAt", null);
`
    );
    expect(output).toContain("ok");
  });

  it("links a trade to at most one entry", () => {
    const output = runCase(
      "trade-unique",
      `
const t = await seed([trade("A"), trade("B", { openTime: 2000 }), trade("C", { openTime: 3000 })]);
const first = await db.createJournalEntry(1, [t.A.id]);

let threw = false;
try {
  await db.createJournalEntry(1, [t.B.id, t.A.id]);
} catch {
  threw = true;
}
check(threw, "create with a linked trade throws", null);
check((await db.listJournalEntries(1)).length === 1, "create rolled back", null);
check(keys(await db.listPickableTrades(1, account.id)) === "C,B", "B still pickable", null);

threw = false;
try {
  await db.addJournalEntryTrade(1, first.id, t.A.id);
} catch {
  threw = true;
}
check(threw, "relinking a trade throws", null);

check((await db.addJournalEntryTrade(1, first.id, t.B.id)) === true, "add", null);
check(keys((await db.getJournalEntry(1, first.id)).trades) === "A,B", "added", null);
check((await db.addJournalEntryTrade(2, first.id, t.C.id)) === false, "foreign add", null);
check((await db.removeJournalEntryTrade(2, first.id, t.B.id)) === false, "foreign remove", null);
check((await db.removeJournalEntryTrade(1, first.id, t.B.id)) === true, "remove", null);
check((await db.removeJournalEntryTrade(1, first.id, t.B.id)) === false, "remove unlinked", null);
check(keys((await db.getJournalEntry(1, first.id)).trades) === "A", "removed", null);
`
    );
    expect(output).toContain("ok");
  });

  it("lists entries by earliest openTime desc with derived values and setup names", () => {
    const output = runCase(
      "list",
      `
const t = await seed([
  trade("A1", { openTime: 1000, side: "long", realizedPnlUsd: "10.5" }),
  trade("A2", { openTime: 3000, side: "short", status: "open", closeTime: null, exitPrice: null, realizedPnlUsd: "-2" }),
  trade("A3", { openTime: 2000, side: "long", realizedPnlUsd: "1.25" }),
  trade("B1", { openTime: 5000, realizedPnlUsd: "-3" }),
  trade("C1", { openTime: 4000, side: "short", realizedPnlUsd: "0" }),
]);
const a = await db.createJournalEntry(1, [t.A2.id, t.A1.id, t.A3.id]);
const b = await db.createJournalEntry(1, [t.B1.id]);
const c = await db.createJournalEntry(1, [t.C1.id]);
const breakout = await db.createSetup(1, "breakout");
const apex = await db.createSetup(1, "Apex");
check((await db.setJournalEntrySetups(1, a.id, [breakout.id, apex.id])) === true, "set setups", null);

const foreignAccount = await db.createAccount({ userId: 2, name: "Other", apiKey: "key-2", apiSecret: "secret-2" });
const f = await seed([trade("F1", { openTime: 9000 })], foreignAccount.id, 2);
const foreign = await db.createJournalEntry(2, [f.F1.id]);

const list = await db.listJournalEntries(1);
check(list.map(e => e.id).join(",") === [b.id, c.id, a.id].join(","), "order by date desc", list.map(e => [e.id, e.date]));
const la = list.find(e => e.id === a.id);
check(la.date === 1000, "date is min openTime", la.date);
check(la.sides.join("/") === "long/short", "distinct sides in openTime order", la.sides);
check(la.tradeCount === 3 && la.openTradeCount === 1, "trade counts", la);
check(la.netPnlUsd === 9.75, "net pnl includes open trades", la.netPnlUsd);
check(la.setupNames.join(",") === "Apex,breakout", "setup names by name", la.setupNames);
const lb = list.find(e => e.id === b.id);
check(lb.netPnlUsd === -3 && lb.openTradeCount === 0 && lb.setupNames.length === 0, "single trade", lb);
check(list.find(e => e.id === c.id).sides.join("/") === "short", "short only", null);

const detail = await db.getJournalEntry(1, a.id);
check(detail.setups.map(s => s.name).join(",") === "Apex,breakout", "detail setups by name", detail.setups);
check(Object.keys(detail.setups[0]).sort().join(",") === "id,name", "setup shape", detail.setups[0]);
check(detail.sides.join("/") === "long/short" && detail.netPnlUsd === 9.75, "detail derived", detail);

check((await db.setJournalEntrySetups(1, a.id, [apex.id])) === true, "replace setups", null);
check((await db.getJournalEntry(1, a.id)).setups.map(s => s.id).join(",") === String(apex.id), "replaced", null);
check((await db.setJournalEntrySetups(1, a.id, [])) === true, "clear setups", null);
check((await db.getJournalEntry(1, a.id)).setups.length === 0, "cleared", null);
check((await db.setJournalEntrySetups(2, a.id, [apex.id])) === false, "foreign set setups", null);

const theirs = await db.listJournalEntries(2);
check(theirs.length === 1 && theirs[0].id === foreign.id, "user scoping", theirs);
`
    );
    expect(output).toContain("ok");
  });

  it("computes actual R only for closed trades with distinct planned prices", () => {
    const output = runCase(
      "actual-r",
      `
const t = await seed([
  trade("X1", { openTime: 1000, side: "long", quantity: "2", realizedPnlUsd: "30" }),
  trade("X2", { openTime: 2000, side: "short", quantity: "1", realizedPnlUsd: "-6" }),
  trade("Y1", { openTime: 3000, status: "open", closeTime: null, exitPrice: null, realizedPnlUsd: "5" }),
]);
const mixed = await db.createJournalEntry(1, [t.X1.id, t.X2.id]);
const rOf = async id => (await db.getJournalEntry(1, id)).actualR;

check((await rOf(mixed.id)) === null, "no prices", null);
const updatedAt = await db.updateJournalEntry(1, mixed.id, { plannedEntry: "100" });
check(updatedAt instanceof Date, "update returns updatedAt", updatedAt);
check((await rOf(mixed.id)) === null, "stop missing", null);
await db.updateJournalEntry(1, mixed.id, { plannedStopLoss: "100" });
check((await rOf(mixed.id)) === null, "equal prices", null);
await db.updateJournalEntry(1, mixed.id, { plannedStopLoss: "96" });
check((await rOf(mixed.id)) === 2, "mixed sides: 24 / (4 x 3)", await rOf(mixed.id));
await db.updateJournalEntry(1, mixed.id, { plannedStopLoss: "104" });
check((await rOf(mixed.id)) === 2, "stop above entry uses the absolute risk", null);
await db.updateJournalEntry(1, mixed.id, { plannedEntry: null });
check((await rOf(mixed.id)) === null, "entry cleared", null);

const open = await db.createJournalEntry(1, [t.Y1.id]);
await db.updateJournalEntry(1, open.id, { plannedEntry: "100", plannedStopLoss: "90" });
check((await rOf(open.id)) === null, "open trade", null);

await db.updateJournalEntry(1, mixed.id, {
  plannedTakeProfit: "120",
  emotion: "fomo",
  entryReason: doc("why"),
  nextTime: doc("wait"),
});
const entry = await db.getJournalEntry(1, mixed.id);
check(entry.plannedTakeProfit === "120" && entry.emotion === "fomo", "structured fields", entry);
check(entry.entryReason.content[0].content[0].text === "why" && entry.nextTime.content[0].content[0].text === "wait", "rich text round-trip", entry);
check((await db.updateJournalEntry(2, mixed.id, { emotion: "fear" })) === undefined, "foreign update", null);
check((await db.getJournalEntry(1, mixed.id)).emotion === "fomo", "foreign update ignored", null);
`
    );
    expect(output).toContain("ok");
  });

  it("lists pickable trades: the account's unlinked trades, newest first", () => {
    const output = runCase(
      "pickable",
      `
const t = await seed([
  trade("A", { openTime: 1000 }),
  trade("B", { openTime: 2000, status: "open", closeTime: null, exitPrice: null }),
  trade("E", { openTime: 3000, symbol: "ETHUSDT", exchangeSymbol: "ETHUSDT" }),
]);
const alt = await db.createAccount({ userId: 1, name: "Alt", apiKey: "key-alt", apiSecret: "secret-alt" });
await seed([trade("Z", { openTime: 4000 })], alt.id);
const entry = await db.createJournalEntry(1, [t.A.id]);

check(keys(await db.listPickableTrades(1, account.id)) === "E,B", "unlinked, openTime desc, open included", null);
check(keys(await db.listPickableTrades(1, account.id, "BTCUSDT")) === "B", "symbol filter", null);
check(keys(await db.listPickableTrades(1, alt.id)) === "Z", "other account", null);
check((await db.listPickableTrades(2, account.id)).length === 0, "foreign account", null);

await db.deleteJournalEntry(1, entry.id);
check(keys(await db.listPickableTrades(1, account.id)) === "E,B,A", "pickable again after delete", null);
`
    );
    expect(output).toContain("ok");
  });

  it("adds and removes slot images in order, with no-ops", () => {
    const output = runCase(
      "slots",
      `
const t = await seed([trade("A")]);
const entry = await db.createJournalEntry(1, [t.A.id]);

check((await db.addSlotImage(1, entry.id, "before", 5)).join(",") === "5", "add first", null);
check((await db.addSlotImage(1, entry.id, "before", 7)).join(",") === "5,7", "append", null);
const stamp = (await db.getJournalEntryRow(1, entry.id)).updatedAt.getTime();
await new Promise(r => setTimeout(r, 5));
check((await db.addSlotImage(1, entry.id, "before", 5)).join(",") === "5,7", "add present is a no-op", null);
check((await db.removeSlotImage(1, entry.id, "before", 42)).join(",") === "5,7", "remove absent is a no-op", null);
check((await db.getJournalEntryRow(1, entry.id)).updatedAt.getTime() === stamp, "no-ops do not write", null);

check((await db.addSlotImage(1, entry.id, "after", 9)).join(",") === "9", "after slot", null);
check((await db.getJournalEntryRow(1, entry.id)).updatedAt.getTime() > stamp, "write bumps updatedAt", null);
check((await db.removeSlotImage(1, entry.id, "before", 5)).join(",") === "7", "remove", null);
const row = await db.getJournalEntryRow(1, entry.id);
check(row.beforeImageIds.join(",") === "7" && row.afterImageIds.join(",") === "9", "stored", row);

check((await db.addSlotImage(2, entry.id, "before", 1)) === undefined, "foreign add", null);
check((await db.removeSlotImage(2, entry.id, "before", 7)) === undefined, "foreign remove", null);
check((await db.getJournalEntryRow(1, entry.id)).beforeImageIds.join(",") === "7", "foreign writes ignored", null);
`
    );
    expect(output).toContain("ok");
  });

  it("deletes an entry with its images, setup links and trade links", () => {
    const output = runCase(
      "delete",
      `
const { DatabaseSync } = await import("node:sqlite");
const t = await seed([trade("A"), trade("B", { openTime: 2000 }), trade("K", { openTime: 3000 })]);
const entry = await db.createJournalEntry(1, [t.A.id, t.B.id]);
const kept = await db.createJournalEntry(1, [t.K.id]);
const setup = await db.createSetup(1, "breakout");
await db.setJournalEntrySetups(1, entry.id, [setup.id]);
await db.setJournalEntrySetups(1, kept.id, [setup.id]);
await image("journal_entry", entry.id);
const keptImage = await image("journal_entry", kept.id);
const planImage = await image("plan", entry.id);

check((await db.deleteJournalEntry(2, entry.id)) === false, "delete foreign", null);
check((await db.deleteJournalEntry(1, entry.id)) === true, "delete", null);
check((await db.deleteJournalEntry(1, entry.id)) === false, "delete twice", null);

const raw = new DatabaseSync(process.env.DATABASE_URL);
const n = (sql, ...args) => raw.prepare("select count(*) n from " + sql).get(...args).n;
check(n("journal_entries where id = ?", entry.id) === 0, "entry gone", null);
check(n("journal_entry_trades where entryId = ?", entry.id) === 0, "trade links gone", null);
check(n("journal_entry_setups where entryId = ?", entry.id) === 0, "setup links gone", null);
check(n("images where ownerKind = 'journal_entry' and ownerId = ?", entry.id) === 0, "images gone", null);
raw.close();

check((await db.getImage(1, keptImage.id)) !== undefined, "other entry's image kept", null);
check((await db.getImage(1, planImage.id)) !== undefined, "same id, other owner kind kept", null);
check(keys((await db.getJournalEntry(1, kept.id)).trades) === "K", "other entry kept", null);
check((await db.getSetup(1, setup.id)).usageCount === 1, "other setup link kept", null);
`
    );
    expect(output).toContain("ok");
  });

  it("stores setups with usage counts, a case-insensitive name index and image cascade", () => {
    const output = runCase(
      "setups",
      `
const t = await seed([trade("A"), trade("B", { openTime: 2000 })]);
const breakout = await db.createSetup(1, "breakout");
const apex = await db.createSetup(1, "Apex");
const cup = await db.createSetup(1, "cup");
await db.createSetup(2, "Breakout");
check(Array.isArray(cup.triggers) && cup.triggers.length === 0 && cup.description === null, "defaults", cup);

const e1 = await db.createJournalEntry(1, [t.A.id]);
const e2 = await db.createJournalEntry(1, [t.B.id]);
await db.setJournalEntrySetups(1, e1.id, [breakout.id, apex.id]);
await db.setJournalEntrySetups(1, e2.id, [breakout.id]);

const list = await db.listSetups(1);
check(list.map(s => s.name).join(",") === "Apex,breakout,cup", "by lower(name)", list);
check(list.map(s => s.usageCount).join(",") === "1,2,0", "usage counts", list);
check((await db.getSetup(1, breakout.id)).usageCount === 2, "get usage", null);
check((await db.getSetup(2, breakout.id)) === undefined, "foreign get", null);
check((await db.getSetupRow(1, cup.id)).name === "cup", "row lookup", null);
check((await db.getSetupRow(2, cup.id)) === undefined, "foreign row", null);
check((await db.listSetups(2)).map(s => s.name).join(",") === "Breakout", "user scoping", null);

check((await db.findSetupByName(1, "BreakOut")).id === breakout.id, "find case-insensitive", null);
check((await db.findSetupByName(1, "nope")) === undefined, "find unknown", null);
check((await db.findSetupByName(2, "apex")) === undefined, "find foreign", null);

let threw = false;
try {
  await db.createSetup(1, "BREAKOUT");
} catch {
  threw = true;
}
check(threw, "unique on lower(name) at create", null);
threw = false;
try {
  await db.updateSetup(1, apex.id, { name: "Breakout" });
} catch {
  threw = true;
}
check(threw, "unique on lower(name) at update", null);

const updated = await db.updateSetup(1, cup.id, {
  name: "Cup and handle",
  description: doc("shape"),
  triggers: ["higher low", "volume"],
});
check(updated.name === "Cup and handle" && updated.triggers.join("|") === "higher low|volume", "update", updated);
check(updated.description.content[0].content[0].text === "shape", "description round-trip", updated);
check(updated.updatedAt.getTime() >= cup.updatedAt.getTime(), "updatedAt", updated);
check((await db.updateSetup(2, cup.id, { name: "x" })) === undefined, "foreign update", null);

const setupImage = await image("setup", cup.id);
const otherImage = await image("setup", apex.id);
check((await db.deleteSetup(2, cup.id)) === false, "delete foreign", null);
check((await db.deleteSetup(1, cup.id)) === true, "delete", null);
check((await db.deleteSetup(1, cup.id)) === false, "delete twice", null);
check((await db.getSetupRow(1, cup.id)) === undefined, "setup gone", null);
check((await db.getImage(1, setupImage.id)) === undefined, "images cascaded", null);
check((await db.getImage(1, otherImage.id)) !== undefined, "other setup's image kept", null);
`
    );
    expect(output).toContain("ok");
  });
});
