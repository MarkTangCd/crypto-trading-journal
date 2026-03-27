import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Initial account balance set by user */
  initialBalance: decimal("initialBalance", { precision: 18, scale: 2 }).default("0"),
  /** Currently active trading system ID */
  activeTradingSystemId: int("activeTradingSystemId"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Trading elements (opportunity tags) - e.g., Gap, Double Top/Bottom, CVD divergence
 */
export const tradingElements = mysqlTable("trading_elements", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users table */
  userId: int("userId").notNull(),
  /** Element name e.g., "Gap", "Double Top/Bottom" */
  name: varchar("name", { length: 100 }).notNull(),
  /** Optional description/notes */
  description: text("description"),
  /** Confidence level for this element (0-100) */
  confidenceLevel: int("confidenceLevel").notNull().default(50),
  /** Record creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Record update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TradingElement = typeof tradingElements.$inferSelect;
export type InsertTradingElement = typeof tradingElements.$inferInsert;

/**
 * Trading systems - named strategies with associated elements
 */
export const tradingSystems = mysqlTable("trading_systems", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users table */
  userId: int("userId").notNull(),
  /** System name */
  name: varchar("name", { length: 100 }).notNull(),
  /** Notes/description about the system */
  notes: text("notes"),
  /** Whether this system is active (only one can be active per user) */
  isActive: int("isActive").notNull().default(0),
  /** Record creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Record update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TradingSystem = typeof tradingSystems.$inferSelect;
export type InsertTradingSystem = typeof tradingSystems.$inferInsert;

/**
 * Junction table for trading systems and elements (many-to-many)
 */
export const tradingSystemElements = mysqlTable("trading_system_elements", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to trading systems */
  tradingSystemId: int("tradingSystemId").notNull(),
  /** Foreign key to trading elements */
  tradingElementId: int("tradingElementId").notNull(),
});

export type TradingSystemElement = typeof tradingSystemElements.$inferSelect;
export type InsertTradingSystemElement = typeof tradingSystemElements.$inferInsert;

/**
 * Trading transactions table - stores all trade records
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users table */
  userId: int("userId").notNull(),
  /** Foreign key to trading systems (optional, for binding trades to systems) */
  tradingSystemId: int("tradingSystemId"),
  /** Account balance at time of trade */
  accountBalance: decimal("accountBalance", { precision: 18, scale: 2 }).notNull(),
  /** Trading pair e.g., BTCUSDT */
  tradingPair: varchar("tradingPair", { length: 32 }).notNull(),
  /** Time frame e.g., 1H, 4H, 1D */
  timeFrame: varchar("timeFrame", { length: 16 }).notNull(),
  /** Trade start time - stored as UTC timestamp in milliseconds */
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  /** Trade end time - stored as UTC timestamp in milliseconds */
  endTime: bigint("endTime", { mode: "number" }).notNull(),
  /** Trade direction: long or short */
  direction: mysqlEnum("direction", ["long", "short"]).notNull(),
  /** Trading logic/rationale for the trade */
  tradingLogic: text("tradingLogic").notNull(),
  /** Trade outcome: win, loss, or breakeven */
  outcome: mysqlEnum("outcome", ["win", "loss", "breakeven"]).notNull(),
  /** Number of consecutive losses at time of trade */
  consecutiveLosses: int("consecutiveLosses").notNull().default(0),
  /** Risk-reward ratio e.g., 1.5, 2.0 */
  riskRewardRatio: decimal("riskRewardRatio", { precision: 8, scale: 2 }).notNull(),
  /** Return amount - negative for loss, positive for profit */
  returnAmount: decimal("returnAmount", { precision: 18, scale: 2 }).notNull(),
  /** Overall confidence level calculated from selected elements (0-100) */
  confidenceLevel: int("confidenceLevel"),
  /** Optional TradingView URL */
  tvUrl: text("tvUrl"),
  /** Review feedback text */
  reviewFeedback: text("reviewFeedback"),
  /** Post-review TradingView chart URL */
  reviewChartUrl: text("reviewChartUrl"),
  /** Whether the trade has been reviewed */
  isReviewed: int("isReviewed").notNull().default(0),
  /** Record creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Record update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Junction table for transactions and elements (many-to-many)
 * Stores which trading elements were used in each transaction
 */
export const transactionElements = mysqlTable("transaction_elements", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to transactions */
  transactionId: int("transactionId").notNull(),
  /** Foreign key to trading elements */
  tradingElementId: int("tradingElementId").notNull(),
});

export type TransactionElement = typeof transactionElements.$inferSelect;
export type InsertTransactionElement = typeof transactionElements.$inferInsert;
