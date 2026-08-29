-- ============================================================
-- Migration 013: 랭킹 페이지 집계 가속 인덱스
-- ============================================================

-- 곡별 1위 집계용. user_best CTE의 DISTINCT ON 정렬에 매칭.
CREATE INDEX IF NOT EXISTS idx_records_song_judgment
  ON records (song_id, judgment_percent DESC, created_at ASC)
  WHERE judgment_percent IS NOT NULL
    AND visibility IN ('public', 'anonymous');

-- /api/rankings/users/:id/records 의 사용자별 곡-베스트 집계용.
CREATE INDEX IF NOT EXISTS idx_records_user_song_judgment
  ON records (user_id, song_id, judgment_percent DESC, created_at ASC)
  WHERE judgment_percent IS NOT NULL;
