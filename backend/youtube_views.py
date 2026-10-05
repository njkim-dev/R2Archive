from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YOUTUBE_VIEW_ONLY_CHANNEL_IDS = frozenset(
    {
        "UCAR5Euqj20YJ1R3joEorAxA",  # R2 Music Box
        "UCvdDuPYST8jUgmXDeTGRWBQ",  # 알투비트 R2BEAT MUSIC
    }
)


@dataclass(frozen=True)
class YoutubeViewData:
    count: int = 0
    youtube_only: bool = False


def extract_youtube_video_id(url: str | None) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", raw):
        raw = f"https://{raw}"
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower()
    candidate = None
    if host in {"youtu.be", "www.youtu.be"}:
        candidate = parsed.path.strip("/").split("/", 1)[0]
    elif host == "youtube.com" or host.endswith(".youtube.com"):
        if parsed.path.rstrip("/") == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [None])[0]
        else:
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
                candidate = parts[1]

    return candidate if candidate and _VIDEO_ID_RE.fullmatch(candidate) else None


def load_youtube_view_data(cur) -> dict[str, YoutubeViewData]:
    cur.execute(
        """
        SELECT DISTINCT ON (video_id) video_id, youtube_view_count, channel_id
        FROM youtube_channel_videos
        ORDER BY video_id, view_count_updated_at DESC NULLS LAST
        """
    )
    return {
        row[0]: YoutubeViewData(
            count=int(row[1] or 0),
            youtube_only=row[2] in _YOUTUBE_VIEW_ONLY_CHANNEL_IDS,
        )
        for row in cur.fetchall()
    }


def youtube_view_data_for_url(
    url: str | None,
    data: dict[str, YoutubeViewData],
) -> YoutubeViewData:
    video_id = extract_youtube_video_id(url)
    return data.get(video_id, YoutubeViewData()) if video_id else YoutubeViewData()


def youtube_view_fields_for_url(
    url: str | None,
    data: dict[str, YoutubeViewData],
) -> dict[str, int | bool]:
    value = youtube_view_data_for_url(url, data)
    return {
        "youtube_view_count": value.count,
        "youtube_view_count_only": value.youtube_only,
    }
