CREATE TABLE `trading_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_system_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradingSystemId` int NOT NULL,
	`tradingElementId` int NOT NULL,
	CONSTRAINT `trading_system_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_systems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`notes` text,
	`isActive` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_systems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `tradingSystemId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `activeTradingSystemId` int;