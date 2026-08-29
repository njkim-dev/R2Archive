-- ============================================================
-- Migration 012: records 에 memo_public 추가
-- 기록 등록 시 함께 작성하는 '한마디(memo)' 의 공개 여부를 행 단위로 저장.
-- 기본값 FALSE (비공개) — 기존 행은 비공개로 간주되어 본인만 볼 수 있다.
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS memo_public BOOLEAN NOT NULL DEFAULT FALSE;
