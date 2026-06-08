DROP TABLE `trading_elements`;--> statement-breakpoint
DROP TABLE `trading_system_elements`;--> statement-breakpoint
DROP TABLE `trading_systems`;--> statement-breakpoint
DROP TABLE `transaction_elements`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `tradingSystemId`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `confidenceLevel`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `activeTradingSystemId`;