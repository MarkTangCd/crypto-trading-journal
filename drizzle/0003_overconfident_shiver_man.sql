CREATE TABLE `transaction_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`tradingElementId` int NOT NULL,
	CONSTRAINT `transaction_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trading_elements` ADD `confidenceLevel` int DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `confidenceLevel` int;