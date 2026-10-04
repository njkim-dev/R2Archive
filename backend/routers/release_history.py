from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from database import get_conn


router = APIRouter(prefix="/api", tags=["release-history"])


class ReleaseHistorySong(BaseModel):
    name: str
    artist: str
    levels: list[float]


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
                "SELECT s.game_release_date, n.url, s.name, s.artist, "
                "       ARRAY_AGG(DISTINCT s.level ORDER BY s.level) "
                "         FILTER (WHERE s.level IS NOT NULL) AS levels "
                "FROM songs s "
                "LEFT JOIN notices n ON n.release_date = s.game_release_date "
                "WHERE s.game_release_date IS NOT NULL "
                "GROUP BY s.game_release_date, n.url, s.name, s.artist "
                "ORDER BY s.game_release_date DESC, LOWER(s.name), LOWER(s.artist)"
            )
            rows = cur.fetchall()

    grouped: dict[date, ReleaseHistoryEntry] = {}
    for release_date, notice_url, name, artist, levels in rows:
        entry = grouped.get(release_date)
        if entry is None:
            entry = ReleaseHistoryEntry(
                release_date=release_date,
                notice_url=notice_url,
                songs=[],
            )
            grouped[release_date] = entry
        entry.songs.append(
            ReleaseHistorySong(
                name=name or "",
                artist=artist or "",
                levels=[float(level) for level in (levels or [])],
            )
        )

    return list(grouped.values())
