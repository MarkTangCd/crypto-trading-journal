-- Keyless accounts predate exchange linking, never synced, and own no fills or trades.
DELETE FROM `accounts` WHERE `apiKey` IS NULL OR `apiSecret` IS NULL;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`preTradeId` integer,
	`tradeId` integer,
	`providerId` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "conversations_attachment_xor_check" CHECK(("__new_conversations"."preTradeId" is not null) + ("__new_conversations"."tradeId" is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "userId", "preTradeId", "tradeId", "providerId", "model", "createdAt", "updatedAt") SELECT "id", "userId", "preTradeId", "tradeId", "providerId", "model", "createdAt", "updatedAt" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conversations_user_pre_trade_idx` ON `conversations` (`userId`,`preTradeId`);--> statement-breakpoint
CREATE INDEX `conversations_user_trade_idx` ON `conversations` (`userId`,`tradeId`);--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`exchange` text DEFAULT 'binance' NOT NULL,
	`apiKey` text NOT NULL,
	`apiSecret` text NOT NULL,
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
INSERT INTO `__new_accounts`("id", "userId", "name", "notes", "exchange", "apiKey", "apiSecret", "keyVerifiedAt", "balanceUsdt", "unrealizedPnlUsdt", "backfillStart", "incomeCursorAt", "lastSyncedAt", "lastSyncAttemptAt", "lastSyncErrorCode", "lastSyncRetryAt", "createdAt", "updatedAt") SELECT "id", "userId", "name", "notes", "exchange", "apiKey", "apiSecret", "keyVerifiedAt", "balanceUsdt", "unrealizedPnlUsdt", "backfillStart", "incomeCursorAt", "lastSyncedAt", "lastSyncAttemptAt", "lastSyncErrorCode", "lastSyncRetryAt", "createdAt", "updatedAt" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;