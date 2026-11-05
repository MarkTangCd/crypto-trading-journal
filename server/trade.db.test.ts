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

// Each case gets a fresh migrated database; `db`, `check` and `trade(...)`
// are in scope for the case body.
function runCase(name: string, body: string): string {
  const dbPath = join(tmpDir, `trade-db-${name}.sqlite`);
  if (existsSync(dbPath)) rmSync(dbPath);
  dbPaths.push(dbPath);

  const script = `
const db = await import("./server/db.ts");
await db.getOrCreateAnonymousUser();
const check = (cond, label, value) => {
  if (!cond) throw new Error(label + ":" + JSON.stringify(value));
};
const trade = (tradeKey, over = {}) => ({
  tradeKey, exchange: "binance", exchangeSymbol: "BTCUSDT", symbol: "BTCUSDT",
  positionSide: "BOTH", side: "long", status: "open",
  openTime: 1000, openTimeApprox: false, closeTime: null,
  entryPrice: "100", exitPrice: null, quantity: "1", positionSizeUsdt: "100",
  feeUsd: "0.1", realizedPnlUsd: "-0.1", stopLossPrice: null, takeProfitPrice: null,
  ...over,
});
const account = await db.createAccount({ userId: 1, name: "Main", apiKey: "key-ct", apiSecret: "secret-ct" });
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

describe("trade db helpers (integration)", () => {
  it("inserts fills idempotently and reports per-symbol cursors", () => {
    const output = runCase(
      "fills",
      `
const fill = (fillId, symbol, time) => ({
  userId: 1, accountId: account.id, source: "exchange", fillId, orderId: "o" + fillId,
  symbol, positionSide: "BOTH", side: "BUY", price: "100", qty: "1",
  realizedPnl: "0", commission: "0.1", commissionAsset: "USDT", feeUsd: "0.1", time,
});
await db.insertFills([fill("1", "BTCUSDT", 100), fill("2", "BTCUSDT", 300), fill("1", "ETHUSDT", 200)]);
await db.insertFills([fill("2", "BTCUSDT", 300), fill("3", "BTCUSDT", 400)]);
await db.insertFills([]);

const stored = await db.listFillsByAccount(account.id, 1);
check(stored.map(f => f.fillId).join(",") === "1,1,2,3", "fills-order", stored);
check((await db.listFillsByAccount(account.id, 2)).length === 0, "fills-user-scope");

const cursors = await db.getFillCursors(account.id);
check(cursors.get("BTCUSDT") === 400 && cursors.get("ETHUSDT") === 200, "cursors", [...cursors]);
`
    );
    expect(output).toContain("ok");
  });

  it("merges rebuilt trades by tradeKey per the rebuild merge rules", () => {
    const output = runCase(
      "merge",
      `
await db.upsertTradesByTradeKey(account.id, 1, [
  trade("A", { openTime: 1000, openTimeApprox: true, stopLossPrice: "90" }),
  trade("B", { status: "closed", closeTime: 1500, exitPrice: "110" }),
], 5000);
const [a1] = await db.listTrades(account.id, 1, "open");
const [b1] = await db.listTrades(account.id, 1, "closed");
check(a1.syncedAt === 5000 && a1.stopLossPrice === "90", "insert", a1);
await db.updateTradeByHand(b1.id, 1, { stopLossPrice: "80" });

await db.upsertTradesByTradeKey(account.id, 1, [
  trade("A", { openTime: 2000, openTimeApprox: false, stopLossPrice: "95", quantity: "2" }),
  trade("B", { status: "closed", closeTime: 1500, exitPrice: "111" }),
], 6000);
const a2 = await db.getTradeById(a1.id, 1);
const b2 = await db.getTradeById(b1.id, 1);
check(a2.openTime === 1000 && a2.openTimeApprox === true, "openTime-frozen", a2);
check(a2.stopLossPrice === "95" && a2.quantity === "2" && a2.syncedAt === 6000, "open-overwritten", a2);
check(b2.stopLossPrice === "80" && b2.exitPrice === "111", "closed-sltp-frozen", b2);

// Open -> closed keeps the last live SL; a key missing from records stays.
await db.upsertTradesByTradeKey(account.id, 1, [
  trade("A", { status: "closed", closeTime: 3000, exitPrice: "120" }),
], 7000);
const a3 = await db.getTradeById(a1.id, 1);
check(a3.status === "closed" && a3.stopLossPrice === "95", "frozen-at-close", a3);
check((await db.getTradeById(b1.id, 1)) !== undefined, "missing-key-kept");
check((await db.listTrades(account.id, 1)).length === 2, "no-reinsert");
`
    );
    expect(output).toContain("ok");
  });

  it("lists trades open first and enforces hand-edit rules", () => {
    const output = runCase(
      "edit",
      `
await db.upsertTradesByTradeKey(account.id, 1, [
  trade("C1", { status: "closed", openTime: 3000, closeTime: 3500 }),
  trade("O1", { openTime: 1000, exchangeSymbol: "ETHUSDT" }),
  trade("O2", { openTime: 2000, openTimeApprox: true }),
], 5000);
const listed = await db.listTrades(account.id, 1);
check(listed.map(t => t.tradeKey).join(",") === "O2,O1,C1", "list-order", listed.map(t => t.tradeKey));
check((await db.listTrades(account.id, 2)).length === 0, "list-user-scope");
check((await db.listOpenTradeSymbols(account.id)).sort().join(",") === "BTCUSDT,ETHUSDT", "open-symbols");

const [o2, o1, c1] = listed;
const rejects = async (fn, label) => {
  try { await fn(); } catch (error) {
    check(error instanceof db.TradeEditError, label + "-type", String(error));
    return;
  }
  throw new Error(label + "-did-not-throw");
};
await rejects(() => db.updateTradeByHand(o1.id, 1, { stopLossPrice: "90" }), "sl-on-open");
await rejects(() => db.updateTradeByHand(o1.id, 1, { openTime: 500 }), "openTime-not-approx");

const edited = await db.updateTradeByHand(o2.id, 1, { openTime: 1500 });
check(edited.openTime === 1500 && edited.openTimeApprox === false, "openTime-edit", edited);
await rejects(() => db.updateTradeByHand(o2.id, 1, { openTime: 1600 }), "openTime-twice");

const levels = await db.updateTradeByHand(c1.id, 1, { stopLossPrice: "90", takeProfitPrice: null });
check(levels.stopLossPrice === "90" && levels.takeProfitPrice === null, "closed-levels", levels);
check((await db.updateTradeByHand(c1.id, 2, { stopLossPrice: "1" })) === undefined, "edit-user-scope");
`
    );
    expect(output).toContain("ok");
  });

  it("derives stats from trades and writes sync state", () => {
    const output = runCase(
      "stats",
      `
const empty = await db.getTradeStats(account.id, 1);
check(empty.winRate === null && empty.profitFactor === null && empty.exposureRatio === null, "empty", empty);

await db.upsertTradesByTradeKey(account.id, 1, [
  trade("BE", { status: "closed", closeTime: 100, realizedPnlUsd: "0", feeUsd: "1" }),
  trade("W", { status: "closed", closeTime: 200, realizedPnlUsd: "10", feeUsd: "1" }),
  trade("L1", { status: "closed", closeTime: 300, realizedPnlUsd: "-5", feeUsd: "1" }),
  trade("L2", { status: "closed", closeTime: 400, realizedPnlUsd: "-3", feeUsd: "1" }),
  trade("O", { positionSizeUsdt: "1000", realizedPnlUsd: "2.5", feeUsd: "0.5" }),
], 5000);

await db.writeSyncAttempt(account.id, 900);
await db.writeSyncFailure(account.id, "rate_limited", 1900);
let row = await db.getAccountById(account.id, 1);
check(row.lastSyncAttemptAt === 900 && row.lastSyncErrorCode === "rate_limited" && row.lastSyncRetryAt === 1900, "failure", row);

await db.writeSyncSuccess(account.id, { balanceUsdt: "2000", unrealizedPnlUsdt: "-1.5", backfillStart: 10, incomeCursorAt: 800, at: 1000 });
await db.writeSyncSuccess(account.id, { balanceUsdt: "2000", unrealizedPnlUsdt: "-1.5", incomeCursorAt: 850, at: 1100 });
row = await db.getAccountById(account.id, 1);
check(row.lastSyncErrorCode === null && row.lastSyncRetryAt === null, "success-clears", row);
check(row.backfillStart === 10 && row.incomeCursorAt === 850 && row.lastSyncedAt === 1100 && row.keyVerifiedAt === 1100, "success-fields", row);

const stats = await db.getTradeStats(account.id, 1);
const expected = {
  closedCount: 4, winCount: 1, lossCount: 2, breakevenCount: 1,
  winRate: "0.25", profitFactor: "1.25", expectancyUsd: "0.5", losingStreak: 2,
  realizedPnlUsd: "4.5", feeUsd: "4.5", openCount: 1,
  openExposureUsdt: "1000", exposureRatio: "0.5",
};
check(JSON.stringify(stats) === JSON.stringify(expected), "stats", stats);
`
    );
    expect(output).toContain("ok");
  });

  it("cascades account deletion and hides key ciphertexts", () => {
    const output = runCase(
      "cascade",
      `
const { encrypt } = await import("./server/agents/secrets.ts");
const { conversations, messages } = await import("./drizzle/schema.ts");
const handle = await db.getDb();
const other = await db.createAccount({ userId: 1, name: "Other", apiKey: encrypt("k"), apiSecret: encrypt("s") });

const pub = db.toPublicAccount(await db.updateAccount(account.id, 1, { apiKey: encrypt("abcdWXYZ1234"), apiSecret: encrypt("s") }));
check(pub.apiKeyTail === "1234" && !("apiKey" in pub) && !("apiSecret" in pub), "public", pub);

for (const acc of [account, other]) {
  await db.insertFills([{ userId: 1, accountId: acc.id, source: "seed", fillId: "seed@1", orderId: null,
    symbol: "BTCUSDT", positionSide: "BOTH", side: "BUY", price: "1", qty: "1", realizedPnl: "0",
    commission: "0", commissionAsset: "USDT", feeUsd: "0", time: 1 }]);
  await db.upsertTradesByTradeKey(acc.id, 1, [trade("K")], 5000);
  const [t] = await db.listTrades(acc.id, 1);
  const [c] = await handle.insert(conversations).values({ userId: 1, tradeId: t.id, providerId: "p", model: "m" }).returning();
  await db.appendMessage({ conversationId: c.id, role: "user", content: "{}" });
}
const preTradeConvo = await db.getOrCreateConversationForPreTrade({ userId: 1, preTradeId: 7, providerId: "p", model: "m" });

await db.deleteAccountCascade(account.id, 1);

check((await db.getAccountById(account.id, 1)) === undefined, "account-gone");
check((await db.listTrades(account.id, 1)).length === 0, "trades-gone");
check((await db.listFillsByAccount(account.id, 1)).length === 0, "fills-gone");
const convos = await handle.select().from(conversations);
check(convos.length === 2 && convos.some(c => c.id === preTradeConvo.id), "conversations", convos);
check((await handle.select().from(messages)).length === 1, "messages");
check((await db.listTrades(other.id, 1)).length === 1 && (await db.listFillsByAccount(other.id, 1)).length === 1, "other-account-kept");
`
    );
    expect(output).toContain("ok");
  });
});
