-- ============================================================
-- Migration 010: 스크린샷 파일명 저장 (중복 업로드 방지용)
-- records.screenshot_filename: 업로드 당시 원본 파일명 (사용자당 유일)
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS screenshot_filename VARCHAR(255);

-- 사용자당 동일 파일명 중복 업로드 방지
CREATE UNIQUE INDEX IF NOT EXISTS uidx_records_user_screenshot_filename
  ON records (user_id, screenshot_filename)
  WHERE user_id IS NOT NULL AND screenshot_filename IS NOT NULL;
