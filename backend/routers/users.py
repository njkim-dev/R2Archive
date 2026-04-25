from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import fetch_user, require_user_id
from database import get_conn
from rate_limit import limiter

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
