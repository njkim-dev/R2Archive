-- ============================================================
-- Migration 014: records 에 is_manual 컬럼 추가 (수동 입력 판정 기록 분리)
--
-- 사용자가 랭킹 페이지의 '편집 모드'에서 직접 입력한 판정%는 is_manual=TRUE.
-- 이 기록은:
--   - 랭킹(곡별 1위, TOP10)에 반영되지 않는다
--   - 본인 마이페이지 / 다른 사람의 닉네임 검색을 통한 프로필 조회에서는 노출된다
-- 스크린샷/유튜브 인증 기록과 manual 기록은 같은 행으로 공존하며,
-- '내 판정' 표시는 둘 중 더 높은 쪽을 사용한다 (프론트에서 처리).
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- 랭킹 집계는 is_manual=FALSE 행만 보므로, 기존 인덱스에 부분 조건 추가용 인덱스 신설.
-- 013에서 만든 idx_records_song_judgment 는 그대로 두되, manual 제외 변형을 추가.
CREATE INDEX IF NOT EXISTS idx_records_song_judgment_ranked
  ON records (song_id, judgment_percent DESC, created_at ASC)
  WHERE judgment_percent IS NOT NULL
    AND visibility IN ('public', 'anonymous')
    AND NOT is_manual;
