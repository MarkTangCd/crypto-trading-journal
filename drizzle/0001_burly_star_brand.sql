CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`initialBalance` text DEFAULT '0' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trading_elements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`confidenceLevel` integer DEFAULT 3 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_trading_elements`("id", "userId", "name", "description", "confidenceLevel", "createdAt", "updatedAt") SELECT "id", "userId", "name", "description", "confidenceLevel", "createdAt", "updatedAt" FROM `trading_elements`;--> statement-breakpoint
DROP TABLE `trading_elements`;--> statement-breakpoint
ALTER TABLE `__new_trading_elements` RENAME TO `trading_elements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`tradingSystemId` integer,
	`accountId` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`accountBalance` text,
	`tradingPair` text NOT NULL,
	`timeFrame` text NOT NULL,
	`startTime` integer NOT NULL,
	`endTime` integer,
	`direction` text NOT NULL,
	`tradingLogic` text NOT NULL,
	`outcome` text,
	`consecutiveLosses` integer DEFAULT 0,
	`riskRewardRatio` text,
	`returnAmount` text,
	`confidenceLevel` real,
	`tvUrl` text,
	`marketCycle` text,
	`transactionType` text,
	`reviewFeedback` text,
	`reviewChartUrl` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "transactions_status_check" CHECK("__new_transactions"."status" in ('open', 'closed', 'reviewed')),
	CONSTRAINT "transactions_direction_check" CHECK("__new_transactions"."direction" in ('long', 'short')),
	CONSTRAINT "transactions_outcome_check" CHECK("__new_transactions"."outcome" in ('win', 'loss', 'breakeven')),
	CONSTRAINT "transactions_market_cycle_check" CHECK("__new_transactions"."marketCycle" is null or "__new_transactions"."marketCycle" in ('Trading Range', 'Upward Tight Channel', 'Downward Tight Channel', 'Upward Channel', 'Downward Channel', 'Upward Trend', 'Downward Trend')),
	CONSTRAINT "transactions_transaction_type_check" CHECK("__new_transactions"."transactionType" is null or "__new_transactions"."transactionType" in ('Trend', 'Reversal'))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "userId", "tradingSystemId", "accountId", "status", "accountBalance", "tradingPair", "timeFrame", "startTime", "endTime", "direction", "tradingLogic", "outcome", "consecutiveLosses", "riskRewardRatio", "returnAmount", "confidenceLevel", "tvUrl", "marketCycle", "transactionType", "reviewFeedback", "reviewChartUrl", "createdAt", "updatedAt") SELECT "id", "userId", "tradingSystemId", NULL, CASE WHEN "isReviewed" = 1 THEN 'reviewed' ELSE 'closed' END, "accountBalance", "tradingPair", "timeFrame", "startTime", "endTime", "direction", "tradingLogic", "outcome", "consecutiveLosses", "riskRewardRatio", "returnAmount", "confidenceLevel", "tvUrl", NULL, NULL, "reviewFeedback", "reviewChartUrl", "createdAt", "updatedAt" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;
