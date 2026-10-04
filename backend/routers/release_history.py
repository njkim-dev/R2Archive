from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from database import get_conn


router = APIRouter(prefix="/api", tags=["release-history"])


class ReleaseHistoryVariant(BaseModel):
    id: int
    level: float


class ReleaseHistorySong(BaseModel):
    name: str
    artist: str
    image: str | None = None
    levels: list[float]
    variants: list[ReleaseHistoryVariant]


class ReleaseHistoryEntry(BaseModel):
    release_date: date
    notice_url: str | None = None
    songs: list[ReleaseHistorySong]


@router.get("/release-history", response_model=list[ReleaseHistoryEntry])
def get_release_history():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "WITH notices AS ("
                "  SELECT release_date, MIN(url) AS url "
                "  FROM release_history "
                "  GROUP BY release_date"
                ") "
                "SELECT s.game_release_date, n.url, s.name, s.artist, MIN(s.image), "
                "       JSONB_AGG(JSONB_BUILD_OBJECT('id', s.id, 'level', s.level) "
                "         ORDER BY s.level, s.id) FILTER (WHERE s.level IS NOT NULL) AS variants "
                "FROM songs s "
                "LEFT JOIN notices n ON n.release_date = s.game_release_date "
                "WHERE s.game_release_date IS NOT NULL "
                "GROUP BY s.game_release_date, n.url, s.name, s.artist "
                "ORDER BY s.game_release_date DESC, LOWER(s.name), LOWER(s.artist)"
            )
            rows = cur.fetchall()

    grouped: dict[date, ReleaseHistoryEntry] = {}
    for release_date, notice_url, name, artist, image, raw_variants in rows:
        entry = grouped.get(release_date)
        if entry is None:
            entry = ReleaseHistoryEntry(
                release_date=release_date,
                notice_url=notice_url,
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
                levels=[variant.level for variant in variants],
                variants=variants,
            )
        )

    return list(grouped.values())
