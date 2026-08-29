-- Migration 033: Rebuild xyx_songs.korea_name from confirmed links only.
-- Korean names are display data, so removed Korean-server songs must not
-- populate the XYX "한국 곡명" column for normal catalog/list views.

UPDATE xyx_songs
SET korea_name = NULL,
    updated_at = NOW()
WHERE korea_name IS NOT NULL;

WITH linked_names AS (
  SELECT
    l.xyx_song_id,
    MIN(s.name) AS korea_name,
    COUNT(DISTINCT s.name) AS distinct_name_count
  FROM song_server_links l
  JOIN songs s ON s.id = l.kr_song_id
  WHERE l.confidence = 100
    AND COALESCE(s.is_removed, FALSE) IS FALSE
  GROUP BY l.xyx_song_id
),
deterministic AS (
  SELECT xyx_song_id, korea_name
  FROM linked_names
  WHERE distinct_name_count = 1
)
UPDATE xyx_songs x
SET korea_name = d.korea_name,
    updated_at = NOW()
FROM deterministic d
WHERE x.id = d.xyx_song_id;
