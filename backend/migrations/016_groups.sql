-- ============================================================
-- Migration 016: 그룹 인프라
--   groups              : 그룹 메타 (이름·설명·owner·자동수락·가입코드)
--   group_members       : (group, user) 멤버십 + 역할(owner|manager|member) + bio
--   group_applications  : 가입 신청 (auto_accept=FALSE 그룹에만 사용)
-- 그룹은 코드로만 가입 가능 — 공개 디스커버리 없음.
-- ============================================================

CREATE TABLE IF NOT EXISTS groups (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(40)  NOT NULL,
  description   VARCHAR(240) NOT NULL DEFAULT '',
  owner_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auto_accept   BOOLEAN      NOT NULL DEFAULT TRUE,
  join_code     VARCHAR(16)  NOT NULL UNIQUE,
  code_revoked  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id            SERIAL PRIMARY KEY,
  group_id      INTEGER      NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio           VARCHAR(80)  NOT NULL DEFAULT '',
  role          VARCHAR(10)  NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'manager', 'member')),
  joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user  ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members (group_id);

CREATE TABLE IF NOT EXISTS group_applications (
  id            SERIAL PRIMARY KEY,
  group_id      INTEGER      NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio           VARCHAR(80)  NOT NULL DEFAULT '',
  status        VARCHAR(10)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_apps_group_status
  ON group_applications (group_id, status);
-- 한 사용자가 한 그룹에 pending 신청은 1건만.
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_apps_pending
  ON group_applications (group_id, user_id) WHERE status = 'pending';
