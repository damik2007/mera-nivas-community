CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`action` varchar(100) NOT NULL,
	`entity` varchar(100) NOT NULL,
	`entity_id` varchar(36),
	`metadata` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bill_line_items` (
	`id` varchar(36) NOT NULL,
	`bill_id` varchar(36) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`amount` double NOT NULL,
	CONSTRAINT `bill_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`id` varchar(36) NOT NULL,
	`flat_id` varchar(36) NOT NULL,
	`cycle_label` varchar(20) NOT NULL,
	`total_amount` double NOT NULL,
	`amount_paid` double NOT NULL DEFAULT 0,
	`status` enum('PENDING','PARTIAL','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
	`due_date` datetime NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `bills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	CONSTRAINT `blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_fund_contributions` (
	`id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount` double NOT NULL,
	`note` varchar(255),
	`created_at` datetime NOT NULL,
	CONSTRAINT `event_fund_contributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_invitations` (
	`id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`mode` enum('SELECTIVE','BROADCAST') NOT NULL,
	`rsvp_status` enum('PENDING','YES','NO','MAYBE') NOT NULL DEFAULT 'PENDING',
	`responded_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `event_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_invitations_event_id_user_id_unique` UNIQUE(`event_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` varchar(36) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(50) NOT NULL,
	`venue` varchar(255),
	`starts_at` datetime NOT NULL,
	`ends_at` datetime,
	`banner_url` text,
	`is_recurring` boolean NOT NULL DEFAULT false,
	`recurrence_rule` varchar(100),
	`created_at` datetime NOT NULL,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flats` (
	`id` varchar(36) NOT NULL,
	`number` varchar(50) NOT NULL,
	`floor` int,
	`area_sqft` double,
	`block_id` varchar(36) NOT NULL,
	CONSTRAINT `flats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guest_approvals` (
	`id` varchar(36) NOT NULL,
	`guest_id` varchar(36) NOT NULL,
	`approved_by_id` varchar(36) NOT NULL,
	`qr_token` varchar(512) NOT NULL,
	`visit_start` datetime NOT NULL,
	`visit_end` datetime NOT NULL,
	`single_use` boolean NOT NULL DEFAULT true,
	`status` enum('APPROVED','USED','EXPIRED','REVOKED','DENIED') NOT NULL DEFAULT 'APPROVED',
	`revoked_at` datetime,
	`scanned_by_id` varchar(36),
	`checked_in_at` datetime,
	`checked_out_at` datetime,
	`deny_reason` varchar(255),
	`created_at` datetime NOT NULL,
	CONSTRAINT `guest_approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `guest_approvals_qr_token_unique` UNIQUE(`qr_token`)
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` varchar(36) NOT NULL,
	`flat_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(30) NOT NULL,
	`vehicle_number` varchar(50),
	`purpose` varchar(255),
	`created_at` datetime NOT NULL,
	CONSTRAINT `guests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitation_images` (
	`id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`image_url` text NOT NULL,
	`prompt_used` text,
	`source` enum('ai','template') NOT NULL,
	`selected` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL,
	CONSTRAINT `invitation_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_categories` (
	`id` varchar(36) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`billing_method` enum('FLAT_RATE','PER_SQFT','EQUAL_SPLIT') NOT NULL,
	`rate` double NOT NULL,
	CONSTRAINT `maintenance_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notice_read_receipts` (
	`id` varchar(36) NOT NULL,
	`notice_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`read_at` datetime NOT NULL,
	CONSTRAINT `notice_read_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `notice_read_receipts_notice_id_user_id_unique` UNIQUE(`notice_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` varchar(36) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`category` enum('urgent','general','maintenance','security') NOT NULL,
	`attachment_url` text,
	`is_pinned` boolean NOT NULL DEFAULT false,
	`expires_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`category` varchar(50) NOT NULL,
	`channel` enum('in_app','push','sms','email') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_user_id_category_channel_unique` UNIQUE(`user_id`,`category`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`category` varchar(50) NOT NULL,
	`channel` enum('in_app','push','sms','email') NOT NULL,
	`status` enum('QUEUED','SENT','FAILED') NOT NULL DEFAULT 'SENT',
	`created_at` datetime NOT NULL,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parking_allotments` (
	`id` varchar(36) NOT NULL,
	`guest_approval_id` varchar(36) NOT NULL,
	`slot_id` varchar(36) NOT NULL,
	`allotted_at` datetime NOT NULL,
	`released_at` datetime,
	CONSTRAINT `parking_allotments_id` PRIMARY KEY(`id`),
	CONSTRAINT `parking_allotments_guest_approval_id_unique` UNIQUE(`guest_approval_id`)
);
--> statement-breakpoint
CREATE TABLE `parking_slots` (
	`id` varchar(36) NOT NULL,
	`society_id` varchar(36) NOT NULL,
	`code` varchar(20) NOT NULL,
	`zone` varchar(50),
	`type` enum('GUEST','RESIDENT','RESERVED') NOT NULL DEFAULT 'GUEST',
	`status` enum('FREE','OCCUPIED','BLOCKED') NOT NULL DEFAULT 'FREE',
	`flat_id` varchar(36),
	CONSTRAINT `parking_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `parking_slots_society_id_code_unique` UNIQUE(`society_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`bill_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount` double NOT NULL,
	`provider` varchar(50) NOT NULL,
	`provider_ref_id` varchar(255),
	`status` enum('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'SUCCESS',
	`receipt_url` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(36) NOT NULL,
	`token` varchar(512) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires_at` datetime NOT NULL,
	`revoked` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL,
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `societies` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` varchar(255),
	`created_at` datetime NOT NULL,
	CONSTRAINT `societies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(30),
	`password_hash` varchar(255) NOT NULL,
	`role` enum('SUPER_ADMIN','SOCIETY_ADMIN','RESIDENT','SECURITY') NOT NULL,
	`is_owner` boolean NOT NULL DEFAULT true,
	`society_id` varchar(36),
	`flat_id` varchar(36),
	`created_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bill_line_items` ADD CONSTRAINT `bill_line_items_bill_id_bills_id_fk` FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bill_line_items` ADD CONSTRAINT `bill_line_items_category_id_maintenance_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `maintenance_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bills` ADD CONSTRAINT `bills_flat_id_flats_id_fk` FOREIGN KEY (`flat_id`) REFERENCES `flats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `blocks` ADD CONSTRAINT `blocks_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_fund_contributions` ADD CONSTRAINT `event_fund_contributions_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_fund_contributions` ADD CONSTRAINT `event_fund_contributions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_invitations` ADD CONSTRAINT `event_invitations_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_invitations` ADD CONSTRAINT `event_invitations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flats` ADD CONSTRAINT `flats_block_id_blocks_id_fk` FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guest_approvals` ADD CONSTRAINT `guest_approvals_guest_id_guests_id_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guest_approvals` ADD CONSTRAINT `guest_approvals_approved_by_id_users_id_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guest_approvals` ADD CONSTRAINT `guest_approvals_scanned_by_id_users_id_fk` FOREIGN KEY (`scanned_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guests` ADD CONSTRAINT `guests_flat_id_flats_id_fk` FOREIGN KEY (`flat_id`) REFERENCES `flats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation_images` ADD CONSTRAINT `invitation_images_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_categories` ADD CONSTRAINT `maintenance_categories_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notice_read_receipts` ADD CONSTRAINT `notice_read_receipts_notice_id_notices_id_fk` FOREIGN KEY (`notice_id`) REFERENCES `notices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notice_read_receipts` ADD CONSTRAINT `notice_read_receipts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notices` ADD CONSTRAINT `notices_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notices` ADD CONSTRAINT `notices_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parking_allotments` ADD CONSTRAINT `parking_allotments_guest_approval_id_guest_approvals_id_fk` FOREIGN KEY (`guest_approval_id`) REFERENCES `guest_approvals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parking_allotments` ADD CONSTRAINT `parking_allotments_slot_id_parking_slots_id_fk` FOREIGN KEY (`slot_id`) REFERENCES `parking_slots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parking_slots` ADD CONSTRAINT `parking_slots_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parking_slots` ADD CONSTRAINT `parking_slots_flat_id_flats_id_fk` FOREIGN KEY (`flat_id`) REFERENCES `flats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_bill_id_bills_id_fk` FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_flat_id_flats_id_fk` FOREIGN KEY (`flat_id`) REFERENCES `flats`(`id`) ON DELETE no action ON UPDATE no action;