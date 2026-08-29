-- ============================================================
-- Migration 017: 피드백 (버그 신고 + 기능 제안) 시스템
--
-- 기존 records의 곡별 간이 feedback 테이블과는 별도. 앱 전반의 버그/기능 요청용.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback_items (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_nick  VARCHAR(30) NOT NULL DEFAULT '',
  tab          VARCHAR(10)  NOT NULL
                 CHECK (tab IN ('bug', 'feature')),
  type         VARCHAR(20)  NOT NULL,
  title        VARCHAR(120) NOT NULL,
  body         VARCHAR(2000) NOT NULL,
  -- bug 전용. feature는 'low' 고정.
  severity     VARCHAR(10)  NOT NULL DEFAULT 'med'
                 CHECK (severity IN ('low', 'med', 'high')),
  -- bug에서 곡과 연관된 경우. song 삭제돼도 snapshot으로 남김.
  song_id      INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  song_title   VARCHAR(200) NOT NULL DEFAULT '',
  status       VARCHAR(15)  NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_review', 'resolved', 'rejected')),
  -- 정렬용 denormalized count. feedback_votes 변경 시 함께 갱신.
  votes        INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_tab_created
  ON feedback_items (tab, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_items_tab_votes
  ON feedback_items (tab, votes DESC, created_at DESC);

-- 사용자별 vote 토글 추적. 익명 vote는 허용하지 않는다.
CREATE TABLE IF NOT EXISTS feedback_votes (
  feedback_id  INTEGER NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feedback_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_votes_user
  ON feedback_votes (user_id);
