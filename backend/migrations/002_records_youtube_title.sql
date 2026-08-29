-- Migration 002: records 테이블에 youtube_title 컬럼 추가
ALTER TABLE records ADD COLUMN IF NOT EXISTS youtube_title VARCHAR(200);
