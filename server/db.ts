import { eq, desc, asc, and, count, inArray, sql } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  InsertUser,
  type User,
  users,
  accounts,
  InsertAccount,
  Account,
  conversations,
  type Conversation,
  messages,
  type Message,
  agentSettings,
  type AgentSettings,
  type InsertAgentSettings,
  preTrades,
  type PreTrade,
  type InsertPreTrade,
  goals,
  type Goal,
  type InsertGoal,
  fills,
  type Fill,
  type InsertFill,
  trades,
  type Trade,
  plans,
  type Plan,
  planScenarios,
  type PlanScenario,
  planObservations,
  type PlanObservation,
  images,
  type InsertImage,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ANONYMOUS_OPEN_ID, ANONYMOUS_USER_NAME } from "@shared/const";
import { utc8DayKey } from "@shared/time";
import * as decimal from "./_core/decimal";
import { decrypt } from "./agents/secrets";
import type { PublicAccount } from "@shared/types";
import type { TradeRecord } from "./exchange/reconstruct";
import type { ImageOwnerKind, SyncErrorCode } from "@shared/const";
import type { RichTextDoc } from "@shared/richText";

const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

let _db: SqliteRemoteDatabase | null = null;
let _sqliteDb: DatabaseSync | null = null;
let _anonymousUserPromise: Promise<User> | null = null;

// Process-wide promise chain that serialises every transaction. The shared
// `_sqliteDb` connection only supports a single in-flight `BEGIN` at a time,
// so concurrent tRPC requests that both need a transaction must queue here
// instead of racing each other (which would surface as
// "cannot start transaction within a transaction").
let _transactionChain: Promise<unknown> = Promise.resolve();

/**
 * Run `operation` inside a serialised SQLite transaction.
 *
 * IMPORTANT: This helper is NOT reentrant. Callers must never invoke it
 * recursively (directly or indirectly via another db helper that also calls
 * it) — there is only one shared connection, so a nested call would deadlock
 * waiting on the outer transaction's promise chain.
 *
 * Uses `BEGIN IMMEDIATE` so the write lock is acquired up-front; this matches
 * what every callsite needs and prevents upgrade-from-read deadlocks.
 */
export async function runInSqliteTransaction<T>(
  operation: (db: SqliteRemoteDatabase) => Promise<T>
): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await getDb();
    if (!db || !_sqliteDb) {
      throw new Error("Database not available");
    }

    _sqliteDb.exec("BEGIN IMMEDIATE");
    try {
      const result = await operation(db);
      _sqliteDb.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        _sqliteDb.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "[Database] Failed to rollback transaction:",
          rollbackError
        );
      }
      throw error;
    }
  };

  // Tail-chain on the previous transaction. Swallow chain rejections so that
  // one failed transaction doesn't poison every subsequent caller; the
  // failing call still receives its own rejection via the returned promise.
  const next = _transactionChain.then(run, run);
  _transactionChain = next.catch(() => undefined);
  return next;
}

async function ensureDatabaseSchema(db: SqliteRemoteDatabase): Promise<void> {
  if (!_sqliteDb) {
    throw new Error("Database not available");
  }

  const existingTables = _sqliteDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as Array<{ name: string }>;
  const hasMigrationTable = existingTables.some(
    table => table.name === "__drizzle_migrations"
  );

  if (existingTables.length > 0 && !hasMigrationTable) {
    return;
  }

  await migrate(
    db,
    async migrationQueries => {
      // Strip standalone BEGIN/COMMIT/ROLLBACK from individual migration files —
      // we own the outer transaction here, and nested BEGIN would fail in SQLite.
      const transactionKeywords = /^(BEGIN|COMMIT|ROLLBACK|END)\b/i;
      const queries = migrationQueries
        .map(query => query.trim())
        .filter(query => query.length > 0 && !transactionKeywords.test(query));
      if (queries.length === 0) {
        return;
      }

      _sqliteDb!.exec("BEGIN IMMEDIATE");
      try {
        for (const query of queries) {
          _sqliteDb!.exec(query);
        }
        _sqliteDb!.exec("COMMIT");
      } catch (error) {
        try {
          _sqliteDb!.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "[Database] Failed to rollback schema migration:",
            rollbackError
          );
        }
        throw error;
      }
    },
    { migrationsFolder: MIGRATIONS_FOLDER }
  );
}

export async function getDb(): Promise<SqliteRemoteDatabase | null> {
  if (!_db && ENV.databaseUrl) {
    try {
      // Ensure parent directory exists for file-backed databases
      if (ENV.databaseUrl !== ":memory:") {
        const parentDir = dirname(ENV.databaseUrl);
        try {
          mkdirSync(parentDir, { recursive: true });
        } catch (err) {
          // Directory might already exist, which is fine
          if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
            console.warn("[Database] Failed to create directory:", err);
          }
        }
      }

      _sqliteDb = new DatabaseSync(ENV.databaseUrl);

      // Create the proxy callback that uses node:sqlite
      const proxyCallback = async (
        sqlStr: string,
        params: unknown[],
        method: "run" | "all" | "values" | "get"
      ) => {
        const stmt = _sqliteDb!.prepare(sqlStr);
        // Cast params to SQLInputValue type for node:sqlite
        const sqlParams = params as (
          | string
          | number
          | bigint
          | null
          | Uint8Array
          | Buffer
        )[];

        if (method === "run") {
          stmt.run(...sqlParams);
          return { rows: [] };
        } else if (method === "all" || method === "values") {
          const result = stmt.all(...sqlParams) as Record<string, unknown>[];
          const rows = result.map(row => Object.values(row));
          return { rows };
        } else if (method === "get") {
          const result = stmt.get(...sqlParams) as
            | Record<string, unknown>
            | undefined;
          return { rows: result ? [Object.values(result)] : [] };
        }

        return { rows: [] };
      };

      _db = drizzle(proxyCallback);
      await ensureDatabaseSchema(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      if (_sqliteDb) {
        _sqliteDb.close();
      }
      _db = null;
      _sqliteDb = null;
    }
  }
  return _db;
}

/**
 * Close the database connection and reset the singleton.
 * Useful for testing and graceful shutdown.
 */
export function closeDb(): void {
  if (_sqliteDb) {
    _sqliteDb.close();
    _sqliteDb = null;
  }
  _db = null;
  _anonymousUserPromise = null;
}

async function loadAnonymousUser(): Promise<User> {
  await upsertUser({
    openId: ANONYMOUS_OPEN_ID,
    name: ANONYMOUS_USER_NAME,
    loginMethod: "anonymous",
    role: "user",
    lastSignedIn: new Date(),
  });

  const user = await getUserByOpenId(ANONYMOUS_OPEN_ID);
  if (!user) {
    throw new Error("Failed to create anonymous user");
  }

  return user;
}

export async function getOrCreateAnonymousUser(): Promise<User> {
  if (!_anonymousUserPromise) {
    _anonymousUserPromise = loadAnonymousUser().catch(error => {
      _anonymousUserPromise = null;
      throw error;
    });
  }

  return _anonymousUserPromise;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    updateSet.updatedAt = new Date();

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Account CRUD ============

export async function createAccount(data: InsertAccount): Promise<Account> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(accounts).values(data).returning();

  return result[0];
}

export async function getAccountById(
  id: number,
  userId: number
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAccountsByUserId(userId: number): Promise<Account[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt));
}

export async function updateAccount(
  id: number,
  userId: number,
  data: Partial<InsertAccount>
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(accounts)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));

  return getAccountById(id, userId);
}

export async function getAccountCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return result[0]?.count ?? 0;
}

/** Strip key ciphertexts; expose only the last 4 characters of the key. */
export function toPublicAccount(row: Account): PublicAccount {
  const { apiKey, apiSecret: _apiSecret, ...rest } = row;
  return {
    ...rest,
    apiKeyTail: decrypt(apiKey).slice(-4),
  };
}

/**
 * Delete an account with its fills, trades, the trades' conversations and
 * their messages, atomically.
 */
export async function deleteAccountCascade(
  id: number,
  userId: number
): Promise<void> {
  await runInSqliteTransaction(async db => {
    const accountTradeIds = db
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.accountId, id), eq(trades.userId, userId)));
    const tradeConversationIds = db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          inArray(conversations.tradeId, accountTradeIds)
        )
      );

    await db
      .delete(messages)
      .where(inArray(messages.conversationId, tradeConversationIds));
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          inArray(conversations.tradeId, accountTradeIds)
        )
      );
    await db
      .delete(trades)
      .where(and(eq(trades.accountId, id), eq(trades.userId, userId)));
    await db
      .delete(fills)
      .where(and(eq(fills.accountId, id), eq(fills.userId, userId)));
    await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  });
}

// ============ Sync state ============
// Single-statement writes on the shared handle. They open no transaction of
// their own, so a call made inside runInSqliteTransaction joins it.

export async function writeSyncAttempt(
  accountId: number,
  at: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(accounts)
    .set({ lastSyncAttemptAt: at })
    .where(eq(accounts.id, accountId));
}

export async function writeSyncFailure(
  accountId: number,
  code: SyncErrorCode,
  retryAt?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(accounts)
    .set({ lastSyncErrorCode: code, lastSyncRetryAt: retryAt ?? null })
    .where(eq(accounts.id, accountId));
}

export async function writeSyncSuccess(
  accountId: number,
  data: {
    balanceUsdt: string;
    unrealizedPnlUsdt: string;
    /** Set only by the first backfill. */
    backfillStart?: number;
    incomeCursorAt: number;
    at: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(accounts)
    .set({
      balanceUsdt: data.balanceUsdt,
      unrealizedPnlUsdt: data.unrealizedPnlUsdt,
      ...(data.backfillStart === undefined
        ? {}
        : { backfillStart: data.backfillStart }),
      incomeCursorAt: data.incomeCursorAt,
      lastSyncedAt: data.at,
      keyVerifiedAt: data.at,
      lastSyncErrorCode: null,
      lastSyncRetryAt: null,
    })
    .where(eq(accounts.id, accountId));
}

// ============ Fills ============

/** Insert fills, skipping rows already stored on (accountId, symbol, fillId). */
export async function insertFills(rows: InsertFill[]): Promise<void> {
  if (rows.length === 0) return;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(fills).values(rows).onConflictDoNothing();
}

export async function listFillsByAccount(
  accountId: number,
  userId: number
): Promise<Fill[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(fills)
    .where(and(eq(fills.accountId, accountId), eq(fills.userId, userId)))
    .orderBy(asc(fills.time), asc(fills.id));
}

/** Max stored fill time per symbol; the incremental fetch cursor. */
export async function getFillCursors(
  accountId: number
): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) return new Map();

  const rows = await db
    .select({ symbol: fills.symbol, time: sql<number>`max(${fills.time})` })
    .from(fills)
    .where(eq(fills.accountId, accountId))
    .groupBy(fills.symbol);

  return new Map(rows.map(row => [row.symbol, row.time]));
}

// ============ Trades ============

export class TradeEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeEditError";
  }
}

/**
 * Merge rebuilt trades into the table by tradeKey (spec doc-4 rebuild merge
 * rules). Rows are never deleted, so conversations keep their tradeId.
 * Must run inside the caller's runInSqliteTransaction.
 */
export async function upsertTradesByTradeKey(
  accountId: number,
  userId: number,
  records: TradeRecord[],
  syncedAt: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: trades.id, tradeKey: trades.tradeKey })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.userId, userId)));
  const idByKey = new Map(existing.map(row => [row.tradeKey, row.id]));

  for (const record of records) {
    const id = idByKey.get(record.tradeKey);
    if (id === undefined) {
      await db
        .insert(trades)
        .values({ ...record, userId, accountId, syncedAt });
      continue;
    }

    idByKey.delete(record.tradeKey);
    const {
      openTime: _openTime,
      openTimeApprox: _openTimeApprox,
      stopLossPrice,
      takeProfitPrice,
      ...rest
    } = record;
    // SL/TP follow the live snapshot only while open; a closed record leaves
    // the stored values alone (frozen at close, or hand-edited since).
    await db
      .update(trades)
      .set({
        ...rest,
        ...(record.status === "open" ? { stopLossPrice, takeProfitPrice } : {}),
        syncedAt,
      })
      .where(eq(trades.id, id));
  }

  for (const tradeKey of Array.from(idByKey.keys())) {
    console.warn(
      `[Sync] ${accountId} stored trade ${tradeKey} missing from rebuild; left in place`
    );
  }
}

export async function getTradeById(
  id: number,
  userId: number
): Promise<Trade | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);

  return result[0];
}

/** Open trades first, then newest openTime first. */
export async function listTrades(
  accountId: number,
  userId: number,
  status?: "open" | "closed"
): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(trades.userId, userId),
        status === undefined ? undefined : eq(trades.status, status)
      )
    )
    .orderBy(
      desc(sql`${trades.status} = 'open'`),
      desc(trades.openTime),
      desc(trades.id)
    );
}

export async function listOpenTradeSymbols(
  accountId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .selectDistinct({ exchangeSymbol: trades.exchangeSymbol })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.status, "open")));

  return rows.map(row => row.exchangeSymbol);
}

/**
 * Hand edits: SL/TP only on closed trades, openTime only while
 * openTimeApprox (and it then becomes exact). Throws TradeEditError
 * otherwise; returns undefined when the trade does not exist.
 */
export async function updateTradeByHand(
  id: number,
  userId: number,
  patch: {
    stopLossPrice?: string | null;
    takeProfitPrice?: string | null;
    openTime?: number;
  }
): Promise<Trade | undefined> {
  const trade = await getTradeById(id, userId);
  if (!trade) return undefined;

  const editsLevels =
    patch.stopLossPrice !== undefined || patch.takeProfitPrice !== undefined;
  if (editsLevels && trade.status !== "closed") {
    throw new TradeEditError(
      "Stop loss / take profit are editable only once closed"
    );
  }
  if (patch.openTime !== undefined && !trade.openTimeApprox) {
    throw new TradeEditError("Open time is editable only while approximate");
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(trades)
    .set({
      ...patch,
      ...(patch.openTime === undefined ? {} : { openTimeApprox: false }),
      updatedAt: new Date(),
    })
    .where(and(eq(trades.id, id), eq(trades.userId, userId)));

  return getTradeById(id, userId);
}

const RATIO_SCALE = 4;
const MONEY_SCALE = 2;

export interface TradeStats {
  closedCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  /** wins / closed; null with no closed trades */
  winRate: string | null;
  /** gross profit / gross loss; null with no losses */
  profitFactor: string | null;
  /** mean realizedPnlUsd per closed trade; null with no closed trades */
  expectancyUsd: string | null;
  /** closed trades newest-first by closeTime until the first non-loss */
  losingStreak: number;
  /** all trades, open rows included (partial exits, fees) */
  realizedPnlUsd: string;
  feeUsd: string;
  openCount: number;
  /** Σ positionSizeUsdt of open trades */
  openExposureUsdt: string;
  /** openExposureUsdt / balanceUsdt; null when balance is null or zero */
  exposureRatio: string | null;
}

/** Per-account stats derived from trades; outcome from realizedPnlUsd sign. */
export async function getTradeStats(
  accountId: number,
  userId: number
): Promise<TradeStats> {
  const account = await getAccountById(accountId, userId);
  const rows = await listTrades(accountId, userId);

  const closed = rows
    .filter(row => row.status === "closed")
    .sort((a, b) => (b.closeTime ?? 0) - (a.closeTime ?? 0) || b.id - a.id);
  const open = rows.filter(row => row.status === "open");

  const wins = closed.filter(
    row => decimal.compare(row.realizedPnlUsd, "0") > 0
  );
  const losses = closed.filter(row => decimal.isNegative(row.realizedPnlUsd));
  const grossProfit = decimal.add(wins.map(row => row.realizedPnlUsd));
  const grossLoss = decimal.abs(
    decimal.add(losses.map(row => row.realizedPnlUsd))
  );
  const closedPnl = decimal.add(closed.map(row => row.realizedPnlUsd));

  let losingStreak = 0;
  for (const row of closed) {
    if (!decimal.isNegative(row.realizedPnlUsd)) break;
    losingStreak += 1;
  }

  const openExposureUsdt = decimal.add(open.map(row => row.positionSizeUsdt));
  const balance = account?.balanceUsdt ?? null;

  return {
    closedCount: closed.length,
    winCount: wins.length,
    lossCount: losses.length,
    breakevenCount: closed.length - wins.length - losses.length,
    winRate:
      closed.length === 0
        ? null
        : decimal.div(String(wins.length), String(closed.length), RATIO_SCALE),
    profitFactor:
      losses.length === 0
        ? null
        : decimal.div(grossProfit, grossLoss, RATIO_SCALE),
    expectancyUsd:
      closed.length === 0
        ? null
        : decimal.div(closedPnl, String(closed.length), MONEY_SCALE),
    losingStreak,
    realizedPnlUsd: decimal.add(rows.map(row => row.realizedPnlUsd)),
    feeUsd: decimal.add(rows.map(row => row.feeUsd)),
    openCount: open.length,
    openExposureUsdt,
    exposureRatio:
      balance === null || decimal.isZero(balance)
        ? null
        : decimal.div(openExposureUsdt, balance, RATIO_SCALE),
  };
}

export interface DailyPnl {
  /** UTC+8 close day, yyyy-mm-dd */
  day: string;
  pnlUsd: string;
  tradeCount: number;
}

/** Closed trades summed per UTC+8 close day, oldest day first. */
export async function getDailyPnl(
  accountId: number,
  userId: number
): Promise<DailyPnl[]> {
  const closed = await listTrades(accountId, userId, "closed");

  const days = new Map<string, string[]>();
  for (const row of closed) {
    const day = utc8DayKey(row.closeTime ?? row.openTime);
    days.set(day, [...(days.get(day) ?? []), row.realizedPnlUsd]);
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, pnls]) => ({
      day,
      pnlUsd: decimal.add(pnls),
      tradeCount: pnls.length,
    }));
}

// ============ Goals ============

export async function createGoal(data: InsertGoal): Promise<Goal> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(goals).values(data).returning();

  return result[0];
}

export async function getGoalById(
  id: number,
  userId: number
): Promise<Goal | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listGoalsByUserId(userId: number): Promise<Goal[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(asc(goals.createdAt), asc(goals.id));
}

export async function updateGoal(
  id: number,
  userId: number,
  data: { text?: string; completedAt?: Date | null }
): Promise<Goal | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(goals)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));

  return getGoalById(id, userId);
}

export async function deleteGoal(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
}

// ============ Plans ============
// Ownership is checked with a separate plans query, never a join: the proxy
// callback maps rows with Object.values, which collapses duplicate column
// names. Open/closed guards live in the router and the image route.

export type ScenarioOutcome = "triggered" | "invalidated";

export type PlanListItem = Plan & {
  scenarioCount: number;
  observationCount: number;
  /** Stored outcomes in scenario id order; null where none yet */
  outcomes: (ScenarioOutcome | null)[];
};

export type PlanDetail = Plan & {
  scenarios: PlanScenario[];
  observations: PlanObservation[];
};

export async function getPlanRow(
  userId: number,
  planId: number
): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);

  return row;
}

/** Open plans newest first, then closed plans by closedAt desc. */
export async function listPlans(userId: number): Promise<PlanListItem[]> {
  const db = await getDb();
  if (!db) return [];

  const planRows = await db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(
      desc(sql`${plans.closedAt} is null`),
      desc(plans.closedAt),
      desc(plans.createdAt),
      desc(plans.id)
    );
  if (planRows.length === 0) return [];

  const planIds = planRows.map(plan => plan.id);
  const scenarioRows = await db
    .select({
      planId: planScenarios.planId,
      outcome: planScenarios.outcome,
    })
    .from(planScenarios)
    .where(inArray(planScenarios.planId, planIds))
    .orderBy(asc(planScenarios.id));
  const observationCounts = await db
    .select({ planId: planObservations.planId, n: count() })
    .from(planObservations)
    .where(inArray(planObservations.planId, planIds))
    .groupBy(planObservations.planId);

  const outcomesByPlan = new Map<number, (ScenarioOutcome | null)[]>();
  for (const row of scenarioRows) {
    const outcomes = outcomesByPlan.get(row.planId) ?? [];
    outcomes.push(row.outcome);
    outcomesByPlan.set(row.planId, outcomes);
  }
  const observationsByPlan = new Map(
    observationCounts.map(row => [row.planId, row.n])
  );

  return planRows.map(plan => {
    const outcomes = outcomesByPlan.get(plan.id) ?? [];
    return {
      ...plan,
      scenarioCount: outcomes.length,
      observationCount: observationsByPlan.get(plan.id) ?? 0,
      outcomes,
    };
  });
}

export async function getPlan(
  userId: number,
  planId: number
): Promise<PlanDetail | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const plan = await getPlanRow(userId, planId);
  if (!plan) return undefined;

  const scenarios = await db
    .select()
    .from(planScenarios)
    .where(eq(planScenarios.planId, planId))
    .orderBy(asc(planScenarios.id));
  const observations = await db
    .select()
    .from(planObservations)
    .where(eq(planObservations.planId, planId))
    .orderBy(asc(planObservations.createdAt), asc(planObservations.id));

  return { ...plan, scenarios, observations };
}

export async function createPlan(
  userId: number,
  symbol: string
): Promise<Plan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db.insert(plans).values({ userId, symbol }).returning();
  return row;
}

export async function updatePlan(
  userId: number,
  planId: number,
  patch: { symbol?: string; marketContext?: RichTextDoc | null }
): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .update(plans)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .returning();
  return row;
}

export async function addScenario(
  userId: number,
  planId: number,
  data: {
    name: string;
    side: "long" | "short";
    primaryTimeFrame: string;
  }
): Promise<PlanScenario | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return undefined;

  const [row] = await db
    .insert(planScenarios)
    .values({ ...data, planId })
    .returning();
  return row;
}

/** `outcome` is written only by closePlan. */
export async function updateScenario(
  userId: number,
  planId: number,
  scenarioId: number,
  patch: {
    name?: string;
    side?: "long" | "short";
    primaryTimeFrame?: string;
    content?: RichTextDoc | null;
  }
): Promise<PlanScenario | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return undefined;

  const [row] = await db
    .update(planScenarios)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(planScenarios.id, scenarioId), eq(planScenarios.planId, planId))
    )
    .returning();
  return row;
}

/** Returns false when the plan or scenario does not exist. */
export async function deleteScenario(
  userId: number,
  planId: number,
  scenarioId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return false;

  const deleted = await db
    .delete(planScenarios)
    .where(
      and(eq(planScenarios.id, scenarioId), eq(planScenarios.planId, planId))
    )
    .returning({ id: planScenarios.id });
  return deleted.length > 0;
}

export async function addObservation(
  userId: number,
  planId: number,
  content: RichTextDoc
): Promise<PlanObservation | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return undefined;

  const [row] = await db
    .insert(planObservations)
    .values({ planId, content })
    .returning();
  return row;
}

/** `createdAt` is the observation time and never changes. */
export async function updateObservation(
  userId: number,
  planId: number,
  observationId: number,
  content: RichTextDoc
): Promise<PlanObservation | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return undefined;

  const [row] = await db
    .update(planObservations)
    .set({ content, updatedAt: new Date() })
    .where(
      and(
        eq(planObservations.id, observationId),
        eq(planObservations.planId, planId)
      )
    )
    .returning();
  return row;
}

/** Returns false when the plan or observation does not exist. */
export async function deleteObservation(
  userId: number,
  planId: number,
  observationId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getPlanRow(userId, planId))) return false;

  const deleted = await db
    .delete(planObservations)
    .where(
      and(
        eq(planObservations.id, observationId),
        eq(planObservations.planId, planId)
      )
    )
    .returning({ id: planObservations.id });
  return deleted.length > 0;
}

/**
 * Write every verdict and closedAt atomically. The router has already
 * checked that the verdicts cover exactly the plan's scenarios.
 */
export async function closePlan(
  userId: number,
  planId: number,
  verdicts: { scenarioId: number; outcome: ScenarioOutcome }[]
): Promise<Plan | undefined> {
  return runInSqliteTransaction(async db => {
    const [owned] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);
    if (!owned) return undefined;

    const now = new Date();
    for (const verdict of verdicts) {
      await db
        .update(planScenarios)
        .set({ outcome: verdict.outcome, updatedAt: now })
        .where(
          and(
            eq(planScenarios.id, verdict.scenarioId),
            eq(planScenarios.planId, planId)
          )
        );
    }
    const [row] = await db
      .update(plans)
      .set({ closedAt: now, updatedAt: now })
      .where(eq(plans.id, planId))
      .returning();
    return row;
  });
}

/** Clears closedAt; stored outcomes stay as the next close's pre-fill. */
export async function reopenPlan(
  userId: number,
  planId: number
): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .update(plans)
    .set({ closedAt: null, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .returning();
  return row;
}

/** Delete a plan with its images, observations and scenarios, atomically. */
export async function deletePlan(
  userId: number,
  planId: number
): Promise<boolean> {
  return runInSqliteTransaction(async db => {
    const [owned] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);
    if (!owned) return false;

    await db
      .delete(images)
      .where(
        and(
          eq(images.ownerKind, "plan"),
          eq(images.ownerId, planId),
          eq(images.userId, userId)
        )
      );
    await db
      .delete(planObservations)
      .where(eq(planObservations.planId, planId));
    await db.delete(planScenarios).where(eq(planScenarios.planId, planId));
    await db.delete(plans).where(eq(plans.id, planId));
    return true;
  });
}

/** Distinct synced trade symbols, for the plan symbol suggestions. */
export async function listTradeSymbols(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(asc(trades.symbol));
  return rows.map(row => row.symbol);
}

// ============ Images ============
// Metadata reads never select `bytes`.

export async function findImageBySha(
  userId: number,
  ownerKind: ImageOwnerKind,
  ownerId: number,
  sha256: string
): Promise<{ id: number } | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [row] = await db
    .select({ id: images.id })
    .from(images)
    .where(
      and(
        eq(images.userId, userId),
        eq(images.ownerKind, ownerKind),
        eq(images.ownerId, ownerId),
        eq(images.sha256, sha256)
      )
    )
    .limit(1);
  return row;
}

/**
 * Throws on an (ownerKind, ownerId, sha256) unique violation; the caller
 * re-selects.
 */
export async function insertImage(row: InsertImage): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [inserted] = await db
    .insert(images)
    .values(row)
    .returning({ id: images.id });
  return inserted;
}

export async function getImage(
  userId: number,
  imageId: number
): Promise<{ mime: string; sha256: string; bytes: Buffer } | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [row] = await db
    .select({ mime: images.mime, sha256: images.sha256, bytes: images.bytes })
    .from(images)
    .where(and(eq(images.id, imageId), eq(images.userId, userId)))
    .limit(1);
  return row;
}

// ============ Review Agent: conversations / messages / settings ============

export async function getConversationById(
  id: number,
  userId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);

  return rows[0];
}

export async function getConversationByTrade(
  userId: number,
  tradeId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.userId, userId), eq(conversations.tradeId, tradeId))
    )
    .limit(1);

  return rows[0];
}

export async function getOrCreateConversation(params: {
  userId: number;
  tradeId: number;
  providerId: string;
  model: string;
}): Promise<Conversation> {
  return runInSqliteTransaction(async db => {
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, params.userId),
          eq(conversations.tradeId, params.tradeId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const inserted = await db
      .insert(conversations)
      .values({
        userId: params.userId,
        tradeId: params.tradeId,
        providerId: params.providerId,
        model: params.model,
      })
      .returning();

    if (!inserted[0]) {
      throw new Error("Failed to create conversation");
    }
    return inserted[0];
  });
}

export async function appendMessage(params: {
  conversationId: number;
  role: "system" | "user" | "assistant" | "tool";
  /** Serialized JSON payload. Callers are responsible for JSON.stringify. */
  content: string;
  /** JSON-stringified ToolCall[] for assistant turns that asked for tools. */
  toolCalls?: string | null;
  /** Ties a role="tool" turn back to the assistant's ToolCall.id. */
  toolCallId?: string | null;
}): Promise<Message> {
  return runInSqliteTransaction(async db => {
    const inserted = await db
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        toolCalls: params.toolCalls ?? null,
        toolCallId: params.toolCallId ?? null,
      })
      .returning();

    if (!inserted[0]) {
      throw new Error("Failed to append message");
    }

    // Bump conversation.updatedAt so list views can sort by recent activity.
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, params.conversationId));

    return inserted[0];
  });
}

/**
 * List a conversation's messages, scoped by userId via a JOIN guard so a
 * caller cannot read another user's transcript by guessing a conversationId.
 */
export async function listMessages(params: {
  conversationId: number;
  userId: number;
}): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.conversationId, params.conversationId),
        eq(conversations.userId, params.userId)
      )
    )
    .orderBy(asc(messages.createdAt), asc(messages.id));

  return rows.map(row => row.message);
}

// ============ Pre-trade planning sessions ============

export async function createPreTrade(
  input: Omit<InsertPreTrade, "id" | "createdAt" | "updatedAt">
): Promise<PreTrade> {
  return runInSqliteTransaction(async db => {
    const inserted = await db.insert(preTrades).values(input).returning();
    if (!inserted[0]) {
      throw new Error("Failed to create pre-trade");
    }
    return inserted[0];
  });
}

export async function getPreTradeById(
  id: number,
  userId: number
): Promise<PreTrade | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(preTrades)
    .where(and(eq(preTrades.id, id), eq(preTrades.userId, userId)))
    .limit(1);

  return rows[0];
}

export async function listPreTradesByUser(
  userId: number,
  limit: number = 50
): Promise<PreTrade[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(preTrades)
    .where(eq(preTrades.userId, userId))
    .orderBy(desc(preTrades.createdAt))
    .limit(limit);
}

export async function getConversationByPreTrade(
  userId: number,
  preTradeId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.preTradeId, preTradeId)
      )
    )
    .limit(1);

  return rows[0];
}

export async function getOrCreateConversationForPreTrade(params: {
  userId: number;
  preTradeId: number;
  providerId: string;
  model: string;
}): Promise<Conversation> {
  return runInSqliteTransaction(async db => {
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, params.userId),
          eq(conversations.preTradeId, params.preTradeId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const inserted = await db
      .insert(conversations)
      .values({
        userId: params.userId,
        preTradeId: params.preTradeId,
        providerId: params.providerId,
        model: params.model,
      })
      .returning();

    if (!inserted[0]) {
      throw new Error("Failed to create pre-trade conversation");
    }
    return inserted[0];
  });
}

export async function getAgentSettings(
  userId: number
): Promise<AgentSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function upsertAgentSettings(
  userId: number,
  patch: Partial<Omit<InsertAgentSettings, "userId" | "updatedAt">>
): Promise<AgentSettings> {
  return runInSqliteTransaction(async db => {
    const now = new Date();
    const insertValues: InsertAgentSettings = {
      userId,
      defaultProvider: patch.defaultProvider ?? "deepseek",
      providerConfigs: patch.providerConfigs ?? "",
      enabledSkillIds: patch.enabledSkillIds ?? [],
      updatedAt: now,
    };

    const updateSet: Record<string, unknown> = { updatedAt: now };
    if (patch.defaultProvider !== undefined) {
      updateSet.defaultProvider = patch.defaultProvider;
    }
    if (patch.providerConfigs !== undefined) {
      updateSet.providerConfigs = patch.providerConfigs;
    }
    if (patch.enabledSkillIds !== undefined) {
      updateSet.enabledSkillIds = patch.enabledSkillIds;
    }

    await db
      .insert(agentSettings)
      .values(insertValues)
      .onConflictDoUpdate({ target: agentSettings.userId, set: updateSet });

    const result = await db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.userId, userId))
      .limit(1);

    if (!result[0]) {
      throw new Error("Failed to upsert agent settings");
    }
    return result[0];
  });
}
