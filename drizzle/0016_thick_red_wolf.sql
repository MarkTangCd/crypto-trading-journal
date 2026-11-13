CREATE TABLE `journal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accountId` integer NOT NULL,
	`symbol` text NOT NULL,
	`plannedEntry` text,
	`plannedStopLoss` text,
	`plannedTakeProfit` text,
	`emotion` text,
	`entryReason` text,
	`marketContext` text,
	`invalidation` text,
	`mistakes` text,
	`rules` text,
	`managementDecisions` text,
	`nextTime` text,
	`beforeImageIds` text DEFAULT '[]' NOT NULL,
	`afterImageIds` text DEFAULT '[]' NOT NULL,
	`reviewedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "journal_entries_emotion_check" CHECK("journal_entries"."emotion" is null or "journal_entries"."emotion" in ('fear', 'greed', 'frustration', 'impatience', 'hesitation', 'overconfidence', 'revenge', 'boredom', 'stress', 'fomo'))
);
--> statement-breakpoint
CREATE INDEX `journal_entries_user_idx` ON `journal_entries` (`userId`);--> statement-breakpoint
CREATE TABLE `journal_entry_setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entryId` integer NOT NULL,
	`setupId` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entry_setups_entry_setup_unique` ON `journal_entry_setups` (`entryId`,`setupId`);--> statement-breakpoint
CREATE INDEX `journal_entry_setups_setup_idx` ON `journal_entry_setups` (`setupId`);--> statement-breakpoint
CREATE TABLE `journal_entry_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entryId` integer NOT NULL,
	`tradeId` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entry_trades_trade_unique` ON `journal_entry_trades` (`tradeId`);--> statement-breakpoint
CREATE INDEX `journal_entry_trades_entry_idx` ON `journal_entry_trades` (`entryId`);--> statement-breakpoint
CREATE TABLE `setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`triggers` text DEFAULT '[]' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setups_user_name_unique` ON `setups` (`userId`,lower("name"));