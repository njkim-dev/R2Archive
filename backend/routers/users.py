from pathlib import Path
from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import fetch_user, require_user_id
from database import get_conn
from rate_limit import limiter

_SCREENSHOTS_DIR = Path(__file__).resolve().parent.parent.parent / "record_screenshots"

router = APIRouter(prefix="/api/users", tags=["users"])

# SQL injection 방지를 위해, f-string에는 정해진 값만 들어가도록 강제.
_USER_FIELD_SQL = {
    "nickname": "nickname = %s",
    "default_visibility": "default_visibility = %s",
    "show_screenshot": "show_screenshot = %s",
}


class MeUpdate(BaseModel):
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=30)
    default_visibility: Optional[str] = Field(
        default=None, pattern=r"^(public|anonymous|private)$"
    )
    show_screenshot: Optional[bool] = None


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
    return {"favorites": favorites, "played": played}


@router.post("/me/favorites/{song_id}", status_code=201)
def add_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
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
                       r.created_at, r.screenshot_filename, r.memo_public
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
