CREATE TABLE IF NOT EXISTS site_pageviews (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id  VARCHAR(80) NOT NULL,
  path        TEXT NOT NULL,
  title       TEXT,
  server      VARCHAR(16) NOT NULL DEFAULT 'kr',
  referrer    TEXT,
  user_agent  TEXT,
  device      VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ip_hash     CHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_pageviews_created_at
  ON site_pageviews (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_pageviews_session_created
  ON site_pageviews (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_pageviews_path_created
  ON site_pageviews (path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_pageviews_server_created
  ON site_pageviews (server, created_at DESC);
