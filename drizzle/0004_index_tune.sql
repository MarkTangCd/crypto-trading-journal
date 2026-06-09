DROP INDEX IF EXISTS `transactions_account_created_idx`;--> statement-breakpoint
CREATE INDEX `transactions_account_start_idx` ON `transactions` (`accountId`,`startTime`);--> statement-breakpoint
CREATE INDEX `transactions_account_end_id_idx` ON `transactions` (`accountId`,`endTime`,`id`);