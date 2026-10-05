from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


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


def load_youtube_view_counts(cur) -> dict[str, int]:
    cur.execute(
        """
        SELECT video_id, MAX(youtube_view_count)::bigint
        FROM youtube_channel_videos
        GROUP BY video_id
        """
    )
    return {row[0]: int(row[1] or 0) for row in cur.fetchall()}


def youtube_view_count_for_url(url: str | None, counts: dict[str, int]) -> int:
    video_id = extract_youtube_video_id(url)
    return counts.get(video_id, 0) if video_id else 0
