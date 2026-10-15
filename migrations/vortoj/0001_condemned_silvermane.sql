ALTER TABLE `rooms` ADD `updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE rooms SET updated_at = MAX(created_at, COALESCE(
  (SELECT MAX(json_extract(value, '$.at')) FROM json_each(rooms.state, '$.history')), created_at
));
