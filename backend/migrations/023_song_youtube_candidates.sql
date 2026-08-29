-- Migration 023: YouTube candidate review table for songs.youtube_url backfill.
-- Candidates are collected from a trusted YouTube channel, reviewed, then applied.

CREATE TABLE IF NOT EXISTS song_youtube_candidates (
  id              SERIAL PRIMARY KEY,
  song_id          INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  artist           TEXT NOT NULL,
  name             TEXT NOT NULL,
  artist_key       TEXT NOT NULL,
  name_key         TEXT NOT NULL,
  song_count       INTEGER NOT NULL DEFAULT 1,
  query            TEXT NOT NULL,

  youtube_url      VARCHAR(500) NOT NULL,
  video_id         VARCHAR(32) NOT NULL,
  video_title      TEXT,
  video_description TEXT,
  channel_id       VARCHAR(128) NOT NULL,
  channel_title    TEXT,
  published_at     TIMESTAMPTZ,
  thumbnail_url    TEXT,
  rank             INTEGER NOT NULL,
  score            NUMERIC(5, 3),

  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_at      TIMESTAMPTZ,
  applied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT song_youtube_candidates_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  CONSTRAINT song_youtube_candidates_rank_chk
    CHECK (rank > 0),
  CONSTRAINT song_youtube_candidates_song_count_chk
    CHECK (song_count > 0),
  CONSTRAINT song_youtube_candidates_unique_video
    UNIQUE (artist_key, name_key, video_id)
);

CREATE INDEX IF NOT EXISTS idx_song_youtube_candidates_status
  ON song_youtube_candidates(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_youtube_candidates_song_key
  ON song_youtube_candidates(artist_key, name_key);
