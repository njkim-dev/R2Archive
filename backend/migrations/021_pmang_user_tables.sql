-- ============================================================
-- Migration 021: 과거 피망곡 전용 유저 데이터 테이블
--
-- pmang_songs.id는 songs.id와 별개 SERIAL이라 본 게임 테이블
-- (user_favorites / comments / records)을 그대로 재사용하면 ID 충돌이 발생.
-- 따라서 동일 스키마의 병렬 테이블 3종을 신설:
--   - pmang_favorites    ← user_favorites
--   - pmang_comments     ← comments  (anon_comment_seq 재사용)
--   - pmang_achievements ← records   (성과/리더보드/플레이영상 통합)
--
-- 컬럼/제약/인덱스 정책은 본 게임 테이블과 1:1 동일하게 유지.
-- ============================================================


-- 1) 즐겨찾기 ----------------------------------------------------
--    원본: 008_user_favorites_plays.sql
CREATE TABLE IF NOT EXISTS pmang_favorites (
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id     INTEGER     NOT NULL REFERENCES pmang_songs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_pmang_favorites_song
  ON pmang_favorites (song_id);


-- 2) 댓글 -------------------------------------------------------
--    원본: 본 comments 테이블 (초기 마이그레이션 누락 + 011에서 user_id 추가).
--    nickname VARCHAR(100): user_id NULL인 익명 댓글에 자동 부여한 닉네임 저장용.
--    Migration 001에서 만든 anon_comment_seq를 그대로 재사용 (전역 순번).
CREATE TABLE IF NOT EXISTS pmang_comments (
  id          SERIAL       PRIMARY KEY,
  song_id     INTEGER      NOT NULL REFERENCES pmang_songs(id) ON DELETE CASCADE,
  user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  nickname    VARCHAR(100) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pmang_comments_song
  ON pmang_comments (song_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pmang_comments_user_id
  ON pmang_comments (user_id)
  WHERE user_id IS NOT NULL;


-- 3) 성과 (achievements) ----------------------------------------
--    원본: records (001) + 002/005/009/010/012/014/018에서 누적된 모든 컬럼.
--    user_id는 최신 컨벤션(008/016/017/019)대로 INTEGER FK로 설계 — 본 records는
--    초기 VARCHAR(255)로 시작했으나 신규 테이블에서는 처음부터 정합 타입 적용.
CREATE TABLE IF NOT EXISTS pmang_achievements (
  id                    SERIAL        PRIMARY KEY,
  song_id               INTEGER       NOT NULL REFERENCES pmang_songs(id) ON DELETE CASCADE,
  user_id               INTEGER       REFERENCES users(id) ON DELETE CASCADE,
  anon_id               VARCHAR(255),                       -- 비회원 식별
  nickname              VARCHAR(100)  NOT NULL,
  score                 INTEGER,
  judgment_percent      NUMERIC(6,3)
                          CHECK (judgment_percent IS NULL
                                 OR (judgment_percent >= 0 AND judgment_percent <= 99.000)),
  combo                 INTEGER,
  youtube_url           VARCHAR(500),
  youtube_title         VARCHAR(200),
  memo                  TEXT,
  memo_public           BOOLEAN       NOT NULL DEFAULT FALSE,
  visibility            VARCHAR(10)   NOT NULL DEFAULT 'public'
                          CHECK (visibility IN ('public', 'anonymous', 'private')),
  screenshot_path       VARCHAR(255),                       -- record_screenshots/ 이하 파일명
  screenshot_filename   VARCHAR(255),                       -- 업로드 원본 파일명
  is_manual             BOOLEAN       NOT NULL DEFAULT FALSE,
  is_play_video         BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 랭킹 조회 (원본: 005)
CREATE INDEX IF NOT EXISTS idx_pmang_achievements_song_ranking
  ON pmang_achievements (song_id, visibility, judgment_percent DESC NULLS LAST)
  WHERE judgment_percent IS NOT NULL;

-- manual 제외 판정 랭킹 (원본: 014)
CREATE INDEX IF NOT EXISTS idx_pmang_achievements_song_judgment_ranked
  ON pmang_achievements (song_id, judgment_percent DESC, created_at ASC)
  WHERE judgment_percent IS NOT NULL
    AND visibility IN ('public', 'anonymous')
    AND NOT is_manual;

-- 플레이 영상 조회 (원본: 018)
CREATE INDEX IF NOT EXISTS idx_pmang_achievements_song_play_video
  ON pmang_achievements (song_id)
  WHERE is_play_video = TRUE;

-- 본인 기록 조회 (원본: 005)
CREATE INDEX IF NOT EXISTS idx_pmang_achievements_user
  ON pmang_achievements (user_id)
  WHERE user_id IS NOT NULL;

-- 사용자당 동일 스크린샷 파일명 중복 업로드 방지 (원본: 010)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pmang_achievements_user_screenshot_filename
  ON pmang_achievements (user_id, screenshot_filename)
  WHERE user_id IS NOT NULL AND screenshot_filename IS NOT NULL;
