import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

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
    /** Foreign key to accounts */
    accountId: integer("accountId").notNull(),
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
    /** Legacy trading logic/rationale for the trade */
    tradingLogic: text("tradingLogic").notNull(),
    /** Market context for the trade */
    context: text("context").notNull().default(""),
    /** Ordered trade setup items, stored as SQLite JSON text */
    tradeItems: text("tradeItems", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Trade outcome: win, loss, or breakeven */
    outcome: text("outcome").$type<"win" | "loss" | "breakeven">(),
    /** Number of consecutive losses at time of trade */
    consecutiveLosses: integer("consecutiveLosses").default(0),
    /** Risk-reward ratio e.g., 1.5, 2.0 */
    riskRewardRatio: text("riskRewardRatio"),
    /** Return amount - negative for loss, positive for profit */
    returnAmount: text("returnAmount"),
    /** Planned entry price — text decimal up to 8 decimal places */
    entryPrice: text("entryPrice"),
    /** Planned position size in USDT — text decimal */
    positionSizeUsdt: text("positionSizeUsdt"),
    /** Planned stop loss price — text decimal up to 8 decimal places */
    plannedStopLossPrice: text("plannedStopLossPrice"),
    /** Planned take profit price — text decimal up to 8 decimal places */
    plannedTakeProfitPrice: text("plannedTakeProfitPrice"),
    /** Planned risk/reward ratio derived from entry/SL/TP — computed server-side */
    plannedRiskRewardRatio: text("plannedRiskRewardRatio"),
    /** Exit price recorded at close — text decimal up to 8 decimal places */
    exitPrice: text("exitPrice"),
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
    // Hot path: list/stats are scoped by account + status.
    index("transactions_account_status_idx").on(table.accountId, table.status),
    // List view orders by startTime — SQLite can scan ASC indexes in reverse
    // to satisfy ORDER BY DESC.
    index("transactions_account_start_idx").on(
      table.accountId,
      table.startTime
    ),
    // Account snapshot walks closed trades newest-first by endTime,
    // breaking ties on id. A composite ASC index satisfies the reverse scan.
    index("transactions_account_end_id_idx").on(
      table.accountId,
      table.endTime,
      table.id
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

/**
 * Pre-trade brainstorming session. Written when the user commits to "start
 * discussion" on the /pre-trade page. One row per session; a session may
 * spawn one conversation via `conversations.preTradeId`.
 */
export const preTrades = sqliteTable("pre_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to users table */
  userId: integer("userId").notNull(),
  /** Trading pair e.g., BTCUSDT */
  tradingPair: text("tradingPair").notNull(),
  /** Declared direction. Optional because a pre-trade is exploratory. */
  direction: text("direction").$type<"long" | "short">(),
  /** Main trading timeframe — always included in the payload. */
  primaryTimeFrame: text("primaryTimeFrame").notNull(),
  /** Candle count for the primary timeframe (clamp 20..500). */
  primaryCandleCount: integer("primaryCandleCount").notNull().default(100),
  /**
   * Additional context timeframes. JSON array of `{ tf, candleCount }`.
   * Length 0..4 — combined with primary, max 5 timeframes per session.
   */
  contextTimeframes: text("contextTimeframes", { mode: "json" })
    .$type<Array<{ tf: string; candleCount: number }>>()
    .notNull()
    .default(sql`'[]'`),
  /** Anchor timestamp in ms; when null, backend uses "now" at start time. */
  anchorMs: integer("anchorMs", { mode: "number" }),
  /** Trader's idea (verbatim). */
  idea: text("idea").notNull(),
  /** Record creation timestamp */
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  /** Record update timestamp */
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type PreTrade = typeof preTrades.$inferSelect;
export type InsertPreTrade = typeof preTrades.$inferInsert;

/**
 * AI conversation — either per-trade (review) or per-pre-trade (planning).
 * Exactly one of `transactionId` / `preTradeId` is set; the check constraint
 * enforces XOR so a row can never be orphaned or double-attached.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Foreign key to transactions table. Null when this is a pre-trade thread. */
    transactionId: integer("transactionId"),
    /** Foreign key to pre_trades table. Null when this is a review thread. */
    preTradeId: integer("preTradeId"),
    /** Provider id, e.g. "deepseek" */
    providerId: text("providerId").notNull(),
    /** Model name passed to the provider, e.g. "deepseek-chat" */
    model: text("model").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    // XOR: exactly one attachment id must be non-null on every row.
    check(
      "conversations_attachment_xor_check",
      sql`(${table.transactionId} is not null) <> (${table.preTradeId} is not null)`
    ),
    // Lookup: open/get-or-create scans by (userId, transactionId).
    index("conversations_user_transaction_idx").on(
      table.userId,
      table.transactionId
    ),
    // Lookup: open/get-or-create scans by (userId, preTradeId).
    index("conversations_user_pre_trade_idx").on(
      table.userId,
      table.preTradeId
    ),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Single message within a review conversation.
 * Content holds a JSON payload (text, tool calls, tool results).
 */
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to conversations table */
    conversationId: integer("conversationId").notNull(),
    /** Speaker role */
    role: text("role")
      .$type<"system" | "user" | "assistant" | "tool">()
      .notNull(),
    /** JSON-encoded payload */
    content: text("content").notNull(),
    /**
     * JSON-stringified ToolCall[] when the assistant turn asked the model to
     * invoke tools. Null on all other rows.
     */
    toolCalls: text("toolCalls"),
    /**
     * Ties a role="tool" turn back to the assistant's ToolCall.id. Null on
     * all other rows.
     */
    toolCallId: text("toolCallId"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    check(
      "messages_role_check",
      sql`${table.role} in ('system', 'user', 'assistant', 'tool')`
    ),
    // Hot path: list a conversation's transcript ordered by createdAt.
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Single-tenant agent configuration: default provider, per-provider configs
 * (ciphertext blob keyed by providerId), and enabled skill ids.
 */
export const agentSettings = sqliteTable("agent_settings", {
  /** Primary key — one row per user (single-tenant). */
  userId: integer("userId").primaryKey(),
  /** Default provider id, e.g. "deepseek". */
  defaultProvider: text("defaultProvider").notNull().default("deepseek"),
  /**
   * Encrypted per-provider configs. Plaintext shape (post-decrypt):
   * { [providerId]: { apiKey: string; baseUrl?: string } }
   * Stored as ciphertext text; encryption owned by server/agents/secrets.ts.
   */
  providerConfigs: text("providerConfigs").notNull().default(""),
  /** JSON array of enabled skill ids. */
  enabledSkillIds: text("enabledSkillIds", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type AgentSettings = typeof agentSettings.$inferSelect;
export type InsertAgentSettings = typeof agentSettings.$inferInsert;
