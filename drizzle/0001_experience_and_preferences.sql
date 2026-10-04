CREATE TABLE `preference_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`liked_slots_json` text DEFAULT '[]' NOT NULL,
	`avoided_slots_json` text DEFAULT '[]' NOT NULL,
	`day_pref` text DEFAULT 'any' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`manager_note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `mastery` ADD `experience` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mastery` ADD `last_worked_at` text;