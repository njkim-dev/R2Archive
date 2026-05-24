from pathlib import Path
from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import asyncio
import httpx

from auth import fetch_user, require_user_id
from database import get_conn
from models import ManualRecordsBulk
from rate_limit import limiter
from routers.records import _extract_video_id
from routers.songs import ensure_active_song

_SCREENSHOTS_DIR = Path(__file__).resolve().parent.parent.parent / "record_screenshots"

router = APIRouter(prefix="/api/users", tags=["users"])

# SQL injection 방지를 위해, f-string에는 정해진 값만 들어가도록 강제.
_USER_FIELD_SQL = {
    "nickname": "nickname = %s",
    "default_visibility": "default_visibility = %s",
    "show_screenshot": "show_screenshot = %s",
    "searchable": "searchable = %s",
}


class MeUpdate(BaseModel):
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=30)
    default_visibility: Optional[str] = Field(
        default=None, pattern=r"^(public|anonymous|private)$"
    )
    show_screenshot: Optional[bool] = None
    searchable: Optional[str] = Field(
        default=None, pattern=r"^(public|group|private)$"
    )


def _is_nickname_taken(cur, nickname: str, exclude_user_id: int | None) -> bool:
    """대소문자/앞뒤공백 무시 중복 검사."""
    if exclude_user_id is None:
        cur.execute(
            "SELECT 1 FROM users WHERE LOWER(TRIM(nickname)) = LOWER(TRIM(%s)) LIMIT 1",
            (nickname,),
        )
    else:
        cur.execute(
            "SELECT 1 FROM users "
            "WHERE LOWER(TRIM(nickname)) = LOWER(TRIM(%s)) AND id <> %s LIMIT 1",
            (nickname, exclude_user_id),
        )
    return cur.fetchone() is not None


@router.get("/check-nickname")
@limiter.limit("30/minute")
def check_nickname(request: Request, q: str = ""):
    """닉네임 중복 여부 실시간 확인. 로그인 상태일 경우 본인 닉네임은 available=true."""
    name = (q or "").strip()
    if len(name) < 1 or len(name) > 30:
        return {"available": False, "reason": "length"}
    from auth import get_current_user_id
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            taken = _is_nickname_taken(cur, name, exclude_user_id=current_uid)
    return {"available": not taken}


@router.patch("/me")
def update_me(request: Request, body: MeUpdate):
    uid = require_user_id(request)

    # nickname만 사전 검증/전처리가 필요 — 나머지는 Pydantic 검증으로 충분.
    updates: list[tuple[str, object]] = []
    if body.nickname is not None:
        nick = body.nickname.strip()
        if not nick:
            raise HTTPException(status_code=422, detail="닉네임을 입력해주세요")
        with get_conn() as conn:
            with conn.cursor() as cur:
                if _is_nickname_taken(cur, nick, exclude_user_id=uid):
                    raise HTTPException(status_code=409, detail="이미 사용 중인 닉네임입니다")
        updates.append(("nickname", nick))
    if body.default_visibility is not None:
        updates.append(("default_visibility", body.default_visibility))
    if body.show_screenshot is not None:
        updates.append(("show_screenshot", body.show_screenshot))
    if body.searchable is not None:
        updates.append(("searchable", body.searchable))

    if not updates:
        raise HTTPException(status_code=422, detail="변경할 항목이 없습니다")

    set_clauses = [_USER_FIELD_SQL[name] for name, _ in updates]
    set_clauses.append("onboarded = TRUE")
    set_clauses.append("updated_at = NOW()")
    params: list = [val for _, val in updates]
    params.append(uid)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE users SET {', '.join(set_clauses)} WHERE id = %s",
                    tuple(params),
                )
                if body.default_visibility is not None:
                    cur.execute(
                        "UPDATE records SET visibility = %s WHERE user_id = %s",
                        (body.default_visibility, uid),
                    )
            conn.commit()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="이미 사용 중인 닉네임입니다")

    user = fetch_user(uid)
    return {"user": user}


@router.get("/me/flags")
def get_my_flags(request: Request):
    """로그인 유저의 즐겨찾기/플레이 곡 id 목록. 사이드바 필터용.
    비로그인 시 빈 배열.
    """
    uid = None
    try:
        uid = require_user_id(request)
    except HTTPException:
        return {"favorites": [], "played": []}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT song_id FROM user_favorites WHERE user_id = %s",
                (uid,),
            )
            favorites = [r[0] for r in cur.fetchall()]
            cur.execute(
                "SELECT song_id FROM user_plays WHERE user_id = %s",
                (uid,),
            )
            played = [r[0] for r in cur.fetchall()]
            cur.execute(
                """
                SELECT DISTINCT s2.id
                FROM user_plays up
                JOIN songs s1 ON s1.id = up.song_id
                JOIN songs s2 ON s2.name = s1.name AND s2.artist = s1.artist
                WHERE up.user_id = %s
                """,
                (uid,),
            )
            played_all = [r[0] for r in cur.fetchall()]
    return {"favorites": favorites, "played": played, "played_all": played_all}


@router.post("/me/favorites/{song_id}", status_code=201)
def add_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute(
                "INSERT INTO user_favorites (user_id, song_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}


@router.delete("/me/favorites/{song_id}")
def remove_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM user_favorites WHERE user_id = %s AND song_id = %s",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}


@router.get("/me/records")
def get_my_records(request: Request):
    """마이페이지: 내가 등록한 모든 기록 (스크린샷/유튜브 포함). 곡 정보도 함께 반환."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.song_id, s.name AS song_name, s.artist, s.level, s.image,
                       r.nickname, r.score, r.judgment_percent, r.combo,
                       r.youtube_url, r.youtube_title, r.memo, r.visibility,
                       r.created_at, r.screenshot_filename, r.memo_public, r.is_manual
                FROM records r
                JOIN songs s ON s.id = r.song_id
                WHERE r.user_id = %s
                ORDER BY r.created_at DESC
                """,
                (uid,),
            )
            rows = cur.fetchall()

    return {
        "records": [
            {
                "id": r[0],
                "song_id": r[1],
                "song_name": r[2],
                "artist": r[3],
                "song_level": float(r[4]) if r[4] is not None else None,
                "song_image": r[5],
                "nickname": r[6],
                "score": r[7],
                "judgment_percent": float(r[8]) if r[8] is not None else None,
                "combo": r[9],
                "youtube_url": r[10],
                "youtube_title": r[11],
                "memo": r[12],
                "visibility": r[13],
                "created_at": r[14].isoformat() if r[14] else None,
                "has_screenshot": bool(r[15]),
                "memo_public": bool(r[16]),
                "is_manual": bool(r[17]),
            }
            for r in rows
        ]
    }


@router.get("/me/comments")
def get_my_comments(request: Request):
    """마이페이지: 로그인 후 작성한 본인 댓글만. user_id NULL 인 비로그인 시절 댓글은 제외."""
    uid = require_user_id(request)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.song_id, s.name AS song_name, s.artist, s.image,
                       c.nickname, c.content, c.created_at
                FROM comments c
                JOIN songs s ON s.id = c.song_id
                WHERE c.user_id = %s
                ORDER BY c.created_at DESC
                """,
                (uid,),
            )
            rows = cur.fetchall()

    return {
        "comments": [
            {
                "id": r[0],
                "song_id": r[1],
                "song_name": r[2],
                "artist": r[3],
                "song_image": r[4],
                "nickname": r[5],
                "content": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
    }


async def _verify_youtube_url(url: str) -> tuple[bool, str | None]:
    """oEmbed로 URL 유효성 + 제목 조회. (valid, title) 반환. 401/404/timeout은 모두 invalid."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
        if r.status_code != 200:
            return False, None
        data = r.json()
        title = data.get("title")
        return True, (title.strip()[:200] if isinstance(title, str) else None)
    except Exception:
        return False, None


@router.put("/me/records/manual")
async def save_manual_records(request: Request, body: ManualRecordsBulk):
    """랭킹 페이지 편집 모드의 일괄 저장.

    동작:
      - judgment_percent + youtube_url 둘 다 있는 entry: manual row + URL → 랭킹 합류
      - judgment_percent만 있는 entry: manual row (자가신고, 랭킹 미반영)
      - 둘 다 없는 entry: 기존 manual row 삭제
      - youtube_url만 있는 entry: 무시 (URL 단독 등록 막음)

    URL 검증:
      1) 정규식으로 형식 확인
      2) oEmbed 병렬 호출로 실제 영상 존재 확인
      - 하나라도 실패 시 트랜잭션 진행 안 하고 422 + invalid 배열 응답.
        invalid에는 song_id/song_title/artist/url 포함 → 프론트에서 안내 모달.
    """
    uid = require_user_id(request)
    user_row = fetch_user(uid)
    if not user_row:
        raise HTTPException(status_code=403, detail="로그인이 필요합니다")
    nickname = user_row.get("nickname") or ""
    if not nickname:
        raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")
    visibility = user_row.get("default_visibility") or "public"

    invalid_song_ids: list[int] = []
    invalid_url_map: dict[int, str] = {}
    to_verify: list[tuple] = []

    normalized_urls: dict[int, str] = {}

    for i, entry in enumerate(body.entries):
        raw_url = (entry.youtube_url or "").strip()
        if not raw_url:
            continue
        if entry.judgment_percent is None:
            continue
        vid = _extract_video_id(raw_url)
        if not vid:
            invalid_song_ids.append(entry.song_id)
            invalid_url_map[entry.song_id] = raw_url
            continue
        normalized_urls[i] = raw_url
        to_verify.append((i, entry.song_id, raw_url))

    titles: dict[int, str | None] = {}

    if to_verify:
        async def _check(item):
            idx, sid, url = item
            ok, title = await _verify_youtube_url(url)
            return idx, sid, url, ok, title

        results = await asyncio.gather(*[_check(it) for it in to_verify], return_exceptions=False)
        for idx, sid, url, ok, title in results:
            if not ok:
                invalid_song_ids.append(sid)
                invalid_url_map[sid] = url
            else:
                titles[idx] = title

    if invalid_song_ids:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, artist FROM songs WHERE id = ANY(%s)",
                    (list(set(invalid_song_ids)),),
                )
                song_info = {r[0]: {"song_title": r[1], "artist": r[2]} for r in cur.fetchall()}
        invalid_payload = []
        for sid in invalid_song_ids:
            info = song_info.get(sid, {"song_title": "", "artist": ""})
            invalid_payload.append({
                "song_id": sid,
                "song_title": info["song_title"],
                "artist": info["artist"],
                "url": invalid_url_map.get(sid, ""),
            })
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_youtube_urls", "invalid": invalid_payload},
        )

    inserted = 0
    updated = 0
    deleted = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            for i, entry in enumerate(body.entries):
                jp = entry.judgment_percent
                yt_url = normalized_urls.get(i)
                yt_title = titles.get(i)

                cur.execute(
                    "SELECT id FROM records "
                    "WHERE user_id = %s AND song_id = %s AND is_manual = TRUE "
                    "ORDER BY created_at DESC",
                    (uid, entry.song_id),
                )
                existing_ids = [r[0] for r in cur.fetchall()]

                if jp is None:
                    if existing_ids:
                        cur.execute(
                            "DELETE FROM records WHERE id = ANY(%s)",
                            (existing_ids,),
                        )
                        deleted += len(existing_ids)
                    continue

                ensure_active_song(cur, entry.song_id)

                if existing_ids:
                    keep_id = existing_ids[0]
                    cur.execute(
                        """
                        UPDATE records
                        SET judgment_percent = %s, visibility = %s,
                            nickname = %s, youtube_url = %s, youtube_title = %s,
                            created_at = NOW()
                        WHERE id = %s
                        """,
                        (jp, visibility, nickname, yt_url, yt_title, keep_id),
                    )
                    updated += 1
                    if len(existing_ids) > 1:
                        cur.execute(
                            "DELETE FROM records WHERE id = ANY(%s)",
                            (existing_ids[1:],),
                        )
                else:
                    cur.execute(
                        """
                        INSERT INTO records
                            (song_id, user_id, nickname, judgment_percent,
                             visibility, is_manual, youtube_url, youtube_title)
                        VALUES (%s, %s, %s, %s, %s, TRUE, %s, %s)
                        """,
                        (entry.song_id, uid, nickname, jp, visibility, yt_url, yt_title),
                    )
                    inserted += 1
        conn.commit()

    return {"ok": True, "inserted": inserted, "updated": updated, "deleted": deleted}


@router.delete("/me/records/{record_id}", status_code=204)
def delete_my_record(request: Request, record_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, screenshot_path FROM records WHERE id = %s",
                (record_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다")
            if row[0] is None or int(row[0]) != int(uid):
                raise HTTPException(status_code=403, detail="본인의 기록만 삭제할 수 있습니다")
            screenshot_path = row[1]
            cur.execute("DELETE FROM records WHERE id = %s", (record_id,))
        conn.commit()
    if screenshot_path:
        try:
            (_SCREENSHOTS_DIR / screenshot_path).unlink(missing_ok=True)
        except Exception:
            pass


@router.delete("/me/comments/{comment_id}", status_code=204)
def delete_my_comment(request: Request, comment_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM comments WHERE id = %s", (comment_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다")
            if row[0] is None or int(row[0]) != int(uid):
                raise HTTPException(status_code=403, detail="본인의 댓글만 삭제할 수 있습니다")
            cur.execute("DELETE FROM comments WHERE id = %s", (comment_id,))
        conn.commit()
