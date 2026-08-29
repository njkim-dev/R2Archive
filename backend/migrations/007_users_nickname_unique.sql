-- ============================================================
-- Migration 007: 닉네임 중복 금지
-- 대소문자 구분 없이 유니크하게 하려면 LOWER(nickname)에 대한 인덱스를 사용.
-- ============================================================

-- 기존 일반 인덱스 제거
DROP INDEX IF EXISTS idx_users_nickname;

-- 대소문자 무시 + 좌우 공백 무시하여 중복 차단
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_nickname_ci
  ON users (LOWER(TRIM(nickname)))
  WHERE nickname IS NOT NULL;
