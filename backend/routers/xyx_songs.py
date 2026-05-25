from fastapi import APIRouter, HTTPException, Request
from functools import lru_cache
from pathlib import Path

from auth import get_current_user_id, require_admin, require_user_id
from database import get_conn
from models import BpmPoint, MetaResponse, PlayLogCreate, SongDetail, SongListItem, SongServerCounterpart
from rate_limit import limiter

router = APIRouter(prefix="/api", tags=["xyx-songs"])
PROJECT_ROOT = Path(__file__).resolve().parents[2]

ACTIVE_SQL = "COALESCE(is_removed, FALSE) IS FALSE"
ACTIVE_ALIAS_SQL = "COALESCE(s.is_removed, FALSE) IS FALSE"
REMOVED_ALIAS_SQL = "COALESCE(s.is_removed, FALSE) IS TRUE"


def _parse_bpm_timeline(raw: str) -> list[BpmPoint]:
    if not raw:
        return []
    points = []
    for segment in raw.split("|"):
        segment = segment.strip()
        if not segment:
            continue
        try:
            frame_str, bpm_str = segment.split(":", 1)
            points.append(BpmPoint(time=round(int(frame_str) / 60, 1), bpm=float(bpm_str)))
        except Exception:
            continue
    return points


def _song_aliases(korea_name: str | None) -> list[str]:
    korea_name = (korea_name or "").strip()
    return [korea_name] if korea_name else []


@lru_cache(maxsize=10000)
def _static_asset_exists(prefix: str, image: str) -> bool:
    return (PROJECT_ROOT / prefix / Path(*image.split("/"))).exists()


def _xyx_image_path(image: str | None, *, fallback_to_korea: bool = False) -> str | None:
    image = (image or "").strip().replace("\\", "/")
    if not image:
        return None
    if image.startswith("xyx/"):
        image = image[4:]
    if image.startswith("rnr_image/"):
        if _static_asset_exists("xyx", image):
            return f"xyx/{image}"
        if fallback_to_korea and _static_asset_exists("", image):
            return image
        return None
    return image


def _is_admin(cur, request: Request) -> bool:
    uid = get_current_user_id(request)
    if uid is None:
        return False
    cur.execute("SELECT is_admin FROM users WHERE id = %s", (uid,))
    row = cur.fetchone()
    return bool(row and row[0])


def _rows_to_song_items(
    rows,
    play_counts: dict[tuple, int],
    perceived: dict[int, tuple],
    favorite_counts: dict[int, int],
    *,
    removed: bool = False,
) -> list[SongListItem]:
    songs = []
    for row in rows:
        (
            sid,
            name,
            korea_name,
            artist,
            level,
            bpm,
            combo,
            time_,
            change_bpm,
            yt_url,
            stat,
            file_order,
            image,
        ) = row
        p_avg, p_votes = perceived.get(sid, (None, 0))
        songs.append(
            SongListItem(
                id=sid,
                name=name or "",
                korea_name=korea_name or "",
                artist=artist or "",
                level=float(level or 0),
                bpm=float(bpm or 0),
                combo=int(combo or 0),
                time=time_ or "",
                youtube_url=yt_url or "",
                is_new=bool(stat),
                file_order=int(file_order or 0),
                play_count=play_counts.get((name, artist), 0),
                favorite_count=favorite_counts.get(sid, 0),
                is_change=bool(change_bpm),
                image=_xyx_image_path(image, fallback_to_korea=removed),
                user_level_avg=round(p_avg, 2) if p_avg is not None else None,
                user_level_votes=int(p_votes),
                aliases=_song_aliases(korea_name),
            )
        )
    return songs


def _fetch_song_items(removed: bool = False, request: Request | None = None) -> list[SongListItem]:
    where_sql = REMOVED_ALIAS_SQL if removed else ACTIVE_ALIAS_SQL
    with get_conn() as conn:
        with conn.cursor() as cur:
            include_removed_korea_names = removed or (request is not None and _is_admin(cur, request))
            cur.execute(
                "SELECT s.name, s.artist, COUNT(*) "
                "FROM xyx_play_logs pl "
                "JOIN xyx_songs s ON s.id = pl.song_id "
                "WHERE pl.played_at >= NOW() - INTERVAL '30 days' "
                f"AND {where_sql} "
                "GROUP BY s.name, s.artist"
            )
            play_counts = {(r[0], r[1]): r[2] for r in cur.fetchall()}

            cur.execute(
                """
                WITH visible_korea_names AS (
                    SELECT l.xyx_song_id, MIN(ks.name) AS korea_name
                    FROM song_server_links l
                    JOIN songs ks ON ks.id = l.kr_song_id
                    WHERE l.confidence = 100
                      AND (COALESCE(ks.is_removed, FALSE) IS FALSE OR %s)
                    GROUP BY l.xyx_song_id
                    HAVING COUNT(DISTINCT ks.name) = 1
                )
                SELECT s.id, s.name, vkn.korea_name, s.artist, s.level, s.bpm, s.combo,
                       COALESCE(s.real_time, s.time) AS time,
                       s.change_bpm, s.youtube_url, s.stat, s.file_order, s.image
                FROM xyx_songs s
                LEFT JOIN visible_korea_names vkn ON vkn.xyx_song_id = s.id
                """
                f"WHERE {where_sql} "
                "ORDER BY s.stat DESC NULLS LAST, s.file_order DESC NULLS LAST",
                (include_removed_korea_names,),
            )
            rows = cur.fetchall()
            cur.execute(
                "SELECT song_id, AVG(level)::float, COUNT(*) "
                "FROM xyx_perceived_difficulty GROUP BY song_id"
            )
            perceived = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            cur.execute(
                "SELECT song_id, COUNT(*)::int "
                "FROM xyx_user_favorites GROUP BY song_id"
            )
            favorite_counts = {r[0]: r[1] for r in cur.fetchall()}
    return _rows_to_song_items(rows, play_counts, perceived, favorite_counts, removed=removed)


@router.get("/xyx/meta", response_model=MetaResponse)
def get_xyx_meta():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM xyx_songs WHERE {ACTIVE_SQL}")
            total_count = cur.fetchone()[0]

            cur.execute(f"SELECT COUNT(*) FROM xyx_songs WHERE stat IS TRUE AND {ACTIVE_SQL}")
            new_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(DISTINCT (s.name, s.artist)) "
                "FROM xyx_play_logs pl JOIN xyx_songs s ON s.id = pl.song_id "
                f"WHERE {ACTIVE_ALIAS_SQL}"
            )
            played_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM xyx_songs "
                f"WHERE change_bpm IS NOT NULL AND change_bpm != '' AND {ACTIVE_SQL}"
            )
            change_count = cur.fetchone()[0]

            cur.execute(
                "SELECT artist FROM xyx_songs "
                f"WHERE artist IS NOT NULL AND artist != '' AND {ACTIVE_SQL} "
                "GROUP BY artist ORDER BY COUNT(*) DESC LIMIT 20"
            )
            top_artists = [r[0] for r in cur.fetchall()]

            cur.execute(
                "SELECT COALESCE(FLOOR(MIN(bpm))::int, 0), COALESCE(CEIL(MAX(bpm))::int, 300) "
                f"FROM xyx_songs WHERE bpm IS NOT NULL AND {ACTIVE_SQL}"
            )
            bpm_row = cur.fetchone()

            cur.execute(
                "SELECT COALESCE(MIN(level)::float, 0.5), COALESCE(MAX(level)::float, 12.0) "
                f"FROM xyx_songs WHERE level IS NOT NULL AND {ACTIVE_SQL}"
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


@router.get("/xyx/songs", response_model=list[SongListItem])
def get_xyx_songs(request: Request):
    return _fetch_song_items(removed=False, request=request)


@router.get("/xyx/songs/removed", response_model=list[SongListItem])
def get_removed_xyx_songs(request: Request):
    require_admin(request)
    return _fetch_song_items(removed=True, request=request)


@router.get("/xyx/songs/{song_id}", response_model=SongDetail)
def get_xyx_song(request: Request, song_id: int):
    counterpart = None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, artist, level, bpm, combo, "
                "COALESCE(real_time, time) AS time, "
                "change_bpm, youtube_url, stat, image, COALESCE(is_removed, FALSE), game_index "
                "FROM xyx_songs WHERE id = %s",
                (song_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Song not found")
            if row[11]:
                require_admin(request)
            viewer_is_admin = _is_admin(cur, request)

            cur.execute(
                "SELECT COUNT(*) FROM xyx_play_logs pl "
                "JOIN xyx_songs s ON s.id = pl.song_id "
                f"WHERE s.name = %s AND s.artist = %s AND {ACTIVE_ALIAS_SQL}",
                (row[1], row[2]),
            )
            play_count = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM xyx_play_logs pl "
                "JOIN xyx_songs s ON s.id = pl.song_id "
                "WHERE s.name = %s AND s.artist = %s "
                f"AND {ACTIVE_ALIAS_SQL} "
                "AND pl.played_at >= NOW() - INTERVAL '7 days'",
                (row[1], row[2]),
            )
            play_count_week = cur.fetchone()[0]

            cur.execute(
                """
                SELECT s.id, s.name, COALESCE(s.artist, ''), COALESCE(s.is_removed, FALSE)
                FROM song_server_links l
                JOIN songs s ON s.id = l.kr_song_id
                WHERE l.xyx_song_id = %s
                  AND l.confidence = 100
                  AND (COALESCE(s.is_removed, FALSE) IS FALSE OR %s)
                ORDER BY
                  COALESCE(s.is_removed, FALSE) ASC,
                  CASE WHEN ABS(COALESCE(s.level, 0)::float - COALESCE(%s, 0)::float) < 0.0001 THEN 0 ELSE 1 END,
                  CASE WHEN s.game_index = %s THEN 0 ELSE 1 END,
                  CASE WHEN l.match_source = 'user_confirmed' THEN 0 ELSE 1 END,
                  l.updated_at DESC,
                  s.id
                LIMIT 1
                """,
                (song_id, viewer_is_admin, row[3], row[12]),
            )
            counterpart_row = cur.fetchone()
            if counterpart_row:
                counterpart = SongServerCounterpart(
                    server="kr",
                    id=int(counterpart_row[0]),
                    name=counterpart_row[1] or "",
                    artist=counterpart_row[2] or "",
                    is_removed=bool(counterpart_row[3]),
                )

    sid, name, artist, level, bpm, combo, time_, change_bpm, yt_url, stat, image, is_removed, game_index = row
    base_bpm = float(bpm or 0)
    timeline = _parse_bpm_timeline(change_bpm or "")
    if timeline:
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
        image=_xyx_image_path(image, fallback_to_korea=is_removed),
        bpm_timeline=timeline,
        counterpart=counterpart,
    )


@router.post("/xyx/songs/{song_id}/play", status_code=204)
@limiter.limit("60/minute")
def log_xyx_play(request: Request, song_id: int, body: PlayLogCreate):
    uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM xyx_songs WHERE id = %s", (song_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Song not found")

            cur.execute(
                "INSERT INTO xyx_play_logs (song_id, played_at, session_id) "
                "VALUES (%s, NOW(), %s) "
                "ON CONFLICT (song_id, session_id) DO NOTHING",
                (song_id, body.session_id),
            )
            if uid is not None:
                cur.execute(
                    "INSERT INTO xyx_user_plays (user_id, song_id, play_count, last_played_at) "
                    "VALUES (%s, %s, 1, NOW()) "
                    "ON CONFLICT (user_id, song_id) "
                    "DO UPDATE SET play_count = xyx_user_plays.play_count + 1, "
                    "              last_played_at = NOW()",
                    (uid, song_id),
                )
        conn.commit()


@router.get("/users/me/xyx-flags")
def get_my_xyx_flags(request: Request):
    try:
        uid = require_user_id(request)
    except HTTPException:
        return {"favorites": [], "played": [], "played_all": []}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT song_id FROM xyx_user_favorites WHERE user_id = %s", (uid,))
            favorites = [r[0] for r in cur.fetchall()]

            cur.execute("SELECT song_id FROM xyx_user_plays WHERE user_id = %s", (uid,))
            played = [r[0] for r in cur.fetchall()]

            cur.execute(
                """
                SELECT DISTINCT s2.id
                FROM xyx_user_plays up
                JOIN xyx_songs s1 ON s1.id = up.song_id
                JOIN xyx_songs s2 ON s2.name = s1.name AND s2.artist = s1.artist
                WHERE up.user_id = %s
                """,
                (uid,),
            )
            played_all = [r[0] for r in cur.fetchall()]
    return {"favorites": favorites, "played": played, "played_all": played_all}


@router.post("/users/me/xyx-favorites/{song_id}", status_code=201)
def add_xyx_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM xyx_songs WHERE id = %s", (song_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Song not found")
            cur.execute(
                "INSERT INTO xyx_user_favorites (user_id, song_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}


@router.delete("/users/me/xyx-favorites/{song_id}")
def remove_xyx_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM xyx_user_favorites WHERE user_id = %s AND song_id = %s",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}
