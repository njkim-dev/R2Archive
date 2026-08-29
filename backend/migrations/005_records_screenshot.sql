-- ============================================================
-- Migration 005: records에 판정%/공개설정 컬럼 추가
-- 스크린샷 기반 '랭킹' 기능을 위한 스키마 변경.
-- 기존 YouTube URL 기반 '성과 등록'은 동일 테이블에 공존한다.
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'anonymous', 'private'));

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS judgment_percent NUMERIC(6,3)
    CHECK (judgment_percent IS NULL
           OR (judgment_percent >= 0 AND judgment_percent <= 99.000));

-- 랭킹 조회 최적화
CREATE INDEX IF NOT EXISTS idx_records_song_ranking
  ON records (song_id, visibility, judgment_percent DESC NULLS LAST)
  WHERE judgment_percent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_records_user
  ON records (user_id) WHERE user_id IS NOT NULL;
