CREATE TABLE `recommendation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`generated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendation_user_id_idx` ON `recommendation` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_user_date_unique` ON `recommendation` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `recommendation_item` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`article_id` text NOT NULL,
	`source` text NOT NULL,
	`rank` integer NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendation_item_recommendation_id_idx` ON `recommendation_item` (`recommendation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_item_recommendation_rank_unique` ON `recommendation_item` (`recommendation_id`,`rank`);