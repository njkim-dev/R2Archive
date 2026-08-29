-- ============================================================
-- Migration 018: records.is_play_video
--
-- Historical records can be marked as play-video entries for the catalog.
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS is_play_video BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_records_song_play_video
  ON records (song_id) WHERE is_play_video = TRUE;
