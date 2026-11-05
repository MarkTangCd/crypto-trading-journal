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
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, openId TEXT NOT NULL UNIQUE, name TEXT, email TEXT, loginMethod TEXT, role TEXT NOT NULL DEFAULT 'user', createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch() * 1000)); " +
    "CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, exchange TEXT NOT NULL DEFAULT 'binance', apiKey TEXT NOT NULL, apiSecret TEXT NOT NULL, keyVerifiedAt INTEGER, balanceUsdt TEXT, unrealizedPnlUsdt TEXT, backfillStart INTEGER, incomeCursorAt INTEGER, lastSyncedAt INTEGER, lastSyncAttemptAt INTEGER, lastSyncErrorCode TEXT, lastSyncRetryAt INTEGER, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));";

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
      ).toEqual(["accounts", "users"]);
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

if (!accountColumns.some(column => column.name === "apiKey" && column.notnull === 1)) {
  throw new Error("accounts-table-not-migrated");
}

console.log(JSON.stringify(tables.map(table => table.name)));
`;

      const result = runNodeEval(script, tempDbPath);
      const tables = JSON.parse(result.trim()) as string[];

      expect(tables).toContain("accounts");
      expect(tables).toContain("users");
      expect(tables).toContain("__drizzle_migrations");
      expect(tables).not.toContain("transactions");
    });

    it("drops manual-entry data and keyless accounts when migrating past 0012", () => {
      const tempDbPath = join(tmpDir, "task68-migrate.sqlite");
      if (existsSync(tempDbPath)) {
        rmSync(tempDbPath);
      }

      const script = `
const { DatabaseSync } = await import("node:sqlite");
const { readFileSync } = await import("node:fs");

// Rebuild the schema as of migration 0012, recorded the way the migrator does.
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8"));
const sqlite = new DatabaseSync(process.env.DATABASE_URL);
sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)");
for (const entry of journal.entries.filter(entry => entry.idx <= 12)) {
  const statements = readFileSync("drizzle/" + entry.tag + ".sql", "utf-8").split("--> statement-breakpoint");
  for (const statement of statements) {
    if (statement.trim()) sqlite.exec(statement);
  }
  sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(entry.tag, entry.when);
}

sqlite.prepare("INSERT INTO users (id, openId, name, loginMethod) VALUES (1, 'anonymous-user', 'Anonymous User', 'anonymous')").run();
sqlite.prepare("INSERT INTO accounts (id, userId, name) VALUES (1, 1, 'legacy')").run();
sqlite.prepare("INSERT INTO accounts (id, userId, name, apiKey, apiSecret) VALUES (2, 1, 'linked', 'key-ct', 'secret-ct')").run();
sqlite.prepare("INSERT INTO goals (userId, text) VALUES (1, 'size down after two losses')").run();
sqlite.prepare("INSERT INTO pre_trades (id, userId, tradingPair, primaryTimeFrame, idea) VALUES (1, 1, 'BTCUSDT', '1H', 'range fade')").run();
sqlite.prepare("INSERT INTO conversations (id, userId, preTradeId, providerId, model) VALUES (1, 1, 1, 'deepseek', 'deepseek-chat')").run();
sqlite.prepare("INSERT INTO conversations (id, userId, tradeId, providerId, model) VALUES (2, 1, 7, 'deepseek', 'deepseek-chat')").run();
sqlite.prepare("INSERT INTO messages (conversationId, role, content) VALUES (1, 'user', 'plan'), (2, 'user', 'review')").run();
sqlite.close();

const { getOrCreateAnonymousUser, closeDb } = await import("./server/db.ts");
await getOrCreateAnonymousUser();
closeDb();

const verified = new DatabaseSync(process.env.DATABASE_URL);
const names = sql => verified.prepare(sql).all().map(row => row.name);
const tables = names("select name from sqlite_master where type = 'table'");
const accountColumns = verified.prepare("PRAGMA table_info(accounts)").all();
const conversationColumns = names("PRAGMA table_info(conversations)");
const accountIds = verified.prepare("select id from accounts order by id").all().map(row => row.id);
const counts = verified.prepare("select (select count(*) from goals) as goals, (select count(*) from pre_trades) as preTrades, (select count(*) from messages) as messages").get();
const attachments = verified.prepare("select preTradeId, tradeId from conversations order by id").all();
let unattachedRejected = false;
try {
  verified.prepare("INSERT INTO conversations (userId, providerId, model) VALUES (1, 'deepseek', 'deepseek-chat')").run();
} catch {
  unattachedRejected = true;
}
verified.close();

console.log(JSON.stringify({
  hasTransactions: tables.includes("transactions"),
  hasInitialBalance: accountColumns.some(column => column.name === "initialBalance"),
  keysNotNull: accountColumns.filter(column => column.name === "apiKey" || column.name === "apiSecret").every(column => column.notnull === 1),
  hasTransactionId: conversationColumns.includes("transactionId"),
  accountIds,
  counts,
  attachments,
  unattachedRejected,
}));
`;

      const result = JSON.parse(runNodeEval(script, tempDbPath).trim());
      rmSync(tempDbPath);

      expect(result).toEqual({
        hasTransactions: false,
        hasInitialBalance: false,
        keysNotNull: true,
        hasTransactionId: false,
        accountIds: [2],
        counts: { goals: 1, preTrades: 1, messages: 2 },
        attachments: [
          { preTradeId: 1, tradeId: null },
          { preTradeId: null, tradeId: 7 },
        ],
        unattachedRejected: true,
      });
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
});
