WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('xyx_lights_tongue_2', 'KR/XYX: Light''s Tongue / Light''s Tongue 2')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (
  VALUES
    ('xyx', 4194), ('xyx', 4195), ('xyx', 4423), ('xyx', 4424),
    ('kr', 8861), ('kr', 8862), ('kr', 42312), ('kr', 42313)
) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;
