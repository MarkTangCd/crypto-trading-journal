CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`planId` integer NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`bytes` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "images_mime_check" CHECK("images"."mime" in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_plan_sha_unique` ON `images` (`planId`,`sha256`);--> statement-breakpoint
CREATE INDEX `images_user_idx` ON `images` (`userId`);--> statement-breakpoint
CREATE TABLE `plan_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planId` integer NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_observations_plan_created_idx` ON `plan_observations` (`planId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `plan_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planId` integer NOT NULL,
	`name` text NOT NULL,
	`side` text NOT NULL,
	`primaryTimeFrame` text NOT NULL,
	`content` text,
	`outcome` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "plan_scenarios_side_check" CHECK("plan_scenarios"."side" in ('long', 'short')),
	CONSTRAINT "plan_scenarios_time_frame_check" CHECK("plan_scenarios"."primaryTimeFrame" in ('15m', '30m', '1H', '4H', '12H', '1D')),
	CONSTRAINT "plan_scenarios_outcome_check" CHECK("plan_scenarios"."outcome" is null or "plan_scenarios"."outcome" in ('triggered', 'invalidated'))
);
--> statement-breakpoint
CREATE INDEX `plan_scenarios_plan_idx` ON `plan_scenarios` (`planId`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`symbol` text NOT NULL,
	`marketContext` text,
	`closedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_user_closed_idx` ON `plans` (`userId`,`closedAt`);