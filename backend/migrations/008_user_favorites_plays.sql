-- ============================================================
-- Migration 008: 유저 즐겨찾기 + 개인 플레이 로그
-- ============================================================

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id     INTEGER     NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_song
  ON user_favorites (song_id);

CREATE TABLE IF NOT EXISTS user_plays (
  user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id         INTEGER     NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  play_count      INTEGER     NOT NULL DEFAULT 1,
  last_played_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_user_plays_last
  ON user_plays (user_id, last_played_at DESC);
