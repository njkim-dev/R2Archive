from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from auth import require_admin
from database import get_conn

router = APIRouter(prefix="/api/admin", tags=["youtube_candidates"])


class YoutubeCandidateListItem(BaseModel):
    candidate_id: int
    id: int
    name: str
    artist: str
    level: float
    bpm: float
    combo: int
    time: str
    youtube_url: str
    is_new: bool
    file_order: int
    play_count: int
    favorite_count: int = 0
    is_change: bool
    image: Optional[str] = None
    user_level_avg: Optional[float] = None
    user_level_votes: int = 0
    aliases: list[str] = []
    youtube_candidate: bool = True
    candidate_status: str
    candidate_video_title: Optional[str] = None
    candidate_rank: int
    candidate_score: Optional[float] = None
    candidate_song_count: int
    candidate_created_at: Optional[datetime] = None


class PmangYoutubeCandidateListItem(BaseModel):
    candidate_id: int
    id: int
    name: str
    artist: str
    level: int
    bpm: float = 0.0
    bpm_max: Optional[float] = None
    bpm_display: Optional[str] = None
    combo: int = 0
    image: Optional[str] = None
    game_index: int
    youtube_url: str
    matched_song_id: Optional[int] = None
    favorite_count: int = 0
    aliases: list[str] = []
    youtube_candidate: bool = True
    candidate_status: str
    candidate_video_title: Optional[str] = None
    candidate_rank: int
    candidate_score: Optional[float] = None
    candidate_song_count: int
    candidate_created_at: Optional[datetime] = None


def _norm(value: str | None) -> str:
    return "".join((value or "").lower().split())


@router.get("/youtube-candidates", response_model=list[YoutubeCandidateListItem])
def get_youtube_candidates(
    request: Request,
    status: str = Query("pending", pattern="^(pending|approved|rejected|applied|all)$"),
):
    require_admin(request)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.name, s.artist, COUNT(*)
                FROM play_logs pl
                JOIN songs s ON s.id = pl.song_id
                WHERE pl.played_at >= NOW() - INTERVAL '30 days'
                GROUP BY s.name, s.artist
                """
            )
            play_counts: dict[tuple, int] = {(r[0], r[1]): r[2] for r in cur.fetchall()}

            cur.execute(
                "SELECT song_id, AVG(level)::float, COUNT(*) "
                "FROM perceived_difficulty GROUP BY song_id"
            )
            perceived: dict[int, tuple] = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

            cur.execute(
                """
                SELECT song_id, COUNT(*)::int
                FROM user_favorites
                GROUP BY song_id
                """
            )
            favorite_counts: dict[int, int] = {r[0]: r[1] for r in cur.fetchall()}

            cur.execute(
                """
                SELECT
                  c.id AS candidate_id,
                  s.id AS song_id,
                  COALESCE(s.name, c.name) AS name,
                  COALESCE(s.artist, c.artist) AS artist,
                  s.level,
                  s.bpm,
                  s.combo,
                  COALESCE(s.real_time, s.time) AS time,
                  c.youtube_url,
                  s.stat,
                  s.file_order,
                  s.image,
                  s.change_bpm,
                  COALESCE(array_agg(sa.alias) FILTER (WHERE sa.alias IS NOT NULL), ARRAY[]::text[]) AS aliases,
                  c.status,
                  c.video_title,
                  c.rank,
                  c.score::float,
                  c.song_count,
                  c.created_at
                FROM song_youtube_candidates c
                JOIN songs s ON s.id = c.song_id
                LEFT JOIN song_aliases sa ON sa.song_id = s.id
                WHERE (%s = 'all' OR c.status = %s)
                GROUP BY
                  c.id, s.id, s.name, s.artist, s.level, s.bpm, s.combo,
                  s.real_time, s.time, c.youtube_url, s.stat, s.file_order,
                  s.image, s.change_bpm, c.status, c.video_title, c.rank,
                  c.score, c.song_count, c.created_at
                ORDER BY c.created_at DESC, c.id DESC
                """,
                (status, status),
            )
            rows = cur.fetchall()

    result: list[YoutubeCandidateListItem] = []
    for row in rows:
        (
            candidate_id,
            song_id,
            name,
            artist,
            level,
            bpm,
            combo,
            time_,
            youtube_url,
            stat,
            file_order,
            image,
            change_bpm,
            aliases,
            cand_status,
            video_title,
            rank,
            score,
            song_count,
            created_at,
        ) = row
        p_avg, p_votes = perceived.get(song_id, (None, 0))
        result.append(
            YoutubeCandidateListItem(
                candidate_id=candidate_id,
                id=song_id,
                name=name or "",
                artist=artist or "",
                level=float(level or 0),
                bpm=float(bpm or 0),
                combo=int(combo or 0),
                time=time_ or "",
                youtube_url=youtube_url or "",
                is_new=bool(stat),
                file_order=int(file_order or 0),
                play_count=play_counts.get((name, artist), 0),
                favorite_count=favorite_counts.get(song_id, 0),
                is_change=bool(change_bpm),
                image=image or None,
                user_level_avg=round(p_avg, 2) if p_avg is not None else None,
                user_level_votes=int(p_votes),
                aliases=list(aliases) if aliases else [],
                candidate_status=cand_status,
                candidate_video_title=video_title,
                candidate_rank=int(rank or 0),
                candidate_score=score,
                candidate_song_count=int(song_count or 1),
                candidate_created_at=created_at,
            )
        )
    return result


@router.get("/pmang-youtube-candidates", response_model=list[PmangYoutubeCandidateListItem])
def get_pmang_youtube_candidates(
    request: Request,
    status: str = Query("pending", pattern="^(pending|approved|rejected|applied|all)$"),
):
    require_admin(request)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id,
                  c.song_id,
                  COALESCE(s.name, c.name) AS name,
                  COALESCE(s.artist, c.artist) AS artist,
                  c.youtube_url,
                  c.status,
                  c.video_title,
                  c.rank,
                  c.score::float,
                  c.song_count,
                  c.created_at,
                  COALESCE(array_agg(DISTINCT sa.alias) FILTER (
                    WHERE sa.alias IS NOT NULL AND sa.alias <> ''
                  ), ARRAY[]::text[]) AS aliases
                FROM song_youtube_candidates c
                LEFT JOIN songs s ON s.id = c.song_id
                LEFT JOIN song_aliases sa ON sa.song_id = s.id
                WHERE (%s = 'all' OR c.status = %s)
                GROUP BY
                  c.id, c.song_id, s.name, s.artist, c.name, c.artist,
                  c.youtube_url, c.status, c.video_title, c.rank, c.score,
                  c.song_count, c.created_at
                ORDER BY c.created_at DESC, c.id DESC
                """,
                (status, status),
            )
            candidate_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                  p.id, p.name, p.artist, p.level,
                  p.bpm, p.bpm_max, p.bpm_display, p.combo,
                  p.image, p.game_index, p.youtube_url,
                  COALESCE(f.favorite_count, 0) AS favorite_count
                FROM pmang_songs p
                LEFT JOIN (
                  SELECT song_id, COUNT(*)::int AS favorite_count
                  FROM pmang_favorites
                  GROUP BY song_id
                ) f ON f.song_id = p.id
                ORDER BY p.game_index
                """
            )
            pmang_rows = cur.fetchall()

    pmang_by_key: dict[tuple[str, str], list[tuple]] = {}
    for row in pmang_rows:
        _, name, artist, _, _, _, _, _, _, _, youtube_url, _ = row
        if (youtube_url or "").strip():
            continue
        key = (_norm(name), _norm(artist))
        if key[0] and key[1]:
            pmang_by_key.setdefault(key, []).append(row)

    result: list[PmangYoutubeCandidateListItem] = []
    seen: set[tuple[int, int]] = set()
    for row in candidate_rows:
        (
            candidate_id,
            matched_song_id,
            cand_name,
            cand_artist,
            youtube_url,
            cand_status,
            video_title,
            rank,
            score,
            song_count,
            created_at,
            aliases,
        ) = row
        artist_key = _norm(cand_artist)
        name_keys = {_norm(cand_name), *(_norm(a) for a in (aliases or []))}
        name_keys.discard("")

        for name_key in name_keys:
            for pmang in pmang_by_key.get((name_key, artist_key), []):
                (
                    pmang_id, name, artist, level,
                    bpm, bpm_max, bpm_display, combo,
                    image, game_index, _direct_url,
                    favorite_count,
                ) = pmang
                dedupe_key = (candidate_id, pmang_id)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                result.append(
                    PmangYoutubeCandidateListItem(
                        candidate_id=candidate_id,
                        id=pmang_id,
                        name=name or "",
                        artist=artist or "",
                        level=int(level or 0),
                        bpm=float(bpm or 0),
                        bpm_max=float(bpm_max) if bpm_max is not None else None,
                        bpm_display=bpm_display or None,
                        combo=int(combo or 0),
                        image=image or None,
                        game_index=int(game_index or 0),
                        youtube_url=youtube_url or "",
                        matched_song_id=matched_song_id,
                        favorite_count=int(favorite_count or 0),
                        aliases=list(aliases) if aliases else [],
                        candidate_status=cand_status,
                        candidate_video_title=video_title,
                        candidate_rank=int(rank or 0),
                        candidate_score=score,
                        candidate_song_count=int(song_count or 1),
                        candidate_created_at=created_at,
                    )
                )

    return result
