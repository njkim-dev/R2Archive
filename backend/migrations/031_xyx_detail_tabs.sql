-- ============================================================
-- Migration 031: XYX song detail community tables
--   Mirrors the Korean server detail modal features with xyx_* tables.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS xyx_anon_comment_seq START 1;

CREATE TABLE IF NOT EXISTS xyx_user_favorites (
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id     INTEGER     NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_xyx_user_favorites_song
  ON xyx_user_favorites (song_id);

CREATE TABLE IF NOT EXISTS xyx_comments (
  id          SERIAL       PRIMARY KEY,
  song_id     INTEGER      NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  nickname    VARCHAR(100) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xyx_comments_song
  ON xyx_comments (song_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xyx_comments_user_id
  ON xyx_comments (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS xyx_perceived_difficulty (
  id          SERIAL PRIMARY KEY,
  song_id     INTEGER NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  anon_id     VARCHAR(255),
  level       NUMERIC(3,1) NOT NULL CHECK (level >= 0.5 AND level <= 12.0),
  opinion     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_xyx_perceived_identity
    CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_xyx_perceived_user
  ON xyx_perceived_difficulty (song_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_xyx_perceived_anon
  ON xyx_perceived_difficulty (song_id, anon_id)
  WHERE anon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_xyx_perceived_song
  ON xyx_perceived_difficulty (song_id);

CREATE TABLE IF NOT EXISTS xyx_play_videos (
  id             SERIAL       PRIMARY KEY,
  song_id        INTEGER      NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  user_id        INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  nickname       VARCHAR(100) NOT NULL,
  youtube_url    VARCHAR(500) NOT NULL,
  youtube_title  VARCHAR(200),
  description    TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xyx_play_videos_song
  ON xyx_play_videos (song_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xyx_play_videos_user_id
  ON xyx_play_videos (user_id)
  WHERE user_id IS NOT NULL;
