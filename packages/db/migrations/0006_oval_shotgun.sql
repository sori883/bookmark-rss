CREATE TABLE `user_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recommendation_enabled` integer DEFAULT false NOT NULL,
	`recommendation_hour` integer DEFAULT 8 NOT NULL,
	`discord_webhook_url_encrypted` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preference_user_id_unique` ON `user_preference` (`user_id`);