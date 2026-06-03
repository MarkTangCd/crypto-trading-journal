import { eq, desc, asc, and, inArray, sql } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  InsertUser,
  type User,
  users,
  transactions,
  InsertTransaction,
  Transaction,
  tradingElements,
  InsertTradingElement,
  TradingElement,
  tradingSystems,
  InsertTradingSystem,
  TradingSystem,
  tradingSystemElements,
  transactionElements,
  accounts,
  InsertAccount,
  Account,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ANONYMOUS_OPEN_ID, ANONYMOUS_USER_NAME } from "@shared/const";
import {
  add as addFixedPoint,
  compare as compareFixedPoint,
  normalize as normalizeFixedPoint,
} from "./_core/fixedPoint";

const ZERO_DECIMAL = "0.00";
const CLOSED_TRADE_STATUSES = ["closed", "reviewed"] as const;
const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

function decimalToCents(value: string): number {
  const normalizedValue = normalizeFixedPoint(value);
  const isNegative = normalizedValue.startsWith("-");
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [wholePart, fractionalPart = "00"] = unsignedValue.split(".");
  const cents = Number(`${wholePart}${fractionalPart}`);

  return isNegative ? cents * -1 : cents;
}

function centsToDecimalNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function addDecimalStrings(values: string[]): string {
  if (values.length === 0) {
    return ZERO_DECIMAL;
  }

  return addFixedPoint(values);
}

let _db: SqliteRemoteDatabase | null = null;
let _sqliteDb: DatabaseSync | null = null;
let _anonymousUserPromise: Promise<User> | null = null;

async function runInSqliteTransaction<T>(
  operation: (db: SqliteRemoteDatabase) => Promise<T>
): Promise<T> {
  const db = await getDb();
  if (!db || !_sqliteDb) {
    throw new Error("Database not available");
  }

  _sqliteDb.exec("BEGIN");
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
}

function getLastInsertRowId(): number {
  if (!_sqliteDb) {
    throw new Error("Database not available");
  }

  const row = _sqliteDb.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number | bigint;
  };
  return Number(row.id);
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

  if (existingTables.length > 0) {
    return;
  }

  await migrate(
    db,
    async migrationQueries => {
      const queries = migrationQueries.filter(query => query.trim().length > 0);
      if (queries.length === 0) {
        return;
      }

      _sqliteDb!.exec("BEGIN");
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

// ============ User Settings ============

export async function updateUserInitialBalance(
  userId: number,
  initialBalance: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ initialBalance, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setActiveTradingSystem(
  userId: number,
  systemId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ activeTradingSystemId: systemId, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ============ Trading Elements ============

export async function createTradingElement(
  data: InsertTradingElement
): Promise<TradingElement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tradingElements).values(data).returning();

  return result[0];
}

export async function getTradingElementById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tradingElements)
    .where(and(eq(tradingElements.id, id), eq(tradingElements.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getTradingElementsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(tradingElements)
    .where(eq(tradingElements.userId, userId))
    .orderBy(asc(tradingElements.name));
}

export async function updateTradingElement(
  id: number,
  userId: number,
  data: Partial<InsertTradingElement>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(tradingElements)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tradingElements.id, id), eq(tradingElements.userId, userId)));

  return getTradingElementById(id, userId);
}

export async function deleteTradingElement(id: number, userId: number) {
  await runInSqliteTransaction(async db => {
    await db
      .delete(tradingSystemElements)
      .where(eq(tradingSystemElements.tradingElementId, id));

    await db
      .delete(tradingElements)
      .where(
        and(eq(tradingElements.id, id), eq(tradingElements.userId, userId))
      );
  });
}

// ============ Trading Systems ============

export async function createTradingSystem(
  data: InsertTradingSystem,
  elementIds: number[]
): Promise<TradingSystem & { elements: TradingElement[] }> {
  const { systemId } = await runInSqliteTransaction(async db => {
    await db.insert(tradingSystems).values(data);
    const newSystemId = getLastInsertRowId();

    if (elementIds.length > 0) {
      await db.insert(tradingSystemElements).values(
        elementIds.map(elementId => ({
          tradingSystemId: newSystemId,
          tradingElementId: elementId,
        }))
      );
    }

    return { systemId: newSystemId };
  });

  const createdSystem = await getTradingSystemById(systemId, data.userId);
  if (!createdSystem) {
    throw new Error("Failed to load newly created trading system");
  }

  return createdSystem;
}

export async function getTradingSystemById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tradingSystems)
    .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)))
    .limit(1);

  if (result.length === 0) return undefined;

  const elements = await getSystemElements(id);
  return { ...result[0], elements };
}

export async function getTradingSystemsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const systems = await db
    .select()
    .from(tradingSystems)
    .where(eq(tradingSystems.userId, userId))
    .orderBy(desc(tradingSystems.isActive), asc(tradingSystems.name));

  // Get elements for each system
  const systemsWithElements = await Promise.all(
    systems.map(async system => {
      const elements = await getSystemElements(system.id);
      return { ...system, elements };
    })
  );

  return systemsWithElements;
}

export async function getSystemElements(
  systemId: number
): Promise<TradingElement[]> {
  const db = await getDb();
  if (!db) return [];

  const junctions = await db
    .select()
    .from(tradingSystemElements)
    .where(eq(tradingSystemElements.tradingSystemId, systemId));

  if (junctions.length === 0) return [];

  const elementIds = junctions.map(j => j.tradingElementId);

  return db
    .select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
}

export async function updateTradingSystem(
  id: number,
  userId: number,
  data: Partial<InsertTradingSystem>,
  elementIds?: number[]
) {
  await runInSqliteTransaction(async db => {
    await db
      .update(tradingSystems)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));

    if (elementIds !== undefined) {
      await db
        .delete(tradingSystemElements)
        .where(eq(tradingSystemElements.tradingSystemId, id));

      if (elementIds.length > 0) {
        await db.insert(tradingSystemElements).values(
          elementIds.map(elementId => ({
            tradingSystemId: id,
            tradingElementId: elementId,
          }))
        );
      }
    }
  });

  return getTradingSystemById(id, userId);
}

export async function deleteTradingSystem(id: number, userId: number) {
  await runInSqliteTransaction(async db => {
    await db
      .delete(tradingSystemElements)
      .where(eq(tradingSystemElements.tradingSystemId, id));

    await db
      .update(users)
      .set({ activeTradingSystemId: null, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.activeTradingSystemId, id)));

    await db
      .delete(tradingSystems)
      .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));
  });
}

export async function activateTradingSystem(id: number, userId: number) {
  await runInSqliteTransaction(async db => {
    await db
      .update(tradingSystems)
      .set({ isActive: 0, updatedAt: new Date() })
      .where(eq(tradingSystems.userId, userId));

    await db
      .update(tradingSystems)
      .set({ isActive: 1, updatedAt: new Date() })
      .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));

    await db
      .update(users)
      .set({ activeTradingSystemId: id, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });

  return getTradingSystemById(id, userId);
}

export async function deactivateTradingSystem(id: number, userId: number) {
  await runInSqliteTransaction(async db => {
    await db
      .update(tradingSystems)
      .set({ isActive: 0, updatedAt: new Date() })
      .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));

    await db
      .update(users)
      .set({ activeTradingSystemId: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}

export async function getActiveTradingSystem(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tradingSystems)
    .where(
      and(eq(tradingSystems.userId, userId), eq(tradingSystems.isActive, 1))
    )
    .limit(1);

  if (result.length === 0) return undefined;

  const elements = await getSystemElements(result[0].id);
  return { ...result[0], elements };
}

// ============ Transaction Queries ============

export async function createTransaction(
  data: InsertTransaction
): Promise<Transaction> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(transactions).values(data).returning();

  return result[0];
}

export async function getTransactionById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getTransactionsByUserId(
  userId: number,
  options?: {
    accountId?: number;
    sortBy?: "createdAt" | "startTime" | "endTime" | "returnAmount";
    sortOrder?: "asc" | "desc";
    outcome?: "win" | "loss" | "breakeven";
    direction?: "long" | "short";
    tradingPair?: string;
    status?: "open" | "closed" | "reviewed";
    tradingSystemId?: number;
    marketCycle?: string;
    transactionType?: string;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(transactions.userId, userId)];

  if (options?.accountId !== undefined) {
    conditions.push(eq(transactions.accountId, options.accountId));
  }
  if (options?.outcome) {
    conditions.push(eq(transactions.outcome, options.outcome));
  }
  if (options?.direction) {
    conditions.push(eq(transactions.direction, options.direction));
  }
  if (options?.tradingPair) {
    conditions.push(eq(transactions.tradingPair, options.tradingPair));
  }
  if (options?.status) {
    conditions.push(eq(transactions.status, options.status));
  }
  if (options?.tradingSystemId !== undefined) {
    conditions.push(eq(transactions.tradingSystemId, options.tradingSystemId));
  }
  if (options?.marketCycle) {
    conditions.push(eq(transactions.marketCycle, options.marketCycle));
  }
  if (options?.transactionType) {
    conditions.push(eq(transactions.transactionType, options.transactionType));
  }

  const sortColumn = options?.sortBy || "createdAt";
  const sortFn = options?.sortOrder === "asc" ? asc : desc;

  const query = db
    .select()
    .from(transactions)
    .where(and(...conditions));

  if (sortColumn === "returnAmount") {
    const rows = await query;
    const multiplier = options?.sortOrder === "asc" ? 1 : -1;

    rows.sort((left, right) => {
      const leftReturnAmount = left.returnAmount ?? ZERO_DECIMAL;
      const rightReturnAmount = right.returnAmount ?? ZERO_DECIMAL;

      return (
        compareFixedPoint(leftReturnAmount, rightReturnAmount) * multiplier
      );
    });

    return rows;
  }

  const columnMap = {
    createdAt: transactions.createdAt,
    startTime: transactions.startTime,
    endTime: transactions.endTime,
  };

  if (sortColumn === "endTime") {
    const nullsLastOrder =
      options?.sortOrder === "asc"
        ? sql`CASE WHEN ${transactions.endTime} IS NULL THEN 1 ELSE 0 END ASC, ${transactions.endTime} ASC`
        : sql`CASE WHEN ${transactions.endTime} IS NULL THEN 1 ELSE 0 END ASC, ${transactions.endTime} DESC`;
    return query.orderBy(nullsLastOrder);
  }

  return query.orderBy(sortFn(columnMap[sortColumn]));
}

export async function updateTransaction(
  id: number,
  userId: number,
  data: Partial<InsertTransaction>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(transactions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  return getTransactionById(id, userId);
}

export async function migrateTransactionStatus(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const reviewedRows = await db
    .update(transactions)
    .set({ status: "reviewed" })
    .where(eq(sql<number>`isReviewed`, 1))
    .returning({ id: transactions.id });

  const closedRows = await db
    .update(transactions)
    .set({ status: "closed" })
    .where(eq(sql<number>`isReviewed`, 0))
    .returning({ id: transactions.id });

  return reviewedRows.length + closedRows.length;
}

export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getLastTransaction(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getConsecutiveLosses(accountId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get recent transactions ordered by creation time (newest first)
  const recentTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        inArray(transactions.status, CLOSED_TRADE_STATUSES)
      )
    )
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  let consecutiveLosses = 0;
  for (const tx of recentTransactions) {
    if (tx.outcome === "loss") {
      consecutiveLosses++;
    } else {
      break; // Stop counting when we hit a non-loss
    }
  }

  return consecutiveLosses;
}

export async function getCurrentBalance(
  accountId: number,
  initialBalance: string
): Promise<string> {
  const db = await getDb();
  if (!db) return initialBalance;

  const returnRows = await db
    .select({ returnAmount: transactions.returnAmount })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        inArray(transactions.status, CLOSED_TRADE_STATUSES)
      )
    );

  const totalReturn = addDecimalStrings(
    returnRows.map(row => row.returnAmount ?? ZERO_DECIMAL)
  );

  return addDecimalStrings([initialBalance || ZERO_DECIMAL, totalReturn]);
}

export async function getStatistics(accountId: number, initialBalance: string) {
  const normalizedInitialBalance = normalizeFixedPoint(
    initialBalance || ZERO_DECIMAL
  );
  const originalBalance = centsToDecimalNumber(
    decimalToCents(normalizedInitialBalance)
  );

  const db = await getDb();
  if (!db) {
    return {
      winCount: 0,
      lossCount: 0,
      breakevenCount: 0,
      winRate: 0,
      totalTrades: 0,
      avgProfit: 0,
      avgLoss: 0,
      totalProfit: 0,
      totalReward: 0,
      losingStreak: 0,
      originalBalance,
      latestBalance: originalBalance,
    };
  }

  const allTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        inArray(transactions.status, CLOSED_TRADE_STATUSES)
      )
    )
    .orderBy(asc(transactions.createdAt));

  const winCount = allTransactions.filter(t => t.outcome === "win").length;
  const lossCount = allTransactions.filter(t => t.outcome === "loss").length;
  const breakevenCount = allTransactions.filter(
    t => t.outcome === "breakeven"
  ).length;
  const totalTrades = allTransactions.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  let totalProfit = ZERO_DECIMAL;
  let totalLoss = ZERO_DECIMAL;
  let totalReward = ZERO_DECIMAL;
  let positiveReturnCount = 0;
  let negativeReturnCount = 0;

  for (const transaction of allTransactions) {
    const returnAmount = transaction.returnAmount ?? ZERO_DECIMAL;

    totalReward = addDecimalStrings([totalReward, returnAmount]);

    const comparison = compareFixedPoint(returnAmount, ZERO_DECIMAL);
    if (comparison > 0) {
      totalProfit = addDecimalStrings([totalProfit, returnAmount]);
      positiveReturnCount += 1;
    } else if (comparison < 0) {
      const absoluteLoss = returnAmount.startsWith("-")
        ? returnAmount.slice(1)
        : returnAmount;

      totalLoss = addDecimalStrings([totalLoss, absoluteLoss]);
      negativeReturnCount += 1;
    }
  }

  const totalProfitCents = decimalToCents(totalProfit);
  const totalLossCents = decimalToCents(totalLoss);
  const totalRewardCents = decimalToCents(totalReward);

  const avgProfit =
    positiveReturnCount > 0
      ? centsToDecimalNumber(Math.round(totalProfitCents / positiveReturnCount))
      : 0;
  const avgLoss =
    negativeReturnCount > 0
      ? centsToDecimalNumber(Math.round(totalLossCents / negativeReturnCount))
      : 0;

  // Calculate max losing streak
  let maxLosingStreak = 0;
  let currentStreak = 0;
  for (const t of allTransactions) {
    if (t.outcome === "loss") {
      currentStreak++;
      maxLosingStreak = Math.max(maxLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const latestBalance = centsToDecimalNumber(
    decimalToCents(normalizedInitialBalance) + totalRewardCents
  );

  return {
    winCount,
    lossCount,
    breakevenCount,
    winRate: Number(winRate.toFixed(2)),
    totalTrades,
    avgProfit,
    avgLoss,
    totalProfit: centsToDecimalNumber(totalProfitCents),
    totalReward: centsToDecimalNumber(totalRewardCents),
    losingStreak: maxLosingStreak,
    originalBalance,
    latestBalance,
  };
}

export async function getSystemStatistics(accountId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get all systems for user
  const systems = await getTradingSystemsByUserId(userId);

  // Get statistics for each system
  const systemStats = await Promise.all(
    systems.map(async system => {
      const systemTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            eq(transactions.tradingSystemId, system.id),
            inArray(transactions.status, CLOSED_TRADE_STATUSES)
          )
        );

      const winCount = systemTransactions.filter(
        t => t.outcome === "win"
      ).length;
      const lossCount = systemTransactions.filter(
        t => t.outcome === "loss"
      ).length;
      const breakevenCount = systemTransactions.filter(
        t => t.outcome === "breakeven"
      ).length;
      const totalTrades = systemTransactions.length;
      const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

      const totalReturn = addDecimalStrings(
        systemTransactions.map(
          transaction => transaction.returnAmount ?? ZERO_DECIMAL
        )
      );

      return {
        systemId: system.id,
        systemName: system.name,
        isActive: system.isActive === 1,
        elements: system.elements,
        winCount,
        lossCount,
        breakevenCount,
        totalTrades,
        winRate: Number(winRate.toFixed(2)),
        totalReturn: centsToDecimalNumber(decimalToCents(totalReturn)),
      };
    })
  );

  return systemStats;
}

export async function getUniqueTradingPairs(
  userId: number,
  accountId?: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(transactions.userId, userId)];
  if (accountId !== undefined) {
    conditions.push(eq(transactions.accountId, accountId));
  }

  const result = await db
    .selectDistinct({ tradingPair: transactions.tradingPair })
    .from(transactions)
    .where(and(...conditions));

  return result.map(r => r.tradingPair);
}

// ============ Transaction Elements ============

export async function addElementsToTransaction(
  transactionId: number,
  elementIds: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (elementIds.length === 0) return;

  await db.insert(transactionElements).values(
    elementIds.map(elementId => ({
      transactionId,
      tradingElementId: elementId,
    }))
  );
}

export async function getTransactionElements(
  transactionId: number
): Promise<TradingElement[]> {
  const db = await getDb();
  if (!db) return [];

  const junctions = await db
    .select()
    .from(transactionElements)
    .where(eq(transactionElements.transactionId, transactionId));

  if (junctions.length === 0) return [];

  const elementIds = junctions.map(j => j.tradingElementId);

  return db
    .select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
}

export async function removeElementsFromTransaction(transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(transactionElements)
    .where(eq(transactionElements.transactionId, transactionId));
}

export async function replaceTransactionElements(
  transactionId: number,
  elementIds: number[]
) {
  const uniqueElementIds = Array.from(new Set(elementIds));

  await runInSqliteTransaction(async db => {
    await db
      .delete(transactionElements)
      .where(eq(transactionElements.transactionId, transactionId));

    if (uniqueElementIds.length > 0) {
      await db.insert(transactionElements).values(
        uniqueElementIds.map(elementId => ({
          transactionId,
          tradingElementId: elementId,
        }))
      );
    }
  });
}

export type AccountScopedInsertTransaction = Omit<
  InsertTransaction,
  "accountId"
> & { accountId: number };

export async function createTransactionWithElements(
  data: AccountScopedInsertTransaction,
  elementIds: number[]
): Promise<Transaction> {
  // Guard: never silently fall back to userId for accountId. Callers must
  // pass the validated accountId for the trade's owning account.
  if (
    data.accountId === null ||
    data.accountId === undefined ||
    Number.isNaN(data.accountId)
  ) {
    throw new Error(
      "createTransactionWithElements requires a valid accountId"
    );
  }

  const insertData: InsertTransaction = {
    ...data,
    accountId: data.accountId,
    status: data.status ?? "open",
    endTime: data.endTime ?? null,
    outcome: data.outcome ?? null,
    riskRewardRatio: data.riskRewardRatio ?? null,
    returnAmount: data.returnAmount ?? null,
    accountBalance: data.accountBalance ?? null,
  };

  const { transactionId } = await runInSqliteTransaction(async db => {
    await db.insert(transactions).values(insertData);
    const newTransactionId = getLastInsertRowId();

    if (elementIds.length > 0) {
      await db.insert(transactionElements).values(
        elementIds.map(elementId => ({
          transactionId: newTransactionId,
          tradingElementId: elementId,
        }))
      );
    }

    return { transactionId: newTransactionId };
  });

  const created = await getTransactionById(transactionId, insertData.userId);
  if (!created) {
    throw new Error("Failed to load newly created transaction");
  }

  return created;
}

export async function deleteTransactionWithElements(
  transactionId: number,
  userId: number
): Promise<void> {
  await runInSqliteTransaction(async db => {
    await db
      .delete(transactionElements)
      .where(eq(transactionElements.transactionId, transactionId));

    await db
      .delete(transactions)
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, userId))
      );
  });
}

export async function calculateConfidenceLevel(
  elementIds: number[]
): Promise<number | null> {
  if (elementIds.length === 0) return null;

  const db = await getDb();
  if (!db) return null;

  const elements = await db
    .select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));

  if (elements.length === 0) return null;

  // Calculate average confidence level from selected elements
  const totalConfidence = elements.reduce(
    (sum, el) => sum + (el.confidenceLevel || 3),
    0
  );
  return parseFloat((totalConfidence / elements.length).toFixed(1));
}

export async function getElementsByIds(
  elementIds: number[]
): Promise<TradingElement[]> {
  if (elementIds.length === 0) return [];

  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
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

export async function deleteAccountWithTransactions(
  id: number,
  userId: number
): Promise<void> {
  const accountCount = await getAccountCount(userId);
  if (accountCount < 2) {
    throw new Error("Cannot delete the last account");
  }

  await runInSqliteTransaction(async db => {
    // Delete transaction_elements for transactions in this account
    const accountTransactions = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.accountId, id), eq(transactions.userId, userId))
      );

    const transactionIds = accountTransactions.map(t => t.id);

    if (transactionIds.length > 0) {
      await db
        .delete(transactionElements)
        .where(inArray(transactionElements.transactionId, transactionIds));
    }

    // Delete all transactions for this account
    await db
      .delete(transactions)
      .where(
        and(eq(transactions.accountId, id), eq(transactions.userId, userId))
      );

    // Delete the account
    await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  });
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
