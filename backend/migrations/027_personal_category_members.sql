-- ============================================================
-- Migration 027: Personal category subscriptions
--   role='viewer' : can view a category even when private
--   role='editor' : can view and edit category metadata/song contents
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_category_members (
  category_id  INTEGER     NOT NULL REFERENCES personal_categories(id) ON DELETE CASCADE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL DEFAULT 'viewer'
                 CHECK (role IN ('viewer', 'editor')),
  source       VARCHAR(12) NOT NULL DEFAULT 'subscribe'
                 CHECK (source = 'subscribe'),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_category_members_user
  ON personal_category_members (user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_category_members_category
  ON personal_category_members (category_id, role);
