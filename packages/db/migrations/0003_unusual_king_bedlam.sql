CREATE TABLE `bookmark_tag` (
	`bookmark_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmark`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_tag_pair_unique` ON `bookmark_tag` (`bookmark_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `bookmark_tag_tag_id_idx` ON `bookmark_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_user_id_idx` ON `tag` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tag_user_name_unique` ON `tag` (`user_id`,`name`);