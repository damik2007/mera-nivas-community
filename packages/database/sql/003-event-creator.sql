-- Run this ONCE against your live database (phpMyAdmin: select your database,
-- SQL tab, paste, Go). Existing events are left with NULL here, which is
-- treated by the app as an admin/legacy event.

ALTER TABLE `events`
  ADD COLUMN `created_by_user_id` VARCHAR(36) NULL AFTER `recurrence_rule`,
  ADD CONSTRAINT `events_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`);
