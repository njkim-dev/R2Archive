from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel, Field

from database import get_conn


router = APIRouter(prefix="/api", tags=["release-history"])


class ReleaseHistoryVariant(BaseModel):
    id: int
    level: float


class ReleaseHistorySong(BaseModel):
    name: str
    artist: str
    image: str | None = None
    youtube_url: str | None = None
    is_deleted: bool = False
    levels: list[float]
    variants: list[ReleaseHistoryVariant]


class ReleaseHistoryEntry(BaseModel):
    release_date: date
    notice_url: str | None = None
    notice_urls: list[str] = Field(default_factory=list)
    songs: list[ReleaseHistorySong]


@router.get("/release-history", response_model=list[ReleaseHistoryEntry])
def get_release_history():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "WITH notices AS ("
                "  SELECT event_date, ARRAY_AGG(DISTINCT url ORDER BY url) "
                "    FILTER (WHERE NULLIF(BTRIM(url), '') IS NOT NULL) AS urls "
                "  FROM ("
                "    SELECT release_date AS event_date, url FROM release_history "
                "    UNION ALL "
                "    SELECT delete_date AS event_date, url FROM delete_date"
                "  ) notice_rows "
                "  WHERE NULLIF(BTRIM(url), '') IS NOT NULL "
                "  GROUP BY event_date"
                "), song_events AS ("
                "  SELECT game_release_date AS event_date, FALSE AS is_deleted, "
                "         id, name, artist, image, youtube_url, level "
                "  FROM songs WHERE game_release_date IS NOT NULL "
                "  UNION ALL "
                "  SELECT game_delete_date AS event_date, TRUE AS is_deleted, "
                "         id, name, artist, image, youtube_url, level "
                "  FROM songs WHERE game_delete_date IS NOT NULL"
                ") "
                "SELECT e.event_date, COALESCE(n.urls, ARRAY[]::text[]), "
                "       e.name, e.artist, MIN(e.image), "
                "       MIN(NULLIF(BTRIM(e.youtube_url), '')), e.is_deleted, "
                "       JSONB_AGG(JSONB_BUILD_OBJECT('id', e.id, 'level', e.level) "
                "         ORDER BY e.level, e.id) FILTER (WHERE e.level IS NOT NULL) AS variants "
                "FROM song_events e "
                "JOIN notices n ON n.event_date = e.event_date "
                "GROUP BY e.event_date, n.urls, e.name, e.artist, e.is_deleted "
                "ORDER BY e.event_date DESC, e.is_deleted, LOWER(e.name), LOWER(e.artist)"
            )
            rows = cur.fetchall()

    grouped: dict[date, ReleaseHistoryEntry] = {}
    for release_date, notice_urls, name, artist, image, youtube_url, is_deleted, raw_variants in rows:
        notice_urls = list(notice_urls or [])
        entry = grouped.get(release_date)
        if entry is None:
            entry = ReleaseHistoryEntry(
                release_date=release_date,
                notice_url=notice_urls[0] if notice_urls else None,
                notice_urls=notice_urls,
                songs=[],
            )
            grouped[release_date] = entry
        variants_by_level: dict[float, ReleaseHistoryVariant] = {}
        for variant in raw_variants or []:
            level = float(variant["level"])
            variants_by_level.setdefault(
                level,
                ReleaseHistoryVariant(id=int(variant["id"]), level=level),
            )
        variants = [variants_by_level[level] for level in sorted(variants_by_level)]
        entry.songs.append(
            ReleaseHistorySong(
                name=name or "",
                artist=artist or "",
                image=image,
                youtube_url=youtube_url,
                is_deleted=bool(is_deleted),
                levels=[variant.level for variant in variants],
                variants=variants,
            )
        )

    return list(grouped.values())
