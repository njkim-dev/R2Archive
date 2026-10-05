#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import psycopg2


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from youtube_views import extract_youtube_video_id


YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    for env_path in (ROOT / ".env", ROOT.parent / ".env"):
        if not env_path.exists():
            continue
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def db_config(env: dict[str, str]) -> dict[str, Any]:
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise SystemExit(f"Missing DB env values: {', '.join(missing)}")
    return {
        "host": env["DB_HOST"],
        "port": int(env["DB_PORT"]),
        "dbname": env["DB_NAME"],
        "user": env["DB_USER"],
        "password": env["DB_PASSWORD"],
    }


def youtube_get(api_key: str, video_ids: list[str]) -> dict[str, Any]:
    query = urllib.parse.urlencode({
        "part": "snippet,statistics",
        "id": ",".join(video_ids),
        "maxResults": 50,
        "key": api_key,
    })
    request = urllib.request.Request(
        f"{YOUTUBE_API_BASE}/videos?{query}",
        headers={"Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"YouTube API error {exc.code}: {body}") from exc


def fetch_linked_video_ids(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT youtube_url FROM songs
            WHERE NULLIF(BTRIM(COALESCE(youtube_url, '')), '') IS NOT NULL
            UNION
            SELECT youtube_url FROM xyx_songs
            WHERE NULLIF(BTRIM(COALESCE(youtube_url, '')), '') IS NOT NULL
            UNION
            SELECT youtube_url FROM pmang_songs
            WHERE NULLIF(BTRIM(COALESCE(youtube_url, '')), '') IS NOT NULL
            """
        )
        video_ids = {extract_youtube_video_id(row[0]) for row in cur.fetchall()}
    return sorted(video_id for video_id in video_ids if video_id)


def fetch_video_statistics(api_key: str, video_ids: list[str]) -> list[dict[str, Any]]:
    videos: list[dict[str, Any]] = []
    for offset in range(0, len(video_ids), 50):
        data = youtube_get(api_key, video_ids[offset:offset + 50])
        for item in data.get("items") or []:
            snippet = item.get("snippet") or {}
            statistics = item.get("statistics") or {}
            video_id = item.get("id")
            channel_id = snippet.get("channelId")
            if not video_id or not channel_id or "viewCount" not in statistics:
                continue
            thumbnails = snippet.get("thumbnails") or {}
            thumbnail_url = (
                thumbnails.get("high")
                or thumbnails.get("medium")
                or thumbnails.get("default")
                or {}
            ).get("url")
            videos.append({
                "channel_id": channel_id,
                "channel_title": snippet.get("channelTitle") or "",
                "video_id": video_id,
                "video_title": snippet.get("title") or "",
                "video_description": snippet.get("description") or "",
                "published_at": snippet.get("publishedAt"),
                "thumbnail_url": thumbnail_url,
                "youtube_view_count": int(statistics["viewCount"]),
            })
    return videos


def save_video_statistics(conn, videos: list[dict[str, Any]]) -> int:
    sql = """
      INSERT INTO youtube_channel_videos (
        channel_id, channel_title, video_id, video_title, video_description,
        published_at, thumbnail_url, youtube_view_count, view_count_updated_at
      ) VALUES (
        %(channel_id)s, %(channel_title)s, %(video_id)s, %(video_title)s,
        %(video_description)s, %(published_at)s, %(thumbnail_url)s,
        %(youtube_view_count)s, now()
      )
      ON CONFLICT (channel_id, video_id) DO UPDATE SET
        channel_title = EXCLUDED.channel_title,
        video_title = EXCLUDED.video_title,
        video_description = EXCLUDED.video_description,
        published_at = EXCLUDED.published_at,
        thumbnail_url = EXCLUDED.thumbnail_url,
        youtube_view_count = EXCLUDED.youtube_view_count,
        view_count_updated_at = now(),
        updated_at = now()
    """
    with conn.cursor() as cur:
        for video in videos:
            cur.execute(sql, video)
    return len(videos)


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh public view counts for linked YouTube videos.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    api_key = env.get("YOUTUBE_API_KEY")
    if not api_key:
        raise SystemExit("Missing YOUTUBE_API_KEY")

    with psycopg2.connect(**db_config(env)) as conn:
        video_ids = fetch_linked_video_ids(conn)
        videos = fetch_video_statistics(api_key, video_ids)
        refreshed_ids = {video["video_id"] for video in videos}
        saved = 0 if args.dry_run else save_video_statistics(conn, videos)
        if args.dry_run:
            conn.rollback()

    print(
        f"linked_video_ids={len(video_ids)} refreshed={len(refreshed_ids)} "
        f"unavailable={len(set(video_ids) - refreshed_ids)} saved={saved} "
        f"dry_run={str(args.dry_run).lower()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
