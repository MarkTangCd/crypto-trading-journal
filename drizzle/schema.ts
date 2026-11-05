import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
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
export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Account nickname e.g., "Main Account", "Swing Trading" */
    name: text("name").notNull(),
    /** Optional notes/description */
    notes: text("notes"),
    /** Initial balance for this account */
    initialBalance: text("initialBalance").notNull().default("0"),
    /** Exchange the account is linked to; v1 always binance */
    exchange: text("exchange").$type<"binance">().notNull().default("binance"),
    /** API key ciphertext from encrypt() in server/agents/secrets.ts */
    apiKey: text("apiKey"),
    /** API secret ciphertext, same */
    apiSecret: text("apiSecret"),
    /** Last key verification pass - ms timestamp */
    keyVerifiedAt: integer("keyVerifiedAt", { mode: "number" }),
    /** USDT wallet balance - text decimal; null until first sync */
    balanceUsdt: text("balanceUsdt"),
    /** USDT cross unrealized PnL - text decimal; null until first sync */
    unrealizedPnlUsdt: text("unrealizedPnlUsdt"),
    /** Window start of the first backfill - ms; null until first sync */
    backfillStart: integer("backfillStart", { mode: "number" }),
    /** Max income time seen, cursor for new-symbol discovery - ms */
    incomeCursorAt: integer("incomeCursorAt", { mode: "number" }),
    /** End of the last successful sync - ms */
    lastSyncedAt: integer("lastSyncedAt", { mode: "number" }),
    /** Start of the last sync run, success or not - ms */
    lastSyncAttemptAt: integer("lastSyncAttemptAt", { mode: "number" }),
    /** Sync error code of the last run; cleared on success */
    lastSyncErrorCode: text("lastSyncErrorCode"),
    /** Earliest retry time from Retry-After on rate_limited - ms */
    lastSyncRetryAt: integer("lastSyncRetryAt", { mode: "number" }),
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
    check("accounts_exchange_check", sql`${table.exchange} in ('binance')`),
  ]
);

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/**
 * Raw exchange fills plus synthetic seed rows (the position that existed at
 * backfillStart, per symbol + positionSide). Append-only; trades are rebuilt
 * from these on every sync.
 */
export const fills = sqliteTable(
  "fills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Foreign key to accounts */
    accountId: integer("accountId").notNull(),
    /** exchange = fetched fill, seed = synthetic opening position */
    source: text("source").$type<"exchange" | "seed">().notNull(),
    /** Binance userTrades.id as text; seeds use seed@<backfillStart> */
    fillId: text("fillId").notNull(),
    /** Binance orderId; null on seeds */
    orderId: text("orderId"),
    /** Exchange symbol e.g., BTCUSDT */
    symbol: text("symbol").notNull(),
    positionSide: text("positionSide")
      .$type<"BOTH" | "LONG" | "SHORT">()
      .notNull(),
    side: text("side").$type<"BUY" | "SELL">().notNull(),
    /** Fill price - text decimal */
    price: text("price").notNull(),
    /** Base asset quantity - text decimal */
    qty: text("qty").notNull(),
    /** Binance realizedPnl - text decimal; 0 on opening fills and seeds */
    realizedPnl: text("realizedPnl").notNull(),
    /** Raw commission in commissionAsset - text decimal; 0 on seeds */
    commission: text("commission").notNull(),
    /** USDT, BNB, ...; USDT on seeds */
    commissionAsset: text("commissionAsset").notNull(),
    /** Commission converted to USDT at fetch time - text decimal */
    feeUsd: text("feeUsd").notNull(),
    /** Fill time - ms; seeds use backfillStart */
    time: integer("time", { mode: "number" }).notNull(),
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
    check("fills_source_check", sql`${table.source} in ('exchange', 'seed')`),
    check(
      "fills_position_side_check",
      sql`${table.positionSide} in ('BOTH', 'LONG', 'SHORT')`
    ),
    check("fills_side_check", sql`${table.side} in ('BUY', 'SELL')`),
    uniqueIndex("fills_account_symbol_fill_unique").on(
      table.accountId,
      table.symbol,
      table.fillId
    ),
    // Per-symbol fold walks fills in time order.
    index("fills_account_symbol_time_idx").on(
      table.accountId,
      table.symbol,
      table.time
    ),
    index("fills_account_time_idx").on(table.accountId, table.time),
  ]
);

export type Fill = typeof fills.$inferSelect;
export type InsertFill = typeof fills.$inferInsert;

/**
 * Trades rebuilt from fills on every sync. Rows are matched by tradeKey and
 * updated in place, never deleted and reinserted, so conversations.tradeId
 * stays valid.
 */
export const trades = sqliteTable(
  "trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Foreign key to accounts */
    accountId: integer("accountId").notNull(),
    /**
     * <symbol>|<positionSide>#<firstOpeningFillId>, ...#seed@<backfillStart>
     * or ...#<fillId>+flip. Unique per account.
     */
    tradeKey: text("tradeKey").notNull(),
    /** Copied from the account */
    exchange: text("exchange").notNull(),
    /** Exchange symbol e.g., BTCUSDT */
    exchangeSymbol: text("exchangeSymbol").notNull(),
    /** Display pair, uppercase; v1 equals exchangeSymbol */
    symbol: text("symbol").notNull(),
    positionSide: text("positionSide")
      .$type<"BOTH" | "LONG" | "SHORT">()
      .notNull(),
    side: text("side").$type<"long" | "short">().notNull(),
    status: text("status").$type<"open" | "closed">().notNull(),
    /** First opening fill time - ms; written on insert only */
    openTime: integer("openTime", { mode: "number" }).notNull(),
    /** True on seeded trades until the trader edits openTime */
    openTimeApprox: integer("openTimeApprox", { mode: "boolean" }).notNull(),
    /** Time of the fill that returned the position to 0 - ms */
    closeTime: integer("closeTime", { mode: "number" }),
    /** Volume-weighted opening price - text decimal */
    entryPrice: text("entryPrice").notNull(),
    /** Volume-weighted closing price - text decimal; null while nothing closed */
    exitPrice: text("exitPrice"),
    /** Sum of opening qty (base asset) - text decimal */
    quantity: text("quantity").notNull(),
    /** Sum of opening price x qty - text decimal */
    positionSizeUsdt: text("positionSizeUsdt").notNull(),
    /** Sum of fill feeUsd - text decimal */
    feeUsd: text("feeUsd").notNull(),
    /** Sum of fill realizedPnl minus feeUsd - text decimal */
    realizedPnlUsd: text("realizedPnlUsd").notNull(),
    /** From Algo orders while open; frozen at close - text decimal */
    stopLossPrice: text("stopLossPrice"),
    /** Same as stopLossPrice */
    takeProfitPrice: text("takeProfitPrice"),
    /** Last sync that touched the row - ms */
    syncedAt: integer("syncedAt", { mode: "number" }).notNull(),
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
    check("trades_side_check", sql`${table.side} in ('long', 'short')`),
    check("trades_status_check", sql`${table.status} in ('open', 'closed')`),
    uniqueIndex("trades_account_trade_key_unique").on(
      table.accountId,
      table.tradeKey
    ),
    // Hot path: list/stats are scoped by account + status.
    index("trades_account_status_idx").on(table.accountId, table.status),
    // List view orders by openTime (reverse scan for DESC).
    index("trades_account_open_idx").on(table.accountId, table.openTime),
    // Account snapshot walks closed trades newest-first by closeTime,
    // breaking ties on id.
    index("trades_account_close_id_idx").on(
      table.accountId,
      table.closeTime,
      table.id
    ),
  ]
);

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

/**
 * Trading goal: a short free-text intention the trader commits to for the
 * near term. Belongs to the user, not to an account. Status is derived from
 * `completedAt`: null = open, non-null = done.
 */
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Foreign key to users table */
  userId: integer("userId").notNull(),
  /** Goal text, trimmed, 1..200 chars */
  text: text("text").notNull(),
  /** When the goal was marked done; null while open */
  completedAt: integer("completedAt", { mode: "timestamp_ms" }),
  /** Record creation timestamp */
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  /** Record update timestamp */
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = typeof goals.$inferInsert;

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
 * Exactly one of `transactionId` / `preTradeId` / `tradeId` is set; the check
 * constraint enforces it so a row can never be orphaned or double-attached.
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
    /** Foreign key to trades table. Null unless this is a synced-trade review. */
    tradeId: integer("tradeId"),
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
    // Exactly one attachment id must be non-null on every row.
    check(
      "conversations_attachment_xor_check",
      sql`(${table.transactionId} is not null) + (${table.preTradeId} is not null) + (${table.tradeId} is not null) = 1`
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
    // Lookup: open/get-or-create scans by (userId, tradeId).
    index("conversations_user_trade_idx").on(table.userId, table.tradeId),
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
