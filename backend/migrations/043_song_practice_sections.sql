CREATE TABLE IF NOT EXISTS song_practice_sections (
  id              SERIAL PRIMARY KEY,
  song_id         INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_seconds   INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds     INTEGER NOT NULL CHECK (end_seconds > start_seconds),
  description     TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 200),
  is_recommended  BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recommended_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_song_practice_sections_song
  ON song_practice_sections(song_id, is_recommended DESC, start_seconds, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_practice_sections_user
  ON song_practice_sections(user_id, created_at DESC);
