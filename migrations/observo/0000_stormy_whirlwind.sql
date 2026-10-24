CREATE TABLE `hours` (
	`site_id` text NOT NULL,
	`hour` integer NOT NULL,
	`slots` integer NOT NULL,
	PRIMARY KEY(`site_id`, `hour`)
);
--> statement-breakpoint
CREATE TABLE `latest` (
	`site_id` text PRIMARY KEY NOT NULL,
	`slot` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`status_code` integer,
	`duration_ms` integer NOT NULL
);
