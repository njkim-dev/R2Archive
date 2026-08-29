-- Migration 024: Persist YouTube search attempts so failed searches are not
-- repeated on later candidate collection runs.

CREATE TABLE IF NOT EXISTS song_youtube_search_audit (
  id              SERIAL PRIMARY KEY,
  song_id          INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  artist           TEXT NOT NULL,
  name             TEXT NOT NULL,
  artist_key       TEXT NOT NULL,
  name_key         TEXT NOT NULL,
  query            TEXT NOT NULL,
  query_key        TEXT NOT NULL,
  channel_id       VARCHAR(128) NOT NULL,
  result_count     INTEGER NOT NULL DEFAULT 0,
  candidate_count  INTEGER NOT NULL DEFAULT 0,
  searched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT song_youtube_search_audit_result_count_chk
    CHECK (result_count >= 0),
  CONSTRAINT song_youtube_search_audit_candidate_count_chk
    CHECK (candidate_count >= 0),
  CONSTRAINT song_youtube_search_audit_unique_query
    UNIQUE (artist_key, name_key, query_key, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_song_youtube_search_audit_song_key
  ON song_youtube_search_audit(artist_key, name_key);
