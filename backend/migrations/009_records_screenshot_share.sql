-- ============================================================
-- Migration 009: 스크린샷 공유 기능
-- users.show_screenshot: 유저가 본인 기록 스크린샷을 남들에게 공개할지 여부
-- records.screenshot_path: 업로드된 스크린샷 파일 경로 (record_screenshots/ 이하 파일명)
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_screenshot BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS screenshot_path VARCHAR(255);
