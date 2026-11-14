-- Run this ONCE against your live database (phpMyAdmin: select your database,
-- SQL tab, paste, Go). Adds a new allowed value to an existing column — no
-- existing rows are changed.

ALTER TABLE `guest_approvals`
  MODIFY COLUMN `status` ENUM('APPROVED','CHECKED_IN','USED','EXPIRED','REVOKED','DENIED') NOT NULL DEFAULT 'APPROVED';
