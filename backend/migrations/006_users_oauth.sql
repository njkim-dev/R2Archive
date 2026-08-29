-- ============================================================
-- Migration 006: OAuth 회원 테이블
-- 수집 정보는 (provider, provider_uid)뿐. 이름/이메일/프로필은 저장하지 않는다.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  provider            VARCHAR(16)  NOT NULL
                        CHECK (provider IN ('kakao', 'naver', 'google', 'stub')),
  provider_uid        VARCHAR(255) NOT NULL,
  nickname            VARCHAR(30),
  default_visibility  VARCHAR(10)  NOT NULL DEFAULT 'public'
                        CHECK (default_visibility IN ('public', 'anonymous', 'private')),
  onboarded           BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_uid)
);

-- 닉네임은 공개(public/anonymous도 본인에게는 실명) 시 중복 허용 (서비스 정책상 허용).
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users (nickname);
