-- Migration 025: Cache videos from trusted YouTube channels.
-- This avoids expensive per-song search.list calls; channel uploads are fetched
-- with playlistItems.list and matched locally.

CREATE TABLE IF NOT EXISTS youtube_channel_videos (
  id                SERIAL PRIMARY KEY,
  channel_id        VARCHAR(128) NOT NULL,
  channel_title     TEXT,
  video_id          VARCHAR(32) NOT NULL,
  video_title       TEXT NOT NULL,
  video_description TEXT,
  published_at      TIMESTAMPTZ,
  thumbnail_url     TEXT,
  playlist_position INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT youtube_channel_videos_unique_video
    UNIQUE (channel_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_channel_videos_channel
  ON youtube_channel_videos(channel_id, playlist_position);
