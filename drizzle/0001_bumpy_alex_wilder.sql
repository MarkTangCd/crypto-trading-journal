CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountBalance` decimal(18,2) NOT NULL,
	`tradingPair` varchar(32) NOT NULL,
	`timeFrame` varchar(16) NOT NULL,
	`startTime` bigint NOT NULL,
	`endTime` bigint NOT NULL,
	`direction` enum('long','short') NOT NULL,
	`tradingLogic` text NOT NULL,
	`outcome` enum('win','loss','breakeven') NOT NULL,
	`consecutiveLosses` int NOT NULL DEFAULT 0,
	`riskRewardRatio` decimal(8,2) NOT NULL,
	`returnAmount` decimal(18,2) NOT NULL,
	`tvUrl` text,
	`reviewFeedback` text,
	`reviewChartUrl` text,
	`isReviewed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `initialBalance` decimal(18,2) DEFAULT '0';