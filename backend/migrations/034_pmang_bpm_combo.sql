ALTER TABLE pmang_songs
  ADD COLUMN IF NOT EXISTS combo INTEGER,
  ADD COLUMN IF NOT EXISTS bpm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bpm_max DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bpm_display TEXT;

CREATE INDEX IF NOT EXISTS idx_pmang_songs_bpm
  ON pmang_songs (bpm);

CREATE INDEX IF NOT EXISTS idx_pmang_songs_combo
  ON pmang_songs (combo);
