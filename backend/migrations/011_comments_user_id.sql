-- ============================================================
-- Migration 011: 댓글에 user_id 추가 (마이페이지에서 본인 댓글 정확히 추적)
-- 기존 댓글은 user_id NULL 유지. 마이페이지 쿼리에서는
--   user_id = me OR (user_id IS NULL AND nickname = my_nickname)
-- 으로 변경 전 닉네임 시절 댓글도 함께 노출.
-- ============================================================

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON comments (user_id)
  WHERE user_id IS NOT NULL;
