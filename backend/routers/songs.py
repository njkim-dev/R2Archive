from fastapi import APIRouter, HTTPException, Request
from auth import get_current_user_id
from database import get_conn
from models import SongListItem, SongDetail, MetaResponse, BpmPoint, PlayLogCreate
from rate_limit import limiter

router = APIRouter(prefix="/api", tags=["songs"])


def _parse_bpm_timeline(raw: str) -> list[BpmPoint]:
    """DB 포맷 "frame:bpm|frame:bpm|..." 을 BpmPoint 리스트로 변환 (frame / 60 = 초)."""
    if not raw:
        return []
    points = []
    for segment in raw.split("|"):
        segment = segment.strip()
        if not segment:
            continue
        try:
            frame_str, bpm_str = segment.split(":", 1)
            seconds = round(int(frame_str) / 60, 1)
            bpm = float(bpm_str)
            points.append(BpmPoint(time=seconds, bpm=bpm))
        except Exception:
            continue
    return points


@router.get("/meta", response_model=MetaResponse)
def get_meta():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM songs")
            total_count = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM songs WHERE stat IS TRUE")
            new_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(DISTINCT (s.name, s.artist)) "
                "FROM play_logs pl JOIN songs s ON s.id = pl.song_id"
            )
            played_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM songs WHERE change_bpm IS NOT NULL AND change_bpm != ''"
            )
            change_count = cur.fetchone()[0]

            cur.execute(
                "SELECT artist FROM songs WHERE artist IS NOT NULL AND artist != '' "
                "GROUP BY artist ORDER BY COUNT(*) DESC LIMIT 20"
            )
            top_artists = [r[0] for r in cur.fetchall()]

            cur.execute(
                "SELECT COALESCE(FLOOR(MIN(bpm))::int, 0), COALESCE(CEIL(MAX(bpm))::int, 300) "
                "FROM songs WHERE bpm IS NOT NULL"
            )
            bpm_row = cur.fetchone()

            cur.execute(
                "SELECT COALESCE(MIN(level)::float, 0.5), COALESCE(MAX(level)::float, 12.0) "
                "FROM songs WHERE level IS NOT NULL"
            )
            level_row = cur.fetchone()

    return MetaResponse(
        total_count=total_count,
        new_count=new_count,
        played_count=played_count,
        change_count=change_count,
        top_artists=top_artists,
        bpm_min=bpm_row[0],
        bpm_max=bpm_row[1],
        level_min=level_row[0],
        level_max=level_row[1],
    )


@router.get("/songs", response_model=list[SongListItem])
def get_songs():
    """전체 곡 목록 — 클라이언트 사이드 필터링용."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 최근 30일 재생수 — name+artist 기준 집계 (동일 곡 다중 ID 대응)
            cur.execute(
                "SELECT s.name, s.artist, COUNT(*) FROM play_logs pl "
                "JOIN songs s ON s.id = pl.song_id "
                "WHERE pl.played_at >= NOW() - INTERVAL '30 days' "
                "GROUP BY s.name, s.artist"
            )
            play_counts: dict[tuple, int] = {(r[0], r[1]): r[2] for r in cur.fetchall()}

            cur.execute(
                "SELECT song_id, AVG(level)::float, COUNT(*) "
                "FROM perceived_difficulty GROUP BY song_id"
            )
            perceived: dict[int, tuple] = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

            cur.execute(
                "SELECT s.id, s.name, s.artist, s.level, s.bpm, s.combo, "
                "COALESCE(s.real_time, s.time) AS time, "
                "s.change_bpm, s.youtube_url, s.stat, s.file_order, s.image, "
                "COALESCE(array_agg(sa.alias) FILTER (WHERE sa.alias IS NOT NULL), ARRAY[]::text[]) AS aliases "
                "FROM songs s "
                "LEFT JOIN song_aliases sa ON s.id = sa.song_id "
                "GROUP BY s.id, s.name, s.artist, s.level, s.bpm, s.combo, s.time, s.real_time, "
                "s.change_bpm, s.youtube_url, s.stat, s.file_order, s.image "
                "ORDER BY s.stat DESC NULLS LAST, s.file_order DESC NULLS LAST"
            )
            rows = cur.fetchall()

    songs = []
    for row in rows:
        sid, name, artist, level, bpm, combo, time_, change_bpm, yt_url, stat, file_order, image, aliases = row
        p_avg, p_votes = perceived.get(sid, (None, 0))
        songs.append(SongListItem(
            id=sid,
            name=name or "",
            artist=artist or "",
            level=float(level or 0),
            bpm=float(bpm or 0),
            combo=int(combo or 0),
            time=time_ or "",
            youtube_url=yt_url or "",
            is_new=bool(stat),
            file_order=int(file_order or 0),
            play_count=play_counts.get((name, artist), 0),
            is_change=bool(change_bpm),
            image=image or None,
            user_level_avg=round(p_avg, 2) if p_avg is not None else None,
            user_level_votes=int(p_votes),
            aliases=list(aliases) if aliases else [],
        ))
    return songs


@router.get("/songs/{song_id}", response_model=SongDetail)
def get_song(song_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, artist, level, bpm, combo, "
                "COALESCE(real_time, time) AS time, "
                "change_bpm, youtube_url, stat, image FROM songs WHERE id = %s",
                (song_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="곡을 찾을 수 없습니다")

            # name+artist 기준으로 동일 곡 전체 집계
            cur.execute(
                "SELECT COUNT(*) FROM play_logs pl "
                "JOIN songs s ON s.id = pl.song_id "
                "WHERE s.name = %s AND s.artist = %s",
                (row[1], row[2])
            )
            play_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM play_logs pl "
                "JOIN songs s ON s.id = pl.song_id "
                "WHERE s.name = %s AND s.artist = %s "
                "AND pl.played_at >= NOW() - INTERVAL '7 days'",
                (row[1], row[2])
            )
            play_count_week = cur.fetchone()[0]

    sid, name, artist, level, bpm, combo, time_, change_bpm, yt_url, stat, image = row
    base_bpm = float(bpm or 0)
    timeline = _parse_bpm_timeline(change_bpm or "")
    if timeline:
        # change_bpm은 변속 구간만 담고 있어 첫 포인트가 time>0일 수 있음.
        # 그래프 시작점 보정을 위해 곡의 기본 BPM을 time=0에 prepend.
        if timeline[0].time > 0:
            timeline = [BpmPoint(time=0.0, bpm=base_bpm)] + timeline
    else:
        timeline = [BpmPoint(time=0.0, bpm=base_bpm)]

    return SongDetail(
        id=sid,
        name=name or "",
        artist=artist or "",
        level=float(level or 0),
        bpm=float(bpm or 0),
        combo=int(combo or 0),
        time=time_ or "",
        youtube_url=yt_url or "",
        is_new=bool(stat),
        play_count=int(play_count),
        play_count_week=int(play_count_week),
        is_change=bool(change_bpm),
        image=image or None,
        bpm_timeline=timeline,
    )


@router.post("/songs/{song_id}/play", status_code=204)
@limiter.limit("60/minute")
def log_play(request: Request, song_id: int, body: PlayLogCreate):
    uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO play_logs (song_id, played_at, session_id) "
                "VALUES (%s, NOW(), %s) "
                "ON CONFLICT (song_id, session_id) DO NOTHING",
                (song_id, body.session_id)
            )
            if uid is not None:
                cur.execute(
                    "INSERT INTO user_plays (user_id, song_id, play_count, last_played_at) "
                    "VALUES (%s, %s, 1, NOW()) "
                    "ON CONFLICT (user_id, song_id) "
                    "DO UPDATE SET play_count = user_plays.play_count + 1, "
                    "              last_played_at = NOW()",
                    (uid, song_id),
                )
        conn.commit()
