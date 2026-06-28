CREATE TABLE `agent_settings` (
	`userId` integer PRIMARY KEY NOT NULL,
	`defaultProvider` text DEFAULT 'deepseek' NOT NULL,
	`providerConfigs` text DEFAULT '' NOT NULL,
	`enabledSkillIds` text DEFAULT '[]' NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`transactionId` integer NOT NULL,
	`providerId` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_user_transaction_idx` ON `conversations` (`userId`,`transactionId`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "messages_role_check" CHECK("messages"."role" in ('system', 'user', 'assistant', 'tool'))
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversationId`,`createdAt`);