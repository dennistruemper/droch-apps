CREATE TABLE `mail_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_queue_pending` ON `mail_queue` (`team_id`,`recipient_id`) WHERE "mail_queue"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `mail_queue_due` ON `mail_queue` (`status`,`due_at`,`lease_until`);