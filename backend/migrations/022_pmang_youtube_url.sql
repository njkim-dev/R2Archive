-- Migration 022: pmang_songs optional direct YouTube URL.
-- If this column is filled, /api/pmang-songs uses it first.
-- If empty, the API falls back to matched songs.youtube_url.

ALTER TABLE pmang_songs
  ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(500);

