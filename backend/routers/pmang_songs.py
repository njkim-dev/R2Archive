from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from database import get_conn

router = APIRouter(prefix="/api", tags=["pmang_songs"])


def _norm(value: str | None) -> str:
    return "".join((value or "").lower().split())


class PmangSongListItem(BaseModel):
    id: int
    name: str
    artist: str
    level: int
    image: Optional[str] = None
    game_index: int
    youtube_url: Optional[str] = None
    matched_song_id: Optional[int] = None
    aliases: list[str] = []


@router.get("/pmang-songs", response_model=list[PmangSongListItem])
def get_pmang_songs():
    """과거 피망곡 목록. youtube_url은 pmang_songs 값을 우선하고, 없으면 기존 곡 매칭값을 사용한다."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, artist, level, image, game_index, youtube_url
                FROM pmang_songs
                ORDER BY game_index
                """
            )
            pmang_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                  s.id,
                  s.name,
                  s.artist,
                  s.youtube_url,
                  COALESCE(array_agg(DISTINCT sa.alias) FILTER (
                    WHERE sa.alias IS NOT NULL AND sa.alias <> ''
                  ), ARRAY[]::text[]) AS aliases
                FROM songs s
                LEFT JOIN song_aliases sa ON s.id = sa.song_id
                GROUP BY s.id, s.name, s.artist, s.youtube_url, s.file_order
                ORDER BY
                  (NULLIF(s.youtube_url, '') IS NOT NULL) DESC,
                  s.file_order DESC NULLS LAST,
                  s.id DESC
                """
            )
            song_rows = cur.fetchall()

    exact_matches: dict[tuple[str, str], dict] = {}
    alias_matches: dict[tuple[str, str], dict] = {}

    for sid, name, artist, youtube_url, aliases in song_rows:
        item = {
            "id": sid,
            "youtube_url": youtube_url or None,
            "aliases": list(aliases) if aliases else [],
        }
        artist_key = _norm(artist)
        name_key = _norm(name)
        if name_key and artist_key:
            exact_matches.setdefault((name_key, artist_key), item)
        for alias in item["aliases"]:
            alias_key = _norm(alias)
            if alias_key and artist_key:
                alias_matches.setdefault((alias_key, artist_key), item)

    result = []
    for sid, name, artist, level, image, game_index, direct_youtube_url in pmang_rows:
        artist_key = _norm(artist)
        name_key = _norm(name)
        match = (
            exact_matches.get((name_key, artist_key))
            or alias_matches.get((name_key, artist_key))
        )
        direct_url = (direct_youtube_url or "").strip() or None
        matched_url = match["youtube_url"] if match else None
        result.append(
            PmangSongListItem(
                id=sid,
                name=name or "",
                artist=artist or "",
                level=level,
                image=image,
                game_index=game_index,
                youtube_url=direct_url or matched_url,
                matched_song_id=match["id"] if match else None,
                aliases=match["aliases"] if match else [],
            )
        )

    return result
