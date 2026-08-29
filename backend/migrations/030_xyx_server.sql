-- ============================================================
-- Migration 030: XYX server tables
--   xyx_songs mirrors songs with korea_name for KO image-hash matches.
--   xyx_categories mirrors personal_categories for the XYX catalog.
-- ============================================================

CREATE TABLE IF NOT EXISTS xyx_songs (
  id            SERIAL PRIMARY KEY,
  name          TEXT,
  korea_name    TEXT,
  artist        TEXT,
  level         NUMERIC NOT NULL DEFAULT 0,
  bpm           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  combo         INTEGER NOT NULL DEFAULT 0,
  time          TEXT,
  is_change     BOOLEAN NOT NULL DEFAULT FALSE,
  change_bpm    TEXT,
  image         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stat          BOOLEAN DEFAULT FALSE,
  file_order    INTEGER,
  youtube_url   TEXT,
  game_index    INTEGER UNIQUE,
  real_time     VARCHAR(10),
  is_removed    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_xyx_songs_active_order
  ON xyx_songs (is_removed, stat DESC, file_order DESC);

CREATE INDEX IF NOT EXISTS idx_xyx_songs_name_artist
  ON xyx_songs (name, artist);

CREATE TABLE IF NOT EXISTS xyx_play_logs (
  id          SERIAL PRIMARY KEY,
  song_id     INTEGER NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id  VARCHAR(64) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_xyx_play_logs_song_session
  ON xyx_play_logs (song_id, session_id);

CREATE TABLE IF NOT EXISTS xyx_user_favorites (
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id     INTEGER     NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_xyx_user_favorites_song
  ON xyx_user_favorites (song_id);

CREATE TABLE IF NOT EXISTS xyx_user_plays (
  user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id         INTEGER     NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  play_count      INTEGER     NOT NULL DEFAULT 1,
  last_played_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_xyx_user_plays_last
  ON xyx_user_plays (user_id, last_played_at DESC);

CREATE TABLE IF NOT EXISTS xyx_categories (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(40)  NOT NULL,
  is_public      BOOLEAN      NOT NULL DEFAULT TRUE,
  category_code  VARCHAR(16)  NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xyx_categories_owner
  ON xyx_categories (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xyx_category_songs (
  category_id  INTEGER     NOT NULL REFERENCES xyx_categories(id) ON DELETE CASCADE,
  song_id      INTEGER     NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_xyx_category_songs_song
  ON xyx_category_songs (song_id);

CREATE INDEX IF NOT EXISTS idx_xyx_category_songs_category_added
  ON xyx_category_songs (category_id, added_at DESC);

CREATE TABLE IF NOT EXISTS xyx_category_members (
  category_id  INTEGER     NOT NULL REFERENCES xyx_categories(id) ON DELETE CASCADE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL DEFAULT 'viewer'
                 CHECK (role IN ('viewer', 'editor')),
  source       VARCHAR(12) NOT NULL DEFAULT 'subscribe'
                 CHECK (source = 'subscribe'),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_xyx_category_members_user
  ON xyx_category_members (user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_xyx_category_members_category
  ON xyx_category_members (category_id, role);
