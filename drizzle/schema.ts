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
  },
  table => [check("users_role_check", sql`${table.role} in ('user', 'admin')`)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Trading transactions table - stores all trade records
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
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
    /** Optional TradingView URL */
    tvUrl: text("tvUrl"),
    marketCycle: text("marketCycle"),
    transactionType: text("transactionType"),
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
    check(
      "transactions_market_cycle_check",
      sql`${table.marketCycle} is null or ${table.marketCycle} in ('Trading Range', 'Upward Tight Channel', 'Downward Tight Channel', 'Upward Channel', 'Downward Channel', 'Upward Trend', 'Downward Trend')`
    ),
    check(
      "transactions_transaction_type_check",
      sql`${table.transactionType} is null or ${table.transactionType} in ('Trend', 'Reversal')`
    ),
  ]
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

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
