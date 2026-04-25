"""Auth 유틸 — JWT 세션 쿠키 + 현재 유저 조회.

세션 토큰:
  HS256 서명 JWT. payload = { sub: <users.id>, exp: <utc timestamp> }.
  HttpOnly, SameSite=Lax, Secure(prod) 쿠키 'r2b_session'에 담는다.

사용법:
  cur_uid = get_current_user_id(request)        # 로그인 여부 옵션
  cur_uid = require_user_id(request)            # 로그인 필수 (없으면 401)
  user = require_user(request, cur)             # DB 행까지 가져옴
"""
from __future__ import annotations

import os
import time
from typing import Optional
import jwt
from fastapi import HTTPException, Request, Response
from database import get_conn

SESSION_COOKIE = "r2b_session"
SESSION_SECRET = os.environ["SESSION_SECRET"]
SESSION_TTL_SEC = 60 * 60 * 24 * 30      # 30일
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"


def issue_session_cookie(response: Response, user_id: int, persistent: bool = False) -> None:
    """세션 쿠키 발급.
    기본 값 : 브라우저 세션 쿠키 -> 브라우저 종료 시 만료 (persistent=False)
    로그인 상태 유지 선택 : max_age=30일 (persistent=True)
    """
    now = int(time.time())
    token = jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + SESSION_TTL_SEC},
        SESSION_SECRET,
        algorithm="HS256",
    )
    kwargs = dict(httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    if persistent:
        kwargs["max_age"] = SESSION_TTL_SEC
    response.set_cookie(SESSION_COOKIE, token, **kwargs)


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def get_current_user_id(request: Request) -> Optional[int]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return int(sub)
    except (TypeError, ValueError):
        return None


def require_user_id(request: Request) -> int:
    uid = get_current_user_id(request)
    if uid is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return uid


def fetch_user(user_id: int) -> Optional[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, provider, nickname, default_visibility, onboarded, "
                "       created_at, show_screenshot "
                "FROM users WHERE id = %s",
                (user_id,),
            )
            r = cur.fetchone()
    if not r:
        return None
    return {
        "id": r[0],
        "provider": r[1],
        "nickname": r[2],
        "default_visibility": r[3],
        "onboarded": r[4],
        "created_at": r[5],
        "show_screenshot": bool(r[6]),
    }


def upsert_oauth_user(provider: str, provider_uid: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE provider = %s AND provider_uid = %s",
                (provider, provider_uid),
            )
            row = cur.fetchone()
            if row:
                return int(row[0])
            cur.execute(
                "INSERT INTO users (provider, provider_uid) VALUES (%s, %s) RETURNING id",
                (provider, provider_uid),
            )
            new_id = int(cur.fetchone()[0])
        conn.commit()
    return new_id
