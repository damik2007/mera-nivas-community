-- Run this ONCE against your live database (phpMyAdmin: select your database,
-- SQL tab, paste, Go).

-- Feature 1: log every sign-in attempt, success or failure.
CREATE TABLE IF NOT EXISTS `auth_events` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL,
  `method` ENUM('PASSWORD','GOOGLE') NOT NULL,
  `success` TINYINT(1) NOT NULL,
  `reason` VARCHAR(100) NULL,
  `user_id` VARCHAR(36) NULL,
  `ip` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL,
  CONSTRAINT `auth_events_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

-- Feature 6: lets a password-reset link be invalidated the instant the
-- password it targets has already changed some other way.
ALTER TABLE `users`
  ADD COLUMN `password_version` INT NOT NULL DEFAULT 0;

-- Feature 2: a longer reason/description for one-off charges (fines, damage).
ALTER TABLE `bills`
  ADD COLUMN `description` TEXT NULL AFTER `cycle_label`;

-- Feature 4: who a notice is addressed to, plus an optional attachment label.
ALTER TABLE `notices`
  ADD COLUMN `attachment_label` VARCHAR(100) NULL AFTER `attachment_url`,
  ADD COLUMN `audience_type` ENUM('ALL','STREET','ROAD','SELECTED') NOT NULL DEFAULT 'ALL',
  ADD COLUMN `audience_block_id` VARCHAR(36) NULL,
  ADD COLUMN `audience_road_no` VARCHAR(50) NULL,
  ADD CONSTRAINT `notices_audience_block_id_fk` FOREIGN KEY (`audience_block_id`) REFERENCES `blocks`(`id`);

CREATE TABLE IF NOT EXISTS `notice_recipients` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `notice_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  CONSTRAINT `notice_recipients_notice_id_fk` FOREIGN KEY (`notice_id`) REFERENCES `notices`(`id`),
  CONSTRAINT `notice_recipients_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
