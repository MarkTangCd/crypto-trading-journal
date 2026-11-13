PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`ownerKind` text NOT NULL,
	`ownerId` integer NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`bytes` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "images_mime_check" CHECK("__new_images"."mime" in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
	CONSTRAINT "images_owner_kind_check" CHECK("__new_images"."ownerKind" in ('plan', 'journal_entry', 'setup'))
);
--> statement-breakpoint
INSERT INTO `__new_images`("id", "userId", "ownerKind", "ownerId", "sha256", "mime", "size", "bytes", "createdAt") SELECT "id", "userId", 'plan', "planId", "sha256", "mime", "size", "bytes", "createdAt" FROM `images`;--> statement-breakpoint
DROP TABLE `images`;--> statement-breakpoint
ALTER TABLE `__new_images` RENAME TO `images`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `images_owner_sha_unique` ON `images` (`ownerKind`,`ownerId`,`sha256`);--> statement-breakpoint
CREATE INDEX `images_user_idx` ON `images` (`userId`);