import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
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

// Each case gets a fresh migrated database with one linked account. In scope
// for the body: db, runSync, autoSync, createFakeAdapter, check, rejects,
// fill(...), keyed(...), now, H, D, account.
function runCase(name: string, body: string): string {
  const dbPath = join(tmpDir, `sync-${name}.sqlite`);
  if (existsSync(dbPath)) rmSync(dbPath);
  dbPaths.push(dbPath);

  const script = `
const db = await import("./server/db.ts");
const { runSync, autoSync } = await import("./server/exchange/sync.ts");
const { createFakeAdapter } = await import("./server/exchange/testing/fakeAdapter.ts");
const { encrypt } = await import("./server/agents/secrets.ts");
await db.getOrCreateAnonymousUser();
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const check = (cond, label, value) => {
  if (!cond) throw new Error(label + ":" + JSON.stringify(value));
};
const rejects = async (promise, label) => {
  try { await promise; } catch (error) { return error; }
  throw new Error(label + "-did-not-throw");
};
const H = 3600000;
const D = 24 * H;
const now = Date.now();
const fill = (fillId, symbol, side, price, qty, time, over = {}) => ({
  fillId, orderId: "o" + fillId, symbol, positionSide: "BOTH", side, price, qty,
  realizedPnl: "0", commission: "0.01", commissionAsset: "USDT", feeUsd: "0.01", time, ...over,
});
const keyed = name => ({ userId: 1, name, apiKey: encrypt("key-" + name), apiSecret: encrypt("secret-" + name) });
const account = await db.createAccount(keyed("main"));
${body}
db.closeDb();
process.stdout.write("ok");
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

describe("runSync / autoSync (integration, fake adapter)", () => {
  it("backfills 30 days, persists seeds and writes the snapshot", () => {
    const output = runCase(
      "backfill",
      `
const { adapter, calls } = createFakeAdapter({
  fills: {
    BTCUSDT: [
      fill("1", "BTCUSDT", "BUY", "100", "1", now - 5 * D),
      fill("2", "BTCUSDT", "SELL", "110", "1", now - 4 * D, { realizedPnl: "10" }),
      fill("0", "BTCUSDT", "BUY", "90", "1", now - 40 * D),
    ],
  },
  positions: [
    { symbol: "ETHUSDT", positionSide: "BOTH", positionAmt: "2", entryPrice: "50", notional: "100", updateTime: now - 40 * D },
    // Moved after the fill window: its fills are refetched up to now.
    { symbol: "SOLUSDT", positionSide: "BOTH", positionAmt: "0", entryPrice: "0", notional: "0", updateTime: now + 60000 },
  ],
  conditionalOrders: { ETHUSDT: [{ symbol: "ETHUSDT", positionSide: "BOTH", side: "SELL", kind: "stop", triggerPrice: "45", closePosition: true, quantity: "0" }] },
  balance: { balanceUsdt: "1000", unrealizedPnlUsdt: "5", updateTime: now },
});
await runSync(account.id, 1, { reason: "manual", adapter });

const verify = calls.find(c => c.method === "verifyKey");
check(verify.args[0].apiKey === "key-main" && verify.args[0].apiSecret === "secret-main", "decrypted-credentials", verify.args);

const solFetch = calls.find(c => c.method === "fetchFills" && c.args[1] === "SOLUSDT");
check(solFetch && solFetch.args[3] >= now, "position-refetch", calls.map(c => c.args.slice(1)));

const row = await db.getAccountById(account.id, 1);
const windowStart = row.backfillStart;
check(windowStart >= now - 30 * D && windowStart < now - 30 * D + 60000, "backfillStart", row);
check(row.balanceUsdt === "1000" && row.unrealizedPnlUsdt === "5" && row.lastSyncErrorCode === null, "snapshot", row);
check(row.incomeCursorAt === now - 4 * D && row.lastSyncedAt >= now && row.keyVerifiedAt === row.lastSyncedAt, "cursors", row);

const fills = await db.listFillsByAccount(account.id, 1);
check(fills.map(f => f.fillId).join(",") === "seed@" + windowStart + ",1,2", "fills", fills);
check(fills[0].source === "seed" && fills[0].symbol === "ETHUSDT" && fills[0].price === "50", "seed-row", fills[0]);

const trades = await db.listTrades(account.id, 1);
const eth = trades.find(t => t.symbol === "ETHUSDT");
const btc = trades.find(t => t.symbol === "BTCUSDT");
check(eth.status === "open" && eth.openTimeApprox === true && eth.openTime === windowStart && eth.stopLossPrice === "45", "seeded-trade", eth);
check(btc.status === "closed" && btc.realizedPnlUsd === "9.98", "closed-trade", btc);
`
    );
    expect(output).toBe("ok");
  });

  it("syncs incrementally from cursors minus one hour and refetches open symbols", () => {
    const output = runCase(
      "incremental",
      `
const btcOpen = fill("1", "BTCUSDT", "BUY", "100", "1", now - 2 * D);
const ethRound = [
  fill("10", "ETHUSDT", "BUY", "50", "1", now - 1 * D - H),
  fill("11", "ETHUSDT", "SELL", "60", "1", now - 1 * D, { realizedPnl: "10" }),
];
const btcPosition = { symbol: "BTCUSDT", positionSide: "BOTH", positionAmt: "1", entryPrice: "100", notional: "100", updateTime: now - 2 * D };
const stopAt = triggerPrice => ({ BTCUSDT: [{ symbol: "BTCUSDT", positionSide: "BOTH", side: "SELL", kind: "stop", triggerPrice, closePosition: true, quantity: "0" }] });

await runSync(account.id, 1, { reason: "manual", adapter: createFakeAdapter({
  fills: { BTCUSDT: [btcOpen], ETHUSDT: ethRound }, positions: [btcPosition], conditionalOrders: stopAt("90"),
}).adapter });
const before = await db.listTrades(account.id, 1);

const { adapter, calls } = createFakeAdapter({
  fills: { BTCUSDT: [btcOpen], ETHUSDT: [...ethRound, fill("12", "ETHUSDT", "BUY", "55", "2", now - H)] },
  positions: [btcPosition, { symbol: "ETHUSDT", positionSide: "BOTH", positionAmt: "2", entryPrice: "55", notional: "110", updateTime: now - H }],
  conditionalOrders: stopAt("95"),
});
await runSync(account.id, 1, { reason: "auto", adapter });

const discover = calls.find(c => c.method === "discoverSymbols");
check(discover.args[1] === now - 1 * D - H, "income-from", discover.args);
const fetchFrom = Object.fromEntries(calls.filter(c => c.method === "fetchFills").map(c => [c.args[1], c.args[2]]));
check(fetchFrom.BTCUSDT === now - 2 * D - H, "open-symbol-refetch", fetchFrom);
check(fetchFrom.ETHUSDT === now - 1 * D - H, "fill-cursor-overlap", fetchFrom);

const fills = await db.listFillsByAccount(account.id, 1);
check(fills.length === 4 && fills.every(f => f.source === "exchange"), "deduped-no-seeds", fills.map(f => f.fillId));
const after = await db.listTrades(account.id, 1);
const btcBefore = before.find(t => t.symbol === "BTCUSDT");
const btcAfter = after.find(t => t.symbol === "BTCUSDT");
check(after.length === 3 && btcAfter.id === btcBefore.id && btcAfter.stopLossPrice === "95", "trades", after);
check((await db.getAccountById(account.id, 1)).incomeCursorAt === now - H, "cursor-advanced");
`
    );
    expect(output).toBe("ok");
  });

  it("persists each of the eight error codes without writing sync data", () => {
    const output = runCase(
      "errors",
      `
const btc = { BTCUSDT: [fill("1", "BTCUSDT", "BUY", "100", "1", now - D)] };
const cases = [
  ["invalid_key", { verifyKey: { ok: false, code: "invalid_key" } }],
  ["permissions_changed", { verifyKey: { ok: false, code: "permissions_changed" } }],
  ["futures_unreadable", { verifyKey: { ok: false, code: "futures_unreadable" } }],
  ["clock_skew", { throws: { discoverSymbols: "clock_skew" } }],
  ["rate_limited", { throws: { fetchFills: "rate_limited" } }],
  ["exchange_unavailable", { throws: { fetchPositions: "exchange_unavailable" } }],
  ["network", { throws: { fetchBalance: "network" } }],
];
for (const [code, fixtures] of cases) {
  const error = await rejects(runSync(account.id, 1, { reason: "manual", adapter: createFakeAdapter({ fills: btc, ...fixtures }).adapter }), code);
  check(error.message === code, code + "-message", error.message);
  const row = await db.getAccountById(account.id, 1);
  check(row.lastSyncErrorCode === code && row.lastSyncAttemptAt >= now, code + "-persisted", row);
  check(code === "rate_limited" ? row.lastSyncRetryAt > now : row.lastSyncRetryAt === null, code + "-retryAt", row);
  check(row.backfillStart === null && row.lastSyncedAt === null && row.balanceUsdt === null, code + "-no-snapshot", row);
}
check((await db.listFillsByAccount(account.id, 1)).length === 0, "no-fills");

// Reconstruction failure (hedge leg over-reduced) maps to unknown.
await db.updateAccount(account.id, 1, { backfillStart: now - 10 * D, incomeCursorAt: now - 10 * D });
const error = await rejects(runSync(account.id, 1, { reason: "manual", adapter: createFakeAdapter({ fills: { BTCUSDT: [
  fill("1", "BTCUSDT", "BUY", "100", "1", now - 2 * D, { positionSide: "LONG" }),
  fill("2", "BTCUSDT", "SELL", "110", "2", now - D, { positionSide: "LONG" }),
] } }).adapter }), "unknown");
check(error.message === "unknown" && error.code === "INTERNAL_SERVER_ERROR", "unknown-error", error);
check((await db.getAccountById(account.id, 1)).lastSyncErrorCode === "unknown", "unknown-persisted");
check((await db.listTrades(account.id, 1)).length === 0, "no-trades");
`
    );
    expect(output).toBe("ok");
  });

  it("rolls back fills and trades when the write transaction throws", () => {
    const output = runCase(
      "rollback",
      `
const { sql } = await import("drizzle-orm");
const handle = await db.getDb();
// Abort the snapshot update, the last write inside the transaction.
await handle.run(sql.raw("CREATE TRIGGER fail_snapshot BEFORE UPDATE OF lastSyncedAt ON accounts WHEN NEW.lastSyncedAt IS NOT NULL BEGIN SELECT RAISE(ABORT, 'boom'); END"));

const error = await rejects(runSync(account.id, 1, { reason: "manual", adapter: createFakeAdapter({
  fills: { BTCUSDT: [fill("1", "BTCUSDT", "BUY", "100", "1", now - D)] },
  positions: [{ symbol: "BTCUSDT", positionSide: "BOTH", positionAmt: "1", entryPrice: "100", notional: "100", updateTime: now - D }],
}).adapter }), "rollback");
check(error.message === "unknown", "message", error.message);
check((await db.listFillsByAccount(account.id, 1)).length === 0, "fills-rolled-back");
check((await db.listTrades(account.id, 1)).length === 0, "trades-rolled-back");
const row = await db.getAccountById(account.id, 1);
check(row.backfillStart === null && row.balanceUsdt === null && row.lastSyncErrorCode === "unknown", "account", row);
`
    );
    expect(output).toBe("ok");
  });

  it("rejects a concurrent run with CONFLICT before recording an attempt", () => {
    const output = runCase(
      "conflict",
      `
const { adapter, calls } = createFakeAdapter();
const [first, second] = await Promise.allSettled([
  runSync(account.id, 1, { reason: "manual", adapter }),
  runSync(account.id, 1, { reason: "manual", adapter }),
]);
check(first.status === "fulfilled", "first", first);
check(second.status === "rejected" && second.reason.code === "CONFLICT", "second", String(second.reason));
check(calls.filter(c => c.method === "verifyKey").length === 1, "one-run", calls.map(c => c.method));
await runSync(account.id, 1, { reason: "manual", adapter });
`
    );
    expect(output).toBe("ok");
  });

  it("auto-syncs only stale accounts with retryable or no error", () => {
    const output = runCase(
      "autosync",
      `
const make = async (name, patch) => {
  const created = await db.createAccount(keyed(name));
  await db.updateAccount(created.id, 1, patch);
  return created.id;
};
const ids = {
  never: account.id,
  stale: await make("stale", { lastSyncedAt: now - 10 * 60000 }),
  fresh: await make("fresh", { lastSyncedAt: now - 60000 }),
  needsHuman: await make("needsHuman", { lastSyncErrorCode: "invalid_key" }),
  rateLimitedWaiting: await make("rlWait", { lastSyncErrorCode: "rate_limited", lastSyncRetryAt: now + 60000 }),
  rateLimitedDue: await make("rlDue", { lastSyncErrorCode: "rate_limited", lastSyncRetryAt: now - 1 }),
  unavailable: await make("unavailable", { lastSyncErrorCode: "exchange_unavailable" }),
  network: await make("network", { lastSyncErrorCode: "network" }),
  unknown: await make("unknown", { lastSyncErrorCode: "unknown" }),
};

const outcomes = await autoSync(1, { adapter: createFakeAdapter().adapter });
const synced = outcomes.map(o => o.accountId).sort((a, b) => a - b);
const expected = [ids.never, ids.stale, ids.rateLimitedDue, ids.unavailable, ids.network].sort((a, b) => a - b);
check(JSON.stringify(synced) === JSON.stringify(expected), "eligible", { synced, expected });
check(outcomes.every(o => o.ok), "all-ok", outcomes);

await db.updateAccount(ids.never, 1, { lastSyncedAt: null });
const failed = await autoSync(1, { adapter: createFakeAdapter({ throws: { fetchBalance: "network" } }).adapter });
check(JSON.stringify(failed) === JSON.stringify([{ accountId: ids.never, ok: false, code: "network" }]), "failure-outcome", failed);
`
    );
    expect(output).toBe("ok");
  });
});
