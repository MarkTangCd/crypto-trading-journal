import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

function bootstrapSqlite(databaseUrl: string): void {
  const schemaSql =
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, openId TEXT NOT NULL UNIQUE, name TEXT, email TEXT, loginMethod TEXT, role TEXT NOT NULL DEFAULT 'user', createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch() * 1000), initialBalance TEXT DEFAULT '0'); " +
    "CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, initialBalance TEXT NOT NULL DEFAULT '0', createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)); " +
    "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));";

  runNodeEval(
    `const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(process.env.DATABASE_URL); db.exec(${JSON.stringify(schemaSql)}); db.close(); console.log('bootstrapped');`,
    databaseUrl
  );
}

describe("SQLite Integration Tests", () => {
  describe("bootstrap creates expected core tables", () => {
    const tempDbPath = join(tmpDir, "task7-bootstrap.sqlite");

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

    it("creates the core application tables in a fresh sqlite file", () => {
      bootstrapSqlite(tempDbPath);

      const result = runNodeEval(
        `const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(process.env.DATABASE_URL); const tables = db.prepare(\"select name from sqlite_master where type = 'table' order by name\").all(); db.close(); console.log(JSON.stringify(tables.map(table => table.name)));`,
        tempDbPath
      );

      expect(
        JSON.parse(result).filter(
          (table: string) => table !== "sqlite_sequence"
        )
      ).toEqual(["accounts", "transactions", "users"]);
    });
  });

  describe("auto-migrates a fresh sqlite file", () => {
    const tempDbPath = join(tmpDir, "task7-auto-migrate.sqlite");

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

    it("creates tables and the anonymous user on first access", () => {
      const script = `
const { getOrCreateAnonymousUser, closeDb } = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

const user = await getOrCreateAnonymousUser();
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const tables = sqlite.prepare("select name from sqlite_master where type = 'table' order by name").all();
const accountColumns = sqlite.prepare("PRAGMA table_info(accounts)").all();
sqlite.close();

if (!user || user.openId !== "anonymous-user") {
  throw new Error("anonymous-user-not-created");
}

if (!accountColumns.some(column => column.name === "initialBalance")) {
  throw new Error("accounts-table-not-migrated");
}

console.log(JSON.stringify(tables.map(table => table.name)));
`;

      const result = runNodeEval(script, tempDbPath);
      const tables = JSON.parse(result.trim()) as string[];

      expect(tables).toContain("accounts");
      expect(tables).toContain("users");
      expect(tables).toContain("__drizzle_migrations");
    });
  });

  describe("opens a sqlite connection with a temp file", () => {
    const tempDbPath = join(
      __dirname,
      "..",
      ".tmp",
      "task4-integration.sqlite"
    );

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

    it("should create a database connection and initialize tables", async () => {
      const result = execSync(
        `node --experimental-sqlite --import tsx test-task4.ts`,
        {
          cwd: repoRoot,
          env: { ...process.env, DATABASE_URL: tempDbPath },
          encoding: "utf-8",
        }
      );

      expect(result).toContain("Database connection successful");
      expect(existsSync(tempDbPath)).toBe(true);
    });

    it("should be able to perform basic operations", async () => {
      const result = execSync(
        `node --experimental-sqlite --import tsx test-task4.ts`,
        {
          cwd: repoRoot,
          env: { ...process.env, DATABASE_URL: tempDbPath },
          encoding: "utf-8",
        }
      );

      expect(result).toContain("Database connection successful");
    });
  });

  describe("upserts user on openId conflict", () => {
    const tempDbPath = join(tmpDir, "task5-upsert.sqlite");

    beforeAll(() => {
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
      bootstrapSqlite(tempDbPath);
    });

    afterAll(() => {
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
    });

    it("updates the existing row and preserves one openId record", () => {
      const script = `
const { upsertUser, closeDb } = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-task5", name: "First", email: "first@example.com", loginMethod: "oidc" });
await upsertUser({ openId: "oid-task5", name: "Updated", email: "updated@example.com", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const count = sqlite.prepare("select count(*) as count from users where openId = ?").get("oid-task5");
const row = sqlite.prepare("select name, email from users where openId = ?").get("oid-task5");
sqlite.close();

if (!count || count.count !== 1) throw new Error("unexpected-user-count");
if (!row || row.name !== "Updated" || row.email !== "updated@example.com") {
  throw new Error("upsert-did-not-update");
}
console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);

      expect(result).toContain("ok");
    });
  });

  describe("creates and deletes transactions atomically", () => {
    const tempDbPath = join(tmpDir, "task5-atomic.sqlite");

    beforeAll(() => {
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
      bootstrapSqlite(tempDbPath);
    });

    afterAll(() => {
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
    });

    it("creates and deletes transactions", () => {
      const script = `
const {
  upsertUser,
  createTransactionWithElements,
  deleteTransactionWithElements,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-atomic", name: "Atomic User", loginMethod: "oidc" });
closeDb();

const userLookupDb = new DatabaseSync(process.env.DATABASE_URL);
const userRow = userLookupDb.prepare("select id from users where openId = ?").get("oid-atomic");
userLookupDb.close();
if (!userRow || typeof userRow.id !== "number") throw new Error("missing-user");

const seedAccountsDb = new DatabaseSync(process.env.DATABASE_URL);
const insertAccount = seedAccountsDb.prepare("insert into accounts (userId, name, notes, initialBalance) values (?, ?, ?, ?)");
const accountResult = insertAccount.run(userRow.id, "Atomic Account", null, "1000.00");
seedAccountsDb.close();
const accountId = Number(accountResult.lastInsertRowid);

await createTransactionWithElements({
  userId: userRow.id,
  accountId,
  accountBalance: "1005.00",
  tradingPair: "BTCUSD",
  timeFrame: "1h",
  startTime: 1700000000000,
  endTime: 1700003600000,
  direction: "long",
  tradingLogic: "test logic",
  marketCycle: "Trading Range",
  transactionType: "Trend",
  outcome: "win",
  consecutiveLosses: 0,
  riskRewardRatio: "2.00",
  returnAmount: "5.00",
  tvUrl: null,
});

await createTransactionWithElements({
  userId: userRow.id,
  accountId,
  accountBalance: "1002.50",
  tradingPair: "ETHUSD",
  timeFrame: "4h",
  startTime: 1700007200000,
  endTime: 1700010800000,
  direction: "short",
  tradingLogic: "test logic 2",
  marketCycle: "Trading Range",
  transactionType: "Trend",
  outcome: "breakeven",
  consecutiveLosses: 0,
  riskRewardRatio: "1.00",
  returnAmount: "0.00",
  tvUrl: null,
});

closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const txOne = sqlite.prepare("select id from transactions where userId = ? and tradingPair = ?").get(userRow.id, "BTCUSD");
const txTwo = sqlite.prepare("select id from transactions where userId = ? and tradingPair = ?").get(userRow.id, "ETHUSD");
if (!txOne || !txTwo) {
  sqlite.close();
  throw new Error("missing-transactions");
}

const txOneId = Number(txOne.id);
const txTwoId = Number(txTwo.id);
if (!Number.isFinite(txOneId) || !Number.isFinite(txTwoId)) {
  sqlite.close();
  throw new Error("invalid-transaction-ids");
}
sqlite.close();

await deleteTransactionWithElements(txOneId, userRow.id);
await deleteTransactionWithElements(txTwoId, userRow.id);
closeDb();

const sqliteAfter = new DatabaseSync(process.env.DATABASE_URL);
const txRows = sqliteAfter.prepare("select count(*) as count from transactions where id in (?, ?)").get(txOneId, txTwoId);
sqliteAfter.close();

if (!txRows || txRows.count !== 0) throw new Error("transactions-not-deleted");
console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);

      expect(result).toContain("ok");
    });
  });

  describe("task 6 decimal and timestamp behavior", () => {
    const tempDbPath = join(tmpDir, "task6-behavior.sqlite");

    beforeAll(() => {
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
      bootstrapSqlite(tempDbPath);
    });

    afterAll(() => {
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
    });

    it("sorts returnAmount numerically", () => {
      const script = `
const {
  upsertUser,
  createTransactionWithElements,
  getTransactionsByUserId,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-task6-sort", name: "Sort User", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const user = sqlite.prepare("select id from users where openId = ?").get("oid-task6-sort");
const accountSeed = sqlite.prepare("insert into accounts (userId, name, notes, initialBalance) values (?, ?, ?, ?)").run(user.id, "Sort Account", null, "1000.00");
const accountId = Number(accountSeed.lastInsertRowid);
sqlite.close();

if (!user || typeof user.id !== "number") throw new Error("missing-user");

const rows = ["2.00", "10.00", "-1.00", "100.00", "20.00"];
for (const [index, returnAmount] of rows.entries()) {
  await createTransactionWithElements({
    userId: user.id,
    accountId,
    accountBalance: "1000.00",
    tradingPair: "PAIR" + index,
    timeFrame: "1h",
    startTime: 1700000000000 + index,
    endTime: 1700000001000 + index,
    direction: "long",
    tradingLogic: "sort-test",
    marketCycle: "Trading Range",
    transactionType: "Trend",
    status: "closed",
    outcome: "win",
    consecutiveLosses: 0,
    riskRewardRatio: "1.00",
    returnAmount,
    tvUrl: null,
  });
}

const asc = await getTransactionsByUserId(user.id, {
  sortBy: "returnAmount",
  sortOrder: "asc",
});
const desc = await getTransactionsByUserId(user.id, {
  sortBy: "returnAmount",
  sortOrder: "desc",
});
closeDb();

const ascReturns = asc.map(row => row.returnAmount).join(",");
const descReturns = desc.map(row => row.returnAmount).join(",");

if (ascReturns !== "-1.00,2.00,10.00,20.00,100.00") {
  throw new Error("bad-asc-order:" + ascReturns);
}
if (descReturns !== "100.00,20.00,10.00,2.00,-1.00") {
  throw new Error("bad-desc-order:" + descReturns);
}

console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);
      expect(result).toContain("ok");
    });

    it("computes current balance and stats exactly from text decimals", () => {
      const script = `
const {
  upsertUser,
  updateUserInitialBalance,
  createTransactionWithElements,
  getCurrentBalance,
  getStatistics,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-task6-stats", name: "Stats User", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const user = sqlite.prepare("select id from users where openId = ?").get("oid-task6-stats");
const accountSeed = sqlite.prepare("insert into accounts (userId, name, notes, initialBalance) values (?, ?, ?, ?)").run(user.id, "Stats Account", null, "1000.10");
const accountId = Number(accountSeed.lastInsertRowid);
sqlite.close();
if (!user || typeof user.id !== "number") throw new Error("missing-user");

await updateUserInitialBalance(user.id, "1000.10");

const trades = [
  { amount: "0.10", outcome: "win" },
  { amount: "0.20", outcome: "win" },
  { amount: "-0.30", outcome: "loss" },
  { amount: "1.11", outcome: "win" },
];

for (const [index, trade] of trades.entries()) {
  await createTransactionWithElements({
    userId: user.id,
    accountId,
    accountBalance: "1000.00",
    tradingPair: "STAT" + index,
    timeFrame: "1h",
    startTime: 1710000000000 + index,
    endTime: 1710000001000 + index,
    direction: "long",
    tradingLogic: "stats-test",
    marketCycle: "Trading Range",
    transactionType: "Trend",
    status: "closed",
    outcome: trade.outcome,
    consecutiveLosses: 0,
    riskRewardRatio: "1.00",
    returnAmount: trade.amount,
    tvUrl: null,
  });
}

const currentBalance = await getCurrentBalance(accountId, "1000.10");
const stats = await getStatistics(accountId, "1000.10");
closeDb();

if (currentBalance !== "1001.21") throw new Error("bad-current-balance:" + currentBalance);

if (
  stats.winCount !== 3 ||
  stats.lossCount !== 1 ||
  stats.totalTrades !== 4 ||
  stats.totalProfit !== 1.41 ||
  stats.totalReward !== 1.11 ||
  stats.avgProfit !== 0.47 ||
  stats.avgLoss !== 0.3 ||
  stats.originalBalance !== 1000.1 ||
  stats.latestBalance !== 1001.21
) {
  throw new Error("bad-stats:" + JSON.stringify(stats));
}

console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);
      expect(result).toContain("ok");
    });

    it("updates updatedAt on mutable writes", () => {
      const script = `
const {
  upsertUser,
  updateUserInitialBalance,
  createTransactionWithElements,
  updateTransaction,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-task6-updated", name: "Updated User", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const user = sqlite.prepare("select id from users where openId = ?").get("oid-task6-updated");
const accountSeed = sqlite.prepare("insert into accounts (userId, name, notes, initialBalance) values (?, ?, ?, ?)").run(user.id, "Updated Account", null, "1000.00");
const accountId = Number(accountSeed.lastInsertRowid);
sqlite.close();
if (!user || typeof user.id !== "number") throw new Error("missing-user");

const transaction = await createTransactionWithElements({
  userId: user.id,
  accountId,
  accountBalance: "1000.00",
  tradingPair: "UPD",
  timeFrame: "1h",
  startTime: 1720000000000,
  endTime: 1720000001000,
  direction: "long",
  tradingLogic: "updatedAt-test",
  marketCycle: "Trading Range",
  transactionType: "Trend",
  status: "closed",
  outcome: "win",
  consecutiveLosses: 0,
  riskRewardRatio: "1.00",
  returnAmount: "1.00",
  tvUrl: null,
});
closeDb();

const seed = new DatabaseSync(process.env.DATABASE_URL);
seed.prepare("update users set updatedAt = 1 where id = ?").run(user.id);
seed.prepare("update transactions set updatedAt = 1 where id = ?").run(transaction.id);
seed.close();

await updateUserInitialBalance(user.id, "2000.00");
await updateTransaction(transaction.id, user.id, { reviewFeedback: "looks good" });
closeDb();

const verify = new DatabaseSync(process.env.DATABASE_URL);
const userUpdated = verify.prepare("select updatedAt from users where id = ?").get(user.id);
const transactionUpdated = verify.prepare("select updatedAt from transactions where id = ?").get(transaction.id);
verify.close();

if (!userUpdated || userUpdated.updatedAt <= 1) throw new Error("user-updatedAt-not-updated");
if (!transactionUpdated || transactionUpdated.updatedAt <= 1) throw new Error("transaction-updatedAt-not-updated");

console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);
      expect(result).toContain("ok");
    });
  });

  describe("createTransactionWithElements honors selected account", () => {
    const tempDbPath = join(tmpDir, "account-routing.sqlite");

    beforeAll(() => {
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
      bootstrapSqlite(tempDbPath);
    });

    afterAll(() => {
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }
    });

    it("persists transactions under the explicit accountId, not userId", () => {
      const script = `
const {
  upsertUser,
  createAccount,
  createTransactionWithElements,
  getTransactionsByUserId,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-account-routing", name: "Routing User", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const user = sqlite.prepare("select id from users where openId = ?").get("oid-account-routing");
sqlite.close();
if (!user || typeof user.id !== "number" || user.id !== 1) {
  throw new Error("expected-userId-1:" + JSON.stringify(user));
}

const firstAccount = await createAccount({ userId: user.id, name: "Primary", notes: null, initialBalance: "1000.00" });
const secondAccount = await createAccount({ userId: user.id, name: "Swing", notes: null, initialBalance: "2000.00" });
if (firstAccount.id !== 1 || secondAccount.id !== 2) {
  throw new Error("unexpected-account-ids:" + JSON.stringify({ firstAccount, secondAccount }));
}

await createTransactionWithElements({
  userId: user.id,
  accountId: secondAccount.id,
  accountBalance: "2000.00",
  tradingPair: "BTCUSDT",
  timeFrame: "4H",
  startTime: 1700000000000,
  endTime: null,
  direction: "long",
  tradingLogic: "switched-account",
  marketCycle: "Trading Range",
  transactionType: "Trend",
  status: "open",
  outcome: null,
  consecutiveLosses: 0,
  riskRewardRatio: null,
  returnAmount: null,
  tvUrl: null,
});

const verifyDb = new DatabaseSync(process.env.DATABASE_URL);
const persisted = verifyDb.prepare("select id, userId, accountId from transactions where tradingPair = ?").get("BTCUSDT");
verifyDb.close();
if (!persisted || persisted.accountId !== 2) {
  throw new Error("wrong-accountId-persisted:" + JSON.stringify(persisted));
}
if (persisted.userId !== 1) {
  throw new Error("wrong-userId-persisted:" + JSON.stringify(persisted));
}

const onSecondAccount = await getTransactionsByUserId(user.id, { accountId: secondAccount.id });
const onFirstAccount = await getTransactionsByUserId(user.id, { accountId: firstAccount.id });
closeDb();

if (onSecondAccount.length !== 1 || onFirstAccount.length !== 0) {
  throw new Error("bad-list-isolation:" + JSON.stringify({ onSecondAccount, onFirstAccount }));
}

console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);
      expect(result).toContain("ok");
    });

    it("rejects createTransactionWithElements when accountId is missing", () => {
      const script = `
const {
  upsertUser,
  createTransactionWithElements,
  closeDb,
} = await import("./server/db.ts");
const { DatabaseSync } = await import("node:sqlite");

await upsertUser({ openId: "oid-account-missing", name: "Missing Account User", loginMethod: "oidc" });
closeDb();

const sqlite = new DatabaseSync(process.env.DATABASE_URL);
const user = sqlite.prepare("select id from users where openId = ?").get("oid-account-missing");
sqlite.close();
if (!user || typeof user.id !== "number") throw new Error("missing-user");

let threw = false;
try {
  await createTransactionWithElements({
    userId: user.id,
    accountBalance: "1000.00",
    tradingPair: "ETHUSDT",
    timeFrame: "1H",
    startTime: 1700000000000,
    endTime: null,
    direction: "short",
    tradingLogic: "should-fail",
    marketCycle: "Trading Range",
    transactionType: "Trend",
    status: "open",
    outcome: null,
    consecutiveLosses: 0,
    riskRewardRatio: null,
    returnAmount: null,
    tvUrl: null,
  });
} catch (err) {
  threw = true;
}
closeDb();

if (!threw) throw new Error("expected-guard-to-throw");
console.log("ok");`;

      const result = runNodeEval(script, tempDbPath);
      expect(result).toContain("ok");
    });
  });
});
