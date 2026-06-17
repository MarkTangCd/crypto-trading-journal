ALTER TABLE `transactions` ADD `context` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `transactions` ADD `tradeItems` text NOT NULL DEFAULT '[]';--> statement-breakpoint
UPDATE `transactions` SET `context` = `tradingLogic` WHERE `context` = '';
