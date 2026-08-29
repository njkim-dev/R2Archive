CREATE TABLE IF NOT EXISTS xyx_song_aliases (
  id      SERIAL PRIMARY KEY,
  song_id INTEGER      NOT NULL REFERENCES xyx_songs(id) ON DELETE CASCADE,
  alias   VARCHAR(200) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_xyx_song_aliases_song
  ON xyx_song_aliases (song_id);
