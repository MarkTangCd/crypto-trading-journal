CREATE TABLE `trading_elements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`confidenceLevel` integer DEFAULT 50 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trading_system_elements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tradingSystemId` integer NOT NULL,
	`tradingElementId` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trading_systems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`isActive` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_elements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transactionId` integer NOT NULL,
	`tradingElementId` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`tradingSystemId` integer,
	`accountBalance` text NOT NULL,
	`tradingPair` text NOT NULL,
	`timeFrame` text NOT NULL,
	`startTime` integer NOT NULL,
	`endTime` integer NOT NULL,
	`direction` text NOT NULL,
	`tradingLogic` text NOT NULL,
	`outcome` text NOT NULL,
	`consecutiveLosses` integer DEFAULT 0 NOT NULL,
	`riskRewardRatio` text NOT NULL,
	`returnAmount` text NOT NULL,
	`confidenceLevel` integer,
	`tvUrl` text,
	`reviewFeedback` text,
	`reviewChartUrl` text,
	`isReviewed` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "transactions_direction_check" CHECK("transactions"."direction" in ('long', 'short')),
	CONSTRAINT "transactions_outcome_check" CHECK("transactions"."outcome" in ('win', 'loss', 'breakeven'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastSignedIn` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`initialBalance` text DEFAULT '0',
	`activeTradingSystemId` integer,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('user', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);