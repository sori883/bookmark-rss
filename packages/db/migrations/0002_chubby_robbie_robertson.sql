CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `category_user_id_idx` ON `category` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `category_user_name_unique` ON `category` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `feed` ADD `category_id` text REFERENCES category(id);--> statement-breakpoint
CREATE INDEX `feed_category_id_idx` ON `feed` (`category_id`);