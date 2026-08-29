-- 관리자(소유자) 식별용 플래그. 향후 관리자 전용 UI/액션의 게이트로 사용.
-- 기본 FALSE, 본인 계정만 별도 UPDATE로 TRUE 지정.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 본인 계정에 권한 부여 (닉네임이나 user_id로 식별 — 실행 전 닉네임/ID 확인):
--   UPDATE users SET is_admin = TRUE WHERE id = <본인 user_id>;
--   -- 또는
--   UPDATE users SET is_admin = TRUE WHERE nickname = '<본인 닉네임>';
