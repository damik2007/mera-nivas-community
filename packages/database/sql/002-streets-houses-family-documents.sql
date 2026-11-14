-- Run this ONCE against your live database (phpMyAdmin: select your database,
-- open the SQL tab, paste this whole file, click Go — or via the mysql CLI
-- as shown in DEPLOY-NAMECHEAP.md). Safe to run even if some parts already
-- exist: each statement only adds something new.

-- Road number, under the existing street (blocks.name is now used as "Street").
ALTER TABLE `flats`
  ADD COLUMN `road_no` VARCHAR(50) NULL AFTER `number`;

-- Optional legal document reference on a user's account (sale deed, rental
-- agreement, ID proof). The file itself is stored on the server's disk and
-- only ever served through an authenticated download route.
ALTER TABLE `users`
  ADD COLUMN `document_path` VARCHAR(500) NULL,
  ADD COLUMN `document_label` VARCHAR(100) NULL;

-- Household members of a resident/owner account.
CREATE TABLE IF NOT EXISTS `family_members` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `gender` ENUM('MALE','FEMALE','OTHER') NOT NULL,
  `mobile` VARCHAR(30) NOT NULL,
  `created_at` DATETIME NOT NULL,
  CONSTRAINT `family_members_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
