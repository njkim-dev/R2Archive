-- Migration 029: songs.is_removed column.
-- Keep Show="0" songs in the table while excluding them from active song lists.

ALTER TABLE songs
ADD COLUMN IF NOT EXISTS is_removed BOOLEAN NOT NULL DEFAULT FALSE;
