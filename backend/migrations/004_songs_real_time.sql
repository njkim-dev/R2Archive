-- ============================================================
-- Migration 004: songs.real_time 컬럼 추가
-- 게임사가 잘못 등록한 time 값을 수동 교정하기 위한 오버라이드 컬럼.
-- upload_songs.py는 이 컬럼을 건드리지 않고, 조회 시 COALESCE(real_time, time) 사용.
-- ============================================================

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS real_time VARCHAR(10);
