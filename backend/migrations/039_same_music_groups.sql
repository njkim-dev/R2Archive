CREATE TABLE IF NOT EXISTS same_music_groups (
  id         SERIAL PRIMARY KEY,
  group_key  VARCHAR(100) NOT NULL UNIQUE,
  label      VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS same_music_group_members (
  group_id INTEGER     NOT NULL REFERENCES same_music_groups(id) ON DELETE CASCADE,
  server   VARCHAR(20) NOT NULL CHECK (server IN ('kr', 'xyx')),
  song_id  INTEGER     NOT NULL,
  PRIMARY KEY (server, song_id),
  UNIQUE (group_id, server, song_id)
);

CREATE INDEX IF NOT EXISTS idx_same_music_group_members_group
  ON same_music_group_members (group_id);
