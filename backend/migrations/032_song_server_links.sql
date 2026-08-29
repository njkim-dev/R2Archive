-- Migration 032: Links between Korean server songs and XYX server songs.
-- A pair can be created automatically or manually verified by the admin.

CREATE TABLE IF NOT EXISTS song_server_links (
  id            SERIAL PRIMARY KEY,
  kr_song_id    INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  xyx_song_id   INTEGER NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  match_source  TEXT NOT NULL DEFAULT 'manual',
  match_rule    TEXT NOT NULL DEFAULT 'manual',
  confidence    INTEGER NOT NULL DEFAULT 100 CHECK (confidence BETWEEN 0 AND 100),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kr_song_id, xyx_song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_server_links_kr_song
  ON song_server_links (kr_song_id);

CREATE INDEX IF NOT EXISTS idx_song_server_links_xyx_song
  ON song_server_links (xyx_song_id);

CREATE INDEX IF NOT EXISTS idx_song_server_links_confidence
  ON song_server_links (confidence);
