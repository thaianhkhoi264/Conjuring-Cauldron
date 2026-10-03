CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`station` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`station` text NOT NULL,
	`recipe_id` text,
	`call_session_id` text,
	`score` real NOT NULL,
	`feedback_json` text NOT NULL,
	`duration_s` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`call_session_id`) REFERENCES `call_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `availability` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_employee_day_time_idx` ON `availability` (`employee_id`,`day_of_week`,`start_time`,`end_time`);--> statement-breakpoint
CREATE TABLE `call_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`scenario_id` text NOT NULL,
	`transcript_json` text,
	`rubric_json` text,
	`score` real,
	`started_at` text NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calloff_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`calloff_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`rank` integer NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`calloff_id`) REFERENCES `calloffs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calloffs` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `demo_clock` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`now` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`hours_cap_weekly` integer NOT NULL,
	`avatar` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mastery` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`station` text NOT NULL,
	`score` real NOT NULL,
	`last_trained_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_employee_station_idx` ON `mastery` (`employee_id`,`station`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`station` text NOT NULL,
	`ingredients_json` text NOT NULL,
	`target_seconds` integer NOT NULL,
	`difficulty` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`required_json` text NOT NULL
);
