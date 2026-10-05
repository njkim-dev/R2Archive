from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_FEEDBACK_TYPES = {
    "data": "데이터 오류",
    "record_issue": "성과 오류",
    "ranking": "개인 성과",
    "comment": "댓글",
    "ui": "화면 및 사용성",
    "login": "로그인",
    "search": "검색",
    "record_stats": "성과 통계",
    "community": "커뮤니티",
    "record": "성과 등록",
    "ux": "사용성",
    "other": "기타",
}
_SONG_FEEDBACK_TYPES = {
    "bpm": "BPM 정보",
    "combo": "콤보 정보",
    "time": "재생 시간",
    "record_delete": "성과 삭제",
    "comment_delete": "댓글 삭제",
}


def _text(value: object, limit: int) -> str:
    cleaned = str(value or "").strip()
    return cleaned[:limit] or "-"


def build_feedback_item_notification(
    *,
    feedback_id: int,
    tab: str,
    type_: str,
    title: str,
    body: str,
    severity: str,
    author: str,
    song_title: str = "",
) -> dict:
    is_bug = tab == "bug"
    fields = [
        {"name": "유형", "value": _FEEDBACK_TYPES.get(type_, type_), "inline": True},
        {"name": "작성자", "value": _text(author, 100), "inline": True},
    ]
    if is_bug:
        fields.insert(1, {"name": "중요도", "value": severity, "inline": True})
    if song_title:
        fields.append({"name": "관련 곡", "value": _text(song_title, 1024), "inline": False})
    return {
        "username": "R2Archive 피드백",
        "allowed_mentions": {"parse": []},
        "embeds": [{
            "title": f"새 {'버그 신고' if is_bug else '기능 제안'} #{feedback_id}: {_text(title, 180)}",
            "description": _text(body, 4000),
            "url": "https://music.r2archive.com/feedback",
            "color": 0xED4245 if is_bug else 0x5865F2,
            "fields": fields,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }],
    }


def build_song_feedback_notification(
    *,
    feedback_id: int,
    song_id: int,
    song_name: str,
    artist: str,
    level: float | None,
    type_: str,
    body: str,
) -> dict:
    level_text = f"Lv {level:g}" if level is not None else "난이도 미상"
    return {
        "username": "R2Archive 피드백",
        "allowed_mentions": {"parse": []},
        "embeds": [{
            "title": f"새 음악별 피드백 #{feedback_id}",
            "description": _text(body, 4000),
            "url": f"https://music.r2archive.com/#song={song_id}",
            "color": 0xFEE75C,
            "fields": [
                {"name": "곡", "value": f"{_text(song_name, 400)} - {_text(artist, 400)}", "inline": False},
                {"name": "난이도", "value": level_text, "inline": True},
                {"name": "유형", "value": _SONG_FEEDBACK_TYPES.get(type_, type_), "inline": True},
            ],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }],
    }


def _webhook_url() -> str:
    url = os.environ.get("DISCORD_WEB_HOOK", "").strip()
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"discord.com", "discordapp.com"}
        or not parsed.path.startswith("/api/webhooks/")
    ):
        return ""
    return url


async def send_discord_notification(payload: dict) -> None:
    webhook_url = _webhook_url()
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
    except Exception as exc:
        logger.warning("Discord 피드백 알림 전송 실패: %s", exc.__class__.__name__)
