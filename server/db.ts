import { eq, desc, asc, and, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, transactions, InsertTransaction, Transaction,
  tradingElements, InsertTradingElement, TradingElement,
  tradingSystems, InsertTradingSystem, TradingSystem,
  tradingSystemElements, InsertTradingSystemElement,
  transactionElements, InsertTransactionElement
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ User Settings ============

export async function updateUserInitialBalance(userId: number, initialBalance: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
    .set({ initialBalance })
    .where(eq(users.id, userId));
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setActiveTradingSystem(userId: number, systemId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
    .set({ activeTradingSystemId: systemId })
    .where(eq(users.id, userId));
}

// ============ Trading Elements ============

export async function createTradingElement(data: InsertTradingElement): Promise<TradingElement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(tradingElements).values(data);
  const insertId = result[0].insertId;
  
  const [newElement] = await db.select().from(tradingElements).where(eq(tradingElements.id, insertId));
  return newElement;
}

export async function getTradingElementById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(tradingElements)
    .where(and(eq(tradingElements.id, id), eq(tradingElements.userId, userId)))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function getTradingElementsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(tradingElements)
    .where(eq(tradingElements.userId, userId))
    .orderBy(asc(tradingElements.name));
}

export async function updateTradingElement(id: number, userId: number, data: Partial<InsertTradingElement>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(tradingElements)
    .set(data)
    .where(and(eq(tradingElements.id, id), eq(tradingElements.userId, userId)));
  
  return getTradingElementById(id, userId);
}

export async function deleteTradingElement(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // First remove from any trading systems
  await db.delete(tradingSystemElements)
    .where(eq(tradingSystemElements.tradingElementId, id));
  
  // Then delete the element
  await db.delete(tradingElements)
    .where(and(eq(tradingElements.id, id), eq(tradingElements.userId, userId)));
}

// ============ Trading Systems ============

export async function createTradingSystem(
  data: InsertTradingSystem, 
  elementIds: number[]
): Promise<TradingSystem & { elements: TradingElement[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(tradingSystems).values(data);
  const insertId = result[0].insertId;
  
  // Add element associations
  if (elementIds.length > 0) {
    await db.insert(tradingSystemElements).values(
      elementIds.map(elementId => ({
        tradingSystemId: insertId,
        tradingElementId: elementId,
      }))
    );
  }
  
  const [newSystem] = await db.select().from(tradingSystems).where(eq(tradingSystems.id, insertId));
  const elements = await getSystemElements(insertId);
  
  return { ...newSystem, elements };
}

export async function getTradingSystemById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
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
  
  const systems = await db.select()
    .from(tradingSystems)
    .where(eq(tradingSystems.userId, userId))
    .orderBy(desc(tradingSystems.isActive), asc(tradingSystems.name));
  
  // Get elements for each system
  const systemsWithElements = await Promise.all(
    systems.map(async (system) => {
      const elements = await getSystemElements(system.id);
      return { ...system, elements };
    })
  );
  
  return systemsWithElements;
}

export async function getSystemElements(systemId: number): Promise<TradingElement[]> {
  const db = await getDb();
  if (!db) return [];
  
  const junctions = await db.select()
    .from(tradingSystemElements)
    .where(eq(tradingSystemElements.tradingSystemId, systemId));
  
  if (junctions.length === 0) return [];
  
  const elementIds = junctions.map(j => j.tradingElementId);
  
  return db.select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
}

export async function updateTradingSystem(
  id: number, 
  userId: number, 
  data: Partial<InsertTradingSystem>,
  elementIds?: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(tradingSystems)
    .set(data)
    .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));
  
  // Update element associations if provided
  if (elementIds !== undefined) {
    // Remove existing associations
    await db.delete(tradingSystemElements)
      .where(eq(tradingSystemElements.tradingSystemId, id));
    
    // Add new associations
    if (elementIds.length > 0) {
      await db.insert(tradingSystemElements).values(
        elementIds.map(elementId => ({
          tradingSystemId: id,
          tradingElementId: elementId,
        }))
      );
    }
  }
  
  return getTradingSystemById(id, userId);
}

export async function deleteTradingSystem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Remove element associations
  await db.delete(tradingSystemElements)
    .where(eq(tradingSystemElements.tradingSystemId, id));
  
  // Clear active system reference if this was active
  await db.update(users)
    .set({ activeTradingSystemId: null })
    .where(and(eq(users.id, userId), eq(users.activeTradingSystemId, id)));
  
  // Delete the system
  await db.delete(tradingSystems)
    .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));
}

export async function activateTradingSystem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Deactivate all systems for this user
  await db.update(tradingSystems)
    .set({ isActive: 0 })
    .where(eq(tradingSystems.userId, userId));
  
  // Activate the selected system
  await db.update(tradingSystems)
    .set({ isActive: 1 })
    .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));
  
  // Update user's active system reference
  await setActiveTradingSystem(userId, id);
  
  return getTradingSystemById(id, userId);
}

export async function deactivateTradingSystem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(tradingSystems)
    .set({ isActive: 0 })
    .where(and(eq(tradingSystems.id, id), eq(tradingSystems.userId, userId)));
  
  // Clear user's active system reference
  await setActiveTradingSystem(userId, null);
}

export async function getActiveTradingSystem(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(tradingSystems)
    .where(and(eq(tradingSystems.userId, userId), eq(tradingSystems.isActive, 1)))
    .limit(1);
  
  if (result.length === 0) return undefined;
  
  const elements = await getSystemElements(result[0].id);
  return { ...result[0], elements };
}

// ============ Transaction Queries ============

export async function createTransaction(data: InsertTransaction): Promise<Transaction> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(transactions).values(data);
  const insertId = result[0].insertId;
  
  const [newTransaction] = await db.select().from(transactions).where(eq(transactions.id, insertId));
  return newTransaction;
}

export async function getTransactionById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function getTransactionsByUserId(
  userId: number,
  options?: {
    sortBy?: 'createdAt' | 'startTime' | 'endTime' | 'returnAmount';
    sortOrder?: 'asc' | 'desc';
    outcome?: 'win' | 'loss' | 'breakeven';
    direction?: 'long' | 'short';
    tradingPair?: string;
    isReviewed?: boolean;
    tradingSystemId?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(transactions.userId, userId)];
  
  if (options?.outcome) {
    conditions.push(eq(transactions.outcome, options.outcome));
  }
  if (options?.direction) {
    conditions.push(eq(transactions.direction, options.direction));
  }
  if (options?.tradingPair) {
    conditions.push(eq(transactions.tradingPair, options.tradingPair));
  }
  if (options?.isReviewed !== undefined) {
    conditions.push(eq(transactions.isReviewed, options.isReviewed ? 1 : 0));
  }
  if (options?.tradingSystemId !== undefined) {
    conditions.push(eq(transactions.tradingSystemId, options.tradingSystemId));
  }
  
  const sortColumn = options?.sortBy || 'createdAt';
  const sortFn = options?.sortOrder === 'asc' ? asc : desc;
  
  const columnMap = {
    createdAt: transactions.createdAt,
    startTime: transactions.startTime,
    endTime: transactions.endTime,
    returnAmount: transactions.returnAmount,
  };
  
  return db.select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(sortFn(columnMap[sortColumn]));
}

export async function updateTransaction(id: number, userId: number, data: Partial<InsertTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(transactions)
    .set(data)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  
  return getTransactionById(id, userId);
}

export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getLastTransaction(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function getConsecutiveLosses(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  // Get recent transactions ordered by creation time (newest first)
  const recentTransactions = await db.select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  
  let consecutiveLosses = 0;
  for (const tx of recentTransactions) {
    if (tx.outcome === 'loss') {
      consecutiveLosses++;
    } else {
      break; // Stop counting when we hit a non-loss
    }
  }
  
  return consecutiveLosses;
}

export async function getCurrentBalance(userId: number, initialBalance: string): Promise<string> {
  const db = await getDb();
  if (!db) return initialBalance;
  
  // Sum all returns
  const result = await db.select({
    totalReturn: sql<string>`COALESCE(SUM(${transactions.returnAmount}), 0)`,
  })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  
  const totalReturn = parseFloat(result[0]?.totalReturn || '0');
  const initial = parseFloat(initialBalance || '0');
  
  return (initial + totalReturn).toFixed(2);
}

export async function getStatistics(userId: number, initialBalance: string) {
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
      originalBalance: parseFloat(initialBalance || '0'),
      latestBalance: parseFloat(initialBalance || '0'),
    };
  }
  
  const allTransactions = await db.select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.createdAt));
  
  const winCount = allTransactions.filter(t => t.outcome === 'win').length;
  const lossCount = allTransactions.filter(t => t.outcome === 'loss').length;
  const breakevenCount = allTransactions.filter(t => t.outcome === 'breakeven').length;
  const totalTrades = allTransactions.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
  
  // Calculate profits and losses
  const profits = allTransactions
    .filter(t => parseFloat(t.returnAmount) > 0)
    .map(t => parseFloat(t.returnAmount));
  const losses = allTransactions
    .filter(t => parseFloat(t.returnAmount) < 0)
    .map(t => parseFloat(t.returnAmount));
  
  const totalProfit = profits.reduce((sum, p) => sum + p, 0);
  const totalLoss = Math.abs(losses.reduce((sum, l) => sum + l, 0));
  const avgProfit = profits.length > 0 ? totalProfit / profits.length : 0;
  const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
  
  // Total reward (net of all returns)
  const totalReward = allTransactions.reduce((sum, t) => sum + parseFloat(t.returnAmount), 0);
  
  // Calculate max losing streak
  let maxLosingStreak = 0;
  let currentStreak = 0;
  for (const t of allTransactions) {
    if (t.outcome === 'loss') {
      currentStreak++;
      maxLosingStreak = Math.max(maxLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  const originalBalance = parseFloat(initialBalance || '0');
  const latestBalance = originalBalance + totalReward;
  
  return {
    winCount,
    lossCount,
    breakevenCount,
    winRate: parseFloat(winRate.toFixed(2)),
    totalTrades,
    avgProfit: parseFloat(avgProfit.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    totalReward: parseFloat(totalReward.toFixed(2)),
    losingStreak: maxLosingStreak,
    originalBalance,
    latestBalance: parseFloat(latestBalance.toFixed(2)),
  };
}

export async function getSystemStatistics(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Get all systems for user
  const systems = await getTradingSystemsByUserId(userId);
  
  // Get statistics for each system
  const systemStats = await Promise.all(
    systems.map(async (system) => {
      const systemTransactions = await db.select()
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          eq(transactions.tradingSystemId, system.id)
        ));
      
      const winCount = systemTransactions.filter(t => t.outcome === 'win').length;
      const lossCount = systemTransactions.filter(t => t.outcome === 'loss').length;
      const breakevenCount = systemTransactions.filter(t => t.outcome === 'breakeven').length;
      const totalTrades = systemTransactions.length;
      const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
      
      const totalReturn = systemTransactions.reduce(
        (sum, t) => sum + parseFloat(t.returnAmount), 
        0
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
        winRate: parseFloat(winRate.toFixed(2)),
        totalReturn: parseFloat(totalReturn.toFixed(2)),
      };
    })
  );
  
  return systemStats;
}

export async function getUniqueTradingPairs(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.selectDistinct({ tradingPair: transactions.tradingPair })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  
  return result.map(r => r.tradingPair);
}


// ============ Transaction Elements ============

export async function addElementsToTransaction(transactionId: number, elementIds: number[]) {
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

export async function getTransactionElements(transactionId: number): Promise<TradingElement[]> {
  const db = await getDb();
  if (!db) return [];
  
  const junctions = await db.select()
    .from(transactionElements)
    .where(eq(transactionElements.transactionId, transactionId));
  
  if (junctions.length === 0) return [];
  
  const elementIds = junctions.map(j => j.tradingElementId);
  
  return db.select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
}

export async function removeElementsFromTransaction(transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(transactionElements)
    .where(eq(transactionElements.transactionId, transactionId));
}

export async function calculateConfidenceLevel(elementIds: number[]): Promise<number | null> {
  if (elementIds.length === 0) return null;
  
  const db = await getDb();
  if (!db) return null;
  
  const elements = await db.select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
  
  if (elements.length === 0) return null;
  
  // Calculate average confidence level from selected elements
  const totalConfidence = elements.reduce((sum, el) => sum + (el.confidenceLevel || 50), 0);
  return Math.round(totalConfidence / elements.length);
}

export async function getElementsByIds(elementIds: number[]): Promise<TradingElement[]> {
  if (elementIds.length === 0) return [];
  
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(tradingElements)
    .where(inArray(tradingElements.id, elementIds));
}
