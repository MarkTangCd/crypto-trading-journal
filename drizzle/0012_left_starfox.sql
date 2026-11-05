CREATE TABLE `fills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accountId` integer NOT NULL,
	`source` text NOT NULL,
	`fillId` text NOT NULL,
	`orderId` text,
	`symbol` text NOT NULL,
	`positionSide` text NOT NULL,
	`side` text NOT NULL,
	`price` text NOT NULL,
	`qty` text NOT NULL,
	`realizedPnl` text NOT NULL,
	`commission` text NOT NULL,
	`commissionAsset` text NOT NULL,
	`feeUsd` text NOT NULL,
	`time` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "fills_source_check" CHECK("fills"."source" in ('exchange', 'seed')),
	CONSTRAINT "fills_position_side_check" CHECK("fills"."positionSide" in ('BOTH', 'LONG', 'SHORT')),
	CONSTRAINT "fills_side_check" CHECK("fills"."side" in ('BUY', 'SELL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fills_account_symbol_fill_unique` ON `fills` (`accountId`,`symbol`,`fillId`);--> statement-breakpoint
CREATE INDEX `fills_account_symbol_time_idx` ON `fills` (`accountId`,`symbol`,`time`);--> statement-breakpoint
CREATE INDEX `fills_account_time_idx` ON `fills` (`accountId`,`time`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accountId` integer NOT NULL,
	`tradeKey` text NOT NULL,
	`exchange` text NOT NULL,
	`exchangeSymbol` text NOT NULL,
	`symbol` text NOT NULL,
	`positionSide` text NOT NULL,
	`side` text NOT NULL,
	`status` text NOT NULL,
	`openTime` integer NOT NULL,
	`openTimeApprox` integer NOT NULL,
	`closeTime` integer,
	`entryPrice` text NOT NULL,
	`exitPrice` text,
	`quantity` text NOT NULL,
	`positionSizeUsdt` text NOT NULL,
	`feeUsd` text NOT NULL,
	`realizedPnlUsd` text NOT NULL,
	`stopLossPrice` text,
	`takeProfitPrice` text,
	`syncedAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "trades_side_check" CHECK("trades"."side" in ('long', 'short')),
	CONSTRAINT "trades_status_check" CHECK("trades"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trades_account_trade_key_unique` ON `trades` (`accountId`,`tradeKey`);--> statement-breakpoint
CREATE INDEX `trades_account_status_idx` ON `trades` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `trades_account_open_idx` ON `trades` (`accountId`,`openTime`);--> statement-breakpoint
CREATE INDEX `trades_account_close_id_idx` ON `trades` (`accountId`,`closeTime`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`transactionId` integer,
	`preTradeId` integer,
	`tradeId` integer,
	`providerId` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "conversations_attachment_xor_check" CHECK(("__new_conversations"."transactionId" is not null) + ("__new_conversations"."preTradeId" is not null) + ("__new_conversations"."tradeId" is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "userId", "transactionId", "preTradeId", "tradeId", "providerId", "model", "createdAt", "updatedAt") SELECT "id", "userId", "transactionId", "preTradeId", NULL, "providerId", "model", "createdAt", "updatedAt" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conversations_user_transaction_idx` ON `conversations` (`userId`,`transactionId`);--> statement-breakpoint
CREATE INDEX `conversations_user_pre_trade_idx` ON `conversations` (`userId`,`preTradeId`);--> statement-breakpoint
CREATE INDEX `conversations_user_trade_idx` ON `conversations` (`userId`,`tradeId`);--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`initialBalance` text DEFAULT '0' NOT NULL,
	`exchange` text DEFAULT 'binance' NOT NULL,
	`apiKey` text,
	`apiSecret` text,
	`keyVerifiedAt` integer,
	`balanceUsdt` text,
	`unrealizedPnlUsdt` text,
	`backfillStart` integer,
	`incomeCursorAt` integer,
	`lastSyncedAt` integer,
	`lastSyncAttemptAt` integer,
	`lastSyncErrorCode` text,
	`lastSyncRetryAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "accounts_exchange_check" CHECK("__new_accounts"."exchange" in ('binance'))
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "userId", "name", "notes", "initialBalance", "exchange", "apiKey", "apiSecret", "keyVerifiedAt", "balanceUsdt", "unrealizedPnlUsdt", "backfillStart", "incomeCursorAt", "lastSyncedAt", "lastSyncAttemptAt", "lastSyncErrorCode", "lastSyncRetryAt", "createdAt", "updatedAt") SELECT "id", "userId", "name", "notes", "initialBalance", 'binance', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, "createdAt", "updatedAt" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;