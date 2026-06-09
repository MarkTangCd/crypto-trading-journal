BEGIN;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accountId` integer NOT NULL,
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
INSERT INTO `__new_transactions`("id", "userId", "accountId", "status", "accountBalance", "tradingPair", "timeFrame", "startTime", "endTime", "direction", "tradingLogic", "outcome", "consecutiveLosses", "riskRewardRatio", "returnAmount", "tvUrl", "marketCycle", "transactionType", "reviewFeedback", "reviewChartUrl", "createdAt", "updatedAt") SELECT "id", "userId", COALESCE("accountId", (SELECT "id" FROM "accounts" WHERE "accounts"."userId" = "transactions"."userId" ORDER BY "id" LIMIT 1)), "status", "accountBalance", "tradingPair", "timeFrame", "startTime", "endTime", "direction", "tradingLogic", "outcome", "consecutiveLosses", "riskRewardRatio", "returnAmount", "tvUrl", "marketCycle", "transactionType", "reviewFeedback", "reviewChartUrl", "createdAt", "updatedAt" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_account_status_idx` ON `transactions` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `transactions_account_created_idx` ON `transactions` (`accountId`,`createdAt`);--> statement-breakpoint
COMMIT;