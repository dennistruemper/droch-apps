CREATE TABLE `conflict_revisions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO conflict_revisions (user_id, value)
SELECT profiles.id, revision.value FROM profiles CROSS JOIN revision WHERE revision.id = 1;
