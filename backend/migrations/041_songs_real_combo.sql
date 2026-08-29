ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS real_combo INTEGER;

UPDATE songs
SET real_combo = 843
WHERE name = 'OMEN'
  AND artist = 'VALOFE'
  AND level = 8.0;

UPDATE songs
SET real_combo = 1664
WHERE name = 'OMEN'
  AND artist = 'VALOFE'
  AND level = 12.0;

UPDATE songs
SET real_combo = 771
WHERE name = 'Mystic wanderer'
  AND artist = 'VALOFE'
  AND level = 7.5;

UPDATE songs
SET real_combo = 748
WHERE name = 'Rainstorm'
  AND artist = 'R2BEAT'
  AND level = 8.5;
