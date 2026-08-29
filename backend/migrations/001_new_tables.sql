-- ============================================================
-- Migration 001: perceived_difficulty, feedback, records
-- ============================================================

-- 익명 댓글 자동 닉네임 전역 순번
CREATE SEQUENCE IF NOT EXISTS anon_comment_seq START 1;

-- 유저 체감 난이도 투표
CREATE TABLE IF NOT EXISTS perceived_difficulty (
  id          SERIAL PRIMARY KEY,
  song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id     VARCHAR(255),        -- 로그인 유저 ID (추후 OAuth 연동)
  anon_id     VARCHAR(255),        -- 브라우저 UUID (비회원)
  level       NUMERIC(3,1) NOT NULL CHECK (level >= 0.5 AND level <= 12.0),
  opinion     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_perceived_identity CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

-- 동일 곡에 동일 유저/익명 중복 투표 방지
CREATE UNIQUE INDEX IF NOT EXISTS uidx_perceived_user
  ON perceived_difficulty (song_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_perceived_anon
  ON perceived_difficulty (song_id, anon_id)
  WHERE anon_id IS NOT NULL;

-- 피드백 (비회원 허용, 익명 처리)
CREATE TABLE IF NOT EXISTS feedback (
  id          SERIAL PRIMARY KEY,
  song_id     INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  anon_id     VARCHAR(255) NOT NULL,  -- 전송자 식별 (UI에서 익명 표시)
  type        VARCHAR(50)  NOT NULL
                CHECK (type IN ('bpm','combo','time','record_delete','comment_delete')),
  body        TEXT NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','processing','completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  admin_note  TEXT
  -- TODO: 관리자 페이지에서 status 변경, admin_note 작성
);

-- 성과 등록 / 리더보드
CREATE TABLE IF NOT EXISTS records (
  id          SERIAL PRIMARY KEY,
  song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  anon_id     VARCHAR(255),          -- 비회원 식별
  user_id     VARCHAR(255),          -- 로그인 유저 (추후)
  nickname    VARCHAR(100) NOT NULL,
  score       INTEGER,
  combo       INTEGER,
  youtube_url VARCHAR(500),
  memo        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
