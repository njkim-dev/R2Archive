WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_wangbeol_flight', 'KR: Flight of the Bumblebee 1/2')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 3008), ('kr', 3013), ('kr', 5302)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_pungseo_ex', 'KR: Pungseo EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 8438), ('kr', 8439), ('kr', 8440), ('kr', 7886)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_welcome_to_hell_2', 'KR: Welcome to Hell 2')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 6016), ('kr', 6017), ('kr', 6106)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('xyx_lights_tongue_2', 'XYX: Light''s Tongue 2')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('xyx', 4194), ('xyx', 4195), ('xyx', 4423), ('xyx', 4424)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_blade_ex', 'KR: Blade EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 6980), ('kr', 6981), ('kr', 5369)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_bspower_bigbang_ex', 'KR: BSPower Bigbang EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 7270), ('kr', 4290), ('kr', 7272), ('kr', 4874)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_end_of_fight_ex', 'KR: End Of Fight EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 4294), ('kr', 4295), ('kr', 7277), ('kr', 7857)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_global_warming_ex', 'KR: GlobalWarming EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 5337), ('kr', 3930)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_jbl_ex', 'KR: JBL EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 3945), ('kr', 3946), ('kr', 5367)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_offend_ex', 'KR: Offend EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 7782), ('kr', 4802), ('kr', 4909)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('kr_taken_ex', 'KR: Taken EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('kr', 6889), ('kr', 5368)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('xyx_bspower_bigbang_ex', 'XYX: BSPower Bigbang EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('xyx', 1422), ('xyx', 1423), ('xyx', 1424), ('xyx', 1995)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;

WITH g AS (
  INSERT INTO same_music_groups (group_key, label)
  VALUES ('xyx_offend_ex', 'XYX: Offend EX')
  ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label
  RETURNING id
), d AS (
  DELETE FROM same_music_group_members WHERE group_id = (SELECT id FROM g)
)
INSERT INTO same_music_group_members (group_id, server, song_id)
SELECT g.id, v.server, v.song_id
FROM g
CROSS JOIN (VALUES ('xyx', 1937), ('xyx', 1938), ('xyx', 2028)) AS v(server, song_id)
ON CONFLICT (server, song_id) DO UPDATE SET group_id = EXCLUDED.group_id;
