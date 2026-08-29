CREATE TABLE IF NOT EXISTS artist_aliases (
  id      SERIAL PRIMARY KEY,
  server  VARCHAR(20)  NOT NULL DEFAULT 'kr',
  artist  VARCHAR(200) NOT NULL,
  alias   VARCHAR(200) NOT NULL,
  CONSTRAINT artist_aliases_unique UNIQUE (server, artist, alias)
);

CREATE INDEX IF NOT EXISTS idx_artist_aliases_lookup
  ON artist_aliases (server, artist);
