-- ============================================================
-- Migration 015: users.searchable — 닉네임 검색 허용 정책
--   public  : 누구나 검색 가능 (기본)
--   group   : 동일 그룹 멤버에게만 검색 가능. 그룹 미가입 시 사실상 비허용.
--   private : 검색 불가
-- 검색 정책은 /api/rankings/users (검색)과 /api/rankings/users/{id}/records
-- (핀 후 기록 조회) 양쪽에 동일 적용된다.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS searchable VARCHAR(10) NOT NULL DEFAULT 'public'
    CHECK (searchable IN ('public', 'group', 'private'));
