-- ============================================================
-- Migration 028: Remove direct invites from personal categories
--   Users gain access by subscribing from a category link.
--   Owners can then change subscriber role or remove subscribers.
-- ============================================================

UPDATE personal_category_members
SET source = 'subscribe'
WHERE source <> 'subscribe';

ALTER TABLE personal_category_members
  DROP CONSTRAINT IF EXISTS personal_category_members_source_check;

ALTER TABLE personal_category_members
  ALTER COLUMN source SET DEFAULT 'subscribe';

ALTER TABLE personal_category_members
  ADD CONSTRAINT personal_category_members_source_check
  CHECK (source = 'subscribe');

ALTER TABLE personal_category_members
  DROP COLUMN IF EXISTS invited_by;
