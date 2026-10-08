CREATE TABLE `commands` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`command_id` text NOT NULL,
	`digest` text NOT NULL,
	PRIMARY KEY(`room_id`, `user_id`, `command_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `members` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`tile_set` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tile_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`tiles` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tile_sets_owner` ON `tile_sets` (`owner_id`);