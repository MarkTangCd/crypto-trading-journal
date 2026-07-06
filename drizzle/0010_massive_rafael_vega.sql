CREATE TABLE `pre_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`tradingPair` text NOT NULL,
	`direction` text,
	`primaryTimeFrame` text NOT NULL,
	`primaryCandleCount` integer DEFAULT 100 NOT NULL,
	`contextTimeframes` text DEFAULT '[]' NOT NULL,
	`anchorMs` integer,
	`idea` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`transactionId` integer,
	`preTradeId` integer,
	`providerId` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "conversations_attachment_xor_check" CHECK(("__new_conversations"."transactionId" is not null) <> ("__new_conversations"."preTradeId" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "userId", "transactionId", "preTradeId", "providerId", "model", "createdAt", "updatedAt") SELECT "id", "userId", "transactionId", NULL, "providerId", "model", "createdAt", "updatedAt" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conversations_user_transaction_idx` ON `conversations` (`userId`,`transactionId`);--> statement-breakpoint
CREATE INDEX `conversations_user_pre_trade_idx` ON `conversations` (`userId`,`preTradeId`);