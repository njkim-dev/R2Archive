-- ============================================================
-- Migration 026: Personal categories
--   personal_categories      : user-owned shareable song categories
--   personal_category_songs  : songs saved into a personal category
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_categories (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(40)  NOT NULL,
  is_public      BOOLEAN      NOT NULL DEFAULT TRUE,
  category_code  VARCHAR(16)  NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_categories_owner
  ON personal_categories (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS personal_category_songs (
  category_id  INTEGER     NOT NULL REFERENCES personal_categories(id) ON DELETE CASCADE,
  song_id      INTEGER     NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_category_songs_song
  ON personal_category_songs (song_id);

CREATE INDEX IF NOT EXISTS idx_personal_category_songs_category_added
  ON personal_category_songs (category_id, added_at DESC);
