import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Core user table backing auth flow.
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    openId: text("openId").notNull().unique(),
    name: text("name"),
    email: text("email"),
    loginMethod: text("loginMethod"),
    role: text("role").$type<"user" | "admin">().default("user").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Initial account balance set by user */
    initialBalance: text("initialBalance").default("0"),
    /** Currently active trading system ID */
    activeTradingSystemId: integer("activeTradingSystemId"),
  },
  table => [check("users_role_check", sql`${table.role} in ('user', 'admin')`)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Trading elements (opportunity tags) - e.g., Gap, Double Top/Bottom, CVD divergence
 */
export const tradingElements = sqliteTable("trading_elements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to users table */
  userId: integer("userId").notNull(),
  /** Element name e.g., "Gap", "Double Top/Bottom" */
  name: text("name").notNull(),
  /** Optional description/notes */
  description: text("description"),
  /** Confidence level for this element (0-100) */
  confidenceLevel: integer("confidenceLevel").notNull().default(50),
  /** Record creation timestamp */
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  /** Record update timestamp */
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type TradingElement = typeof tradingElements.$inferSelect;
export type InsertTradingElement = typeof tradingElements.$inferInsert;

/**
 * Trading systems - named strategies with associated elements
 */
export const tradingSystems = sqliteTable("trading_systems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to users table */
  userId: integer("userId").notNull(),
  /** System name */
  name: text("name").notNull(),
  /** Notes/description about the system */
  notes: text("notes"),
  /** Whether this system is active (only one can be active per user) */
  isActive: integer("isActive").notNull().default(0),
  /** Record creation timestamp */
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  /** Record update timestamp */
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type TradingSystem = typeof tradingSystems.$inferSelect;
export type InsertTradingSystem = typeof tradingSystems.$inferInsert;

/**
 * Junction table for trading systems and elements (many-to-many)
 */
export const tradingSystemElements = sqliteTable("trading_system_elements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to trading systems */
  tradingSystemId: integer("tradingSystemId").notNull(),
  /** Foreign key to trading elements */
  tradingElementId: integer("tradingElementId").notNull(),
});

export type TradingSystemElement = typeof tradingSystemElements.$inferSelect;
export type InsertTradingSystemElement =
  typeof tradingSystemElements.$inferInsert;

/**
 * Trading transactions table - stores all trade records
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Foreign key to trading systems (optional, for binding trades to systems) */
    tradingSystemId: integer("tradingSystemId"),
    /** Foreign key to accounts (nullable initially for migration) */
    accountId: integer("accountId"),
    status: text("status").notNull().default("open"),
    /** Account balance at time of trade */
    accountBalance: text("accountBalance"),
    /** Trading pair e.g., BTCUSDT */
    tradingPair: text("tradingPair").notNull(),
    /** Time frame e.g., 1H, 4H, 1D */
    timeFrame: text("timeFrame").notNull(),
    /** Trade start time - stored as UTC timestamp in milliseconds */
    startTime: integer("startTime", { mode: "number" }).notNull(),
    /** Trade end time - stored as UTC timestamp in milliseconds */
    endTime: integer("endTime", { mode: "number" }),
    /** Trade direction: long or short */
    direction: text("direction").$type<"long" | "short">().notNull(),
    /** Trading logic/rationale for the trade */
    tradingLogic: text("tradingLogic").notNull(),
    /** Trade outcome: win, loss, or breakeven */
    outcome: text("outcome").$type<"win" | "loss" | "breakeven">(),
    /** Number of consecutive losses at time of trade */
    consecutiveLosses: integer("consecutiveLosses").default(0),
    /** Risk-reward ratio e.g., 1.5, 2.0 */
    riskRewardRatio: text("riskRewardRatio"),
    /** Return amount - negative for loss, positive for profit */
    returnAmount: text("returnAmount"),
    /** Overall confidence level calculated from selected elements (0-100) */
    confidenceLevel: integer("confidenceLevel"),
    /** Optional TradingView URL */
    tvUrl: text("tvUrl"),
    /** Review feedback text */
    reviewFeedback: text("reviewFeedback"),
    /** Post-review TradingView chart URL */
    reviewChartUrl: text("reviewChartUrl"),
    /** Record creation timestamp */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Record update timestamp */
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    check(
      "transactions_status_check",
      sql`${table.status} in ('open', 'closed', 'reviewed')`
    ),
    check(
      "transactions_direction_check",
      sql`${table.direction} in ('long', 'short')`
    ),
    check(
      "transactions_outcome_check",
      sql`${table.outcome} in ('win', 'loss', 'breakeven')`
    ),
  ]
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Junction table for transactions and elements (many-to-many)
 * Stores which trading elements were used in each transaction
 */
export const transactionElements = sqliteTable("transaction_elements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to transactions */
  transactionId: integer("transactionId").notNull(),
  /** Foreign key to trading elements */
  tradingElementId: integer("tradingElementId").notNull(),
});

export type TransactionElement = typeof transactionElements.$inferSelect;
export type InsertTransactionElement = typeof transactionElements.$inferInsert;

/**
 * Trading accounts - users can have multiple accounts with separate balances and transactions
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to users table */
  userId: integer("userId").notNull(),
  /** Account nickname e.g., "Main Account", "Swing Trading" */
  name: text("name").notNull(),
  /** Optional notes/description */
  notes: text("notes"),
  /** Initial balance for this account */
  initialBalance: text("initialBalance").notNull().default("0"),
  /** Record creation timestamp */
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  /** Record update timestamp */
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
