-- ============================================================
-- Migration 003: play_logs dedup by (song_id, session_id)
-- 클라이언트가 sessionStorage UUID를 session_id로 전송하여
-- 동일 세션 내 /play 반복 호출이 카운트에 누적되지 않도록 한다.
-- ============================================================

-- 기존 데이터는 서버가 uuid4를 매 요청마다 새로 발급했으므로
-- (song_id, session_id)는 자연스럽게 unique 상태.
-- 혹시 있을 중복 제거 (동일 song_id + session_id 중 가장 오래된 것만 유지)
DELETE FROM play_logs a
USING play_logs b
WHERE a.ctid > b.ctid
  AND a.song_id = b.song_id
  AND a.session_id = b.session_id;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_play_logs_song_session
  ON play_logs (song_id, session_id);
