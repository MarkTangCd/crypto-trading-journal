import { sql } from "drizzle-orm";
import {
  blob,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Emotion, ImageOwnerKind } from "../shared/const";
import type { RichTextDoc } from "../shared/richText";

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
 * Trading accounts - users can have multiple linked exchange accounts, each with its own synced trades
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
    /** Exchange the account is linked to; v1 always binance */
    exchange: text("exchange").$type<"binance">().notNull().default("binance"),
    /** API key ciphertext from encrypt() in server/agents/secrets.ts */
    apiKey: text("apiKey").notNull(),
    /** API secret ciphertext, same */
    apiSecret: text("apiSecret").notNull(),
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
 * Trading plan: what the trader expects one symbol to do. Belongs to the
 * user, not to an account. State is derived from `closedAt`: null = open.
 */
export const plans = sqliteTable(
  "plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Uppercase trading pair, TRADING_PAIR_RE */
    symbol: text("symbol").notNull(),
    /** Rich text; null = empty */
    marketContext: text("marketContext", { mode: "json" }).$type<RichTextDoc>(),
    /** Set by close, cleared by reopen; null while open */
    closedAt: integer("closedAt", { mode: "timestamp_ms" }),
    /** Record creation timestamp */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Bumped only when this row changes */
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [index("plans_user_closed_idx").on(table.userId, table.closedAt)]
);

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

/**
 * Scenario of a plan. Listed by id asc (lettered a, b, c… at render); no
 * manual reorder. `outcome` is written only by closing the plan.
 */
export const planScenarios = sqliteTable(
  "plan_scenarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Owning plan; no FK, cascaded in application code */
    planId: integer("planId").notNull(),
    /** Trimmed, 1..SCENARIO_NAME_MAX chars */
    name: text("name").notNull(),
    side: text("side").$type<"long" | "short">().notNull(),
    /** One of SCENARIO_TIME_FRAMES */
    primaryTimeFrame: text("primaryTimeFrame").notNull(),
    /** Rich text; null = empty */
    content: text("content", { mode: "json" }).$type<RichTextDoc>(),
    /** Verdict from the last close; null until first closed */
    outcome: text("outcome").$type<"triggered" | "invalidated">(),
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
    check("plan_scenarios_side_check", sql`${table.side} in ('long', 'short')`),
    check(
      "plan_scenarios_time_frame_check",
      sql`${table.primaryTimeFrame} in ('15m', '30m', '1H', '4H', '12H', '1D')`
    ),
    check(
      "plan_scenarios_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('triggered', 'invalidated')`
    ),
    index("plan_scenarios_plan_idx").on(table.planId),
  ]
);

export type PlanScenario = typeof planScenarios.$inferSelect;
export type InsertPlanScenario = typeof planScenarios.$inferInsert;

/**
 * Observation logged while a plan is open. `createdAt` is the observation
 * time and is never updated.
 */
export const planObservations = sqliteTable(
  "plan_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Owning plan; no FK, cascaded in application code */
    planId: integer("planId").notNull(),
    /** Rich text; never empty */
    content: text("content", { mode: "json" }).$type<RichTextDoc>().notNull(),
    /** Observation time (server clock) */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Record update timestamp */
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    index("plan_observations_plan_created_idx").on(
      table.planId,
      table.createdAt
    ),
  ]
);

export type PlanObservation = typeof planObservations.$inferSelect;
export type InsertPlanObservation = typeof planObservations.$inferInsert;

/**
 * Image owned by a plan, journal entry or setup (rich text or a journal
 * screenshot slot), stored as a BLOB (decision-3). Insert-only; deleted with
 * its owner. Metadata reads never select `bytes`.
 */
export const images = sqliteTable(
  "images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table; GET filters by it */
    userId: integer("userId").notNull(),
    /** Owner row kind, one of IMAGE_OWNER_KINDS */
    ownerKind: text("ownerKind").$type<ImageOwnerKind>().notNull(),
    /** Owner row id within ownerKind; no FK, cascaded in application code */
    ownerId: integer("ownerId").notNull(),
    /** Hex sha256 of bytes */
    sha256: text("sha256").notNull(),
    /** Sniffed type, one of IMAGE_MIME_TYPES */
    mime: text("mime").notNull(),
    /** Byte length */
    size: integer("size").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    /** Record creation timestamp */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    check(
      "images_mime_check",
      sql`${table.mime} in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')`
    ),
    check(
      "images_owner_kind_check",
      sql`${table.ownerKind} in ('plan', 'journal_entry', 'setup')`
    ),
    // Dedupe backstop for concurrent uploads of the same bytes.
    uniqueIndex("images_owner_sha_unique").on(
      table.ownerKind,
      table.ownerId,
      table.sha256
    ),
    index("images_user_idx").on(table.userId),
  ]
);

export type Image = typeof images.$inferSelect;
export type InsertImage = typeof images.$inferInsert;

/**
 * Journal entry: one trade idea across one or more linked trades on one
 * symbol and account. State is derived from `reviewedAt`: null = unreviewed.
 */
export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** From the first linked trade; immutable */
    accountId: integer("accountId").notNull(),
    /** From the first linked trade; immutable */
    symbol: text("symbol").notNull(),
    /** Text decimal > 0; null = not set */
    plannedEntry: text("plannedEntry"),
    /** Text decimal > 0; null = not set */
    plannedStopLoss: text("plannedStopLoss"),
    /** Text decimal > 0; null = not set */
    plannedTakeProfit: text("plannedTakeProfit"),
    /** One of EMOTIONS; null = not set */
    emotion: text("emotion").$type<Emotion>(),
    /** Recording rich text; null = empty */
    entryReason: text("entryReason", { mode: "json" }).$type<RichTextDoc>(),
    /** Recording rich text; null = empty */
    marketContext: text("marketContext", { mode: "json" }).$type<RichTextDoc>(),
    /** Recording rich text; null = empty */
    invalidation: text("invalidation", { mode: "json" }).$type<RichTextDoc>(),
    /** Review rich text; null = empty */
    mistakes: text("mistakes", { mode: "json" }).$type<RichTextDoc>(),
    /** Review rich text: rules followed or broken; null = empty */
    rules: text("rules", { mode: "json" }).$type<RichTextDoc>(),
    /** Review rich text; null = empty */
    managementDecisions: text("managementDecisions", {
      mode: "json",
    }).$type<RichTextDoc>(),
    /** Review rich text: notes for next time; null = empty */
    nextTime: text("nextTime", { mode: "json" }).$type<RichTextDoc>(),
    /** Ordered image ids of the before slot (recording) */
    beforeImageIds: text("beforeImageIds", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Ordered image ids of the after slot (review) */
    afterImageIds: text("afterImageIds", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Set by markReviewed, cleared by reopen; null while unreviewed */
    reviewedAt: integer("reviewedAt", { mode: "timestamp_ms" }),
    /** Record creation timestamp; internal */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Bumped only when this row changes */
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    check(
      "journal_entries_emotion_check",
      sql`${table.emotion} is null or ${table.emotion} in ('fear', 'greed', 'frustration', 'impatience', 'hesitation', 'overconfidence', 'revenge', 'boredom', 'stress', 'fomo')`
    ),
    index("journal_entries_user_idx").on(table.userId),
  ]
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

/** Trade linked to a journal entry; a trade belongs to at most one entry. */
export const journalEntryTrades = sqliteTable(
  "journal_entry_trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Owning entry; no FK, cascaded in application code */
    entryId: integer("entryId").notNull(),
    /** Linked trade; no FK */
    tradeId: integer("tradeId").notNull(),
  },
  table => [
    uniqueIndex("journal_entry_trades_trade_unique").on(table.tradeId),
    index("journal_entry_trades_entry_idx").on(table.entryId),
  ]
);

export type JournalEntryTrade = typeof journalEntryTrades.$inferSelect;
export type InsertJournalEntryTrade = typeof journalEntryTrades.$inferInsert;

/**
 * Setup: a named pattern the trader trades, with its entry triggers. Name is
 * unique per user case-insensitively; a setup in use cannot be deleted.
 */
export const setups = sqliteTable(
  "setups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
    /** Trimmed, 1..SETUP_NAME_MAX chars */
    name: text("name").notNull(),
    /** Rich text; null = empty */
    description: text("description", { mode: "json" }).$type<RichTextDoc>(),
    /** Entry triggers, each trimmed 1..ENTRY_TRIGGER_MAX chars */
    triggers: text("triggers", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Record creation timestamp */
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Bumped only when this row changes */
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    // SQLite lower() folds ASCII only, which is enough here.
    uniqueIndex("setups_user_name_unique").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
);

export type Setup = typeof setups.$inferSelect;
export type InsertSetup = typeof setups.$inferInsert;

/** Setup recorded on a journal entry. */
export const journalEntrySetups = sqliteTable(
  "journal_entry_setups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Owning entry; no FK, cascaded in application code */
    entryId: integer("entryId").notNull(),
    /** Linked setup; no FK */
    setupId: integer("setupId").notNull(),
  },
  table => [
    uniqueIndex("journal_entry_setups_entry_setup_unique").on(
      table.entryId,
      table.setupId
    ),
    index("journal_entry_setups_setup_idx").on(table.setupId),
  ]
);

export type JournalEntrySetup = typeof journalEntrySetups.$inferSelect;
export type InsertJournalEntrySetup = typeof journalEntrySetups.$inferInsert;

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
 * Exactly one of `preTradeId` / `tradeId` is set; the check
 * constraint enforces it so a row can never be orphaned or double-attached.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Foreign key to users table */
    userId: integer("userId").notNull(),
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
      sql`(${table.preTradeId} is not null) + (${table.tradeId} is not null) = 1`
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
