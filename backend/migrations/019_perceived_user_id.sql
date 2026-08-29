-- ============================================================
-- Migration 019: perceived_difficulty.user_id를 INTEGER FK로 정정
--
-- 001에서 VARCHAR(255)로 선언됐던 user_id 컬럼을 users.id와 정합되는
-- INTEGER REFERENCES users(id)로 변경.
--
-- 의도: 로그인 사용자의 체감 난이도 투표를 anon_id가 아닌 user_id로 식별해,
-- 타인이 anon_id를 알아도 본인 투표를 변조/삭제할 수 없도록 보호.
--
-- 코드에서 user_id 컬럼을 사용한 적이 없어 기존 데이터는 모두 anon_id 기반.
-- 따라서 user_id 컬럼 재정의로 인한 데이터 손실 없음.
-- 기존 anon 투표는 그대로 유지되고, 로그인 사용자가 다음 투표 시 자동 승계.
-- ============================================================

ALTER TABLE perceived_difficulty
  DROP CONSTRAINT IF EXISTS chk_perceived_identity;

DROP INDEX IF EXISTS uidx_perceived_user;

ALTER TABLE perceived_difficulty
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE perceived_difficulty
  ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX uidx_perceived_user
  ON perceived_difficulty (song_id, user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE perceived_difficulty
  ADD CONSTRAINT chk_perceived_identity
  CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL);
