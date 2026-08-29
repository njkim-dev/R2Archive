ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS catalog_view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE xyx_songs
  ADD COLUMN IF NOT EXISTS catalog_view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pmang_songs
  ADD COLUMN IF NOT EXISTS catalog_view_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS song_catalog_views (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id  VARCHAR(80) NOT NULL,
  server      VARCHAR(16) NOT NULL,
  song_id     INTEGER NOT NULL,
  path        TEXT NOT NULL,
  title       TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  device      VARCHAR(16) NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT song_catalog_views_server_chk
    CHECK (server IN ('kr', 'xyx', 'pmang'))
);

CREATE INDEX IF NOT EXISTS idx_song_catalog_views_created_at
  ON song_catalog_views (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_catalog_views_song_created
  ON song_catalog_views (server, song_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_catalog_views_session_song_created
  ON song_catalog_views (session_id, server, song_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_catalog_views_user_created
  ON song_catalog_views (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
