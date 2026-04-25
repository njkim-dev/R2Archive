"""OAuth 로그인 (Kakao / Naver / Google) + 세션 관리.

플로우:
  1. GET /api/auth/{provider}/login
     → state 쿠키 발급 + provider OAuth URL로 302 redirect.
  2. GET /api/auth/{provider}/callback?code=...&state=...
     → state 검증 → access token 교환 → 유저 식별자(sub/id)만 취득
     → users upsert → 세션 JWT 쿠키 발급
     → 프론트 / (홈) 또는 온보딩이 필요한 경우에도 프론트가 알아서 모달 띄움.
  3. GET /api/auth/me  → 현재 세션 유저 정보 (미로그인 시 null)
  4. POST /api/auth/logout → 쿠키 제거

★★★★★ 절대 개인정보를 수집하지 않는 프로젝트임 ★★★★★
카카오: scope 생략, Google: openid 만 요청, 네이버: 닉네임/이메일 scope 미사용하여,
이름/이메일/프로필 등 개인정보는 OAuth 요청 단계에서 scope를 요청하지 않음
"""
from __future__ import annotations

import logging
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

logger = logging.getLogger("auth.oauth")

from auth import (
    clear_session_cookie,
    fetch_user,
    get_current_user_id,
    issue_session_cookie,
    upsert_oauth_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# OAuth 자격 증명은 반드시 환경변수로 주입. 값이 비어 있으면 해당 제공자 로그인 시 503.
BASE_URL = os.environ.get("OAUTH_BASE_URL", "https://music.r2archive.com")

KAKAO_CLIENT_ID      = os.environ.get("OAUTH_KAKAO_CLIENT_ID", "")
NAVER_CLIENT_ID      = os.environ.get("OAUTH_NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET  = os.environ.get("OAUTH_NAVER_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID     = os.environ.get("OAUTH_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("OAUTH_GOOGLE_CLIENT_SECRET", "")


def _require(provider: str, *values: str) -> None:
    if not all(values):
        raise HTTPException(status_code=503, detail=f"{provider} 로그인이 설정되지 않았습니다")

STATE_COOKIE = "r2b_oauth_state"
REMEMBER_COOKIE = "r2b_oauth_remember"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"


def _redirect_uri(provider: str) -> str:
    return f"{BASE_URL}/api/auth/{provider}/callback"


def _set_state_cookie(resp, state: str) -> None:
    resp.set_cookie(
        STATE_COOKIE, state, max_age=600,
        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/",
    )


def _check_state(request: Request, state: str) -> None:
    saved = request.cookies.get(STATE_COOKIE)
    if not saved or saved != state:
        raise HTTPException(status_code=400, detail="잘못된 OAuth state입니다")


def _clear_state_cookie(resp) -> None:
    resp.delete_cookie(STATE_COOKIE, path="/")


def _set_remember_cookie(resp, remember: bool) -> None:
    """'로그인 상태 유지' 선택 여부를 fallback까지 전달하기 위한 임시 쿠키"""
    resp.set_cookie(
        REMEMBER_COOKIE, "1" if remember else "0", max_age=600,
        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/",
    )


def _read_remember(request: Request) -> bool:
    return request.cookies.get(REMEMBER_COOKIE) == "1"


def _clear_remember_cookie(resp) -> None:
    resp.delete_cookie(REMEMBER_COOKIE, path="/")


@router.get("/me")
def me(request: Request):
    uid = get_current_user_id(request)
    if uid is None:
        return {"user": None}
    user = fetch_user(uid)
    if user is None:
        return {"user": None}
    return {"user": {
        "id": user["id"],
        "nickname": user["nickname"],
        "default_visibility": user["default_visibility"],
        "onboarded": user["onboarded"],
        "provider": user["provider"],
        "show_screenshot": user.get("show_screenshot", False),
    }}


@router.post("/logout")
def logout():
    resp = JSONResponse({"ok": True})
    clear_session_cookie(resp)
    return resp


def _build_login_redirect(provider: str, auth_url: str, params: dict, remember: bool) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    params = {**params, "state": state, "redirect_uri": _redirect_uri(provider)}
    url = f"{auth_url}?{urlencode(params)}"
    resp = RedirectResponse(url, status_code=302)
    _set_state_cookie(resp, state)
    _set_remember_cookie(resp, remember)
    return resp


@router.get("/kakao/login")
def kakao_login(remember: int = 0):
    _require("kakao", KAKAO_CLIENT_ID)
    # scope 생략: 카카오는 별도 scope 없이도 id를 반환함
    return _build_login_redirect(
        "kakao",
        "https://kauth.kakao.com/oauth/authorize",
        {"client_id": KAKAO_CLIENT_ID, "response_type": "code"},
        remember=bool(remember),
    )


@router.get("/naver/login")
def naver_login(remember: int = 0):
    _require("naver", NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)
    return _build_login_redirect(
        "naver",
        "https://nid.naver.com/oauth2.0/authorize",
        {"client_id": NAVER_CLIENT_ID, "response_type": "code"},
        remember=bool(remember),
    )


@router.get("/google/login")
def google_login(remember: int = 0):
    _require("google", GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    # openid: sub 클레임만 필요. profile/email 요청 안 함.
    return _build_login_redirect(
        "google",
        "https://accounts.google.com/o/oauth2/v2/auth",
        {"client_id": GOOGLE_CLIENT_ID, "response_type": "code", "scope": "openid"},
        remember=bool(remember),
    )


def _finish_login(provider: str, provider_uid: str, request: Request) -> RedirectResponse:
    persistent = _read_remember(request)
    try:
        user_id = upsert_oauth_user(provider, provider_uid)
    except Exception:
        logger.exception("[oauth:%s] 유저 업서트 실패 (uid=%s)", provider, provider_uid)
        return _fail_redirect("db_upsert")
    # 닉네임 설정 여부는 /api/auth/me 결과에 따라 프론트가 판단.
    # src/App.jsx — refreshUser() 후 user.onboarded -> false 면 닉네임 설정 자동 오픈
    resp = RedirectResponse("/?auth=ok", status_code=302)
    issue_session_cookie(resp, user_id, persistent=persistent)
    _clear_state_cookie(resp)
    _clear_remember_cookie(resp)
    return resp


def _fail_redirect(detail: str) -> RedirectResponse:
    resp = RedirectResponse(f"/?auth=fail&reason={detail}", status_code=302)
    _clear_state_cookie(resp)
    _clear_remember_cookie(resp)
    return resp


@router.get("/kakao/callback")
async def kakao_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code")
    _check_state(request, state)

    async with httpx.AsyncClient(timeout=10) as client:
        tok = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": KAKAO_CLIENT_ID,
                "redirect_uri": _redirect_uri("kakao"),
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            return _fail_redirect("token_exchange")
        access_token = tok.json().get("access_token")
        if not access_token:
            return _fail_redirect("no_token")

        me = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"property_keys": "[]"},
        )
        if me.status_code != 200:
            return _fail_redirect("user_fetch")
        kakao_id = me.json().get("id")
        if kakao_id is None:
            return _fail_redirect("no_id")

    return _finish_login("kakao", str(kakao_id), request)


@router.get("/naver/callback")
async def naver_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code")
    _check_state(request, state)

    async with httpx.AsyncClient(timeout=10) as client:
        tok = await client.post(
            "https://nid.naver.com/oauth2.0/token",
            params={
                "grant_type": "authorization_code",
                "client_id": NAVER_CLIENT_ID,
                "client_secret": NAVER_CLIENT_SECRET,
                "code": code,
                "state": state,
            },
        )
        if tok.status_code != 200:
            return _fail_redirect("token_exchange")
        access_token = tok.json().get("access_token")
        if not access_token:
            return _fail_redirect("no_token")

        me = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if me.status_code != 200:
            return _fail_redirect("user_fetch")
        data = me.json().get("response") or {}
        naver_id = data.get("id")
        if not naver_id:
            return _fail_redirect("no_id")

    return _finish_login("naver", str(naver_id), request)


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code")
    _check_state(request, state)

    async with httpx.AsyncClient(timeout=10) as client:
        tok = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": _redirect_uri("google"),
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            return _fail_redirect("token_exchange")
        id_token = tok.json().get("id_token")
        if not id_token:
            return _fail_redirect("no_token")

    # id_token 서명 검증은 생략 — OIDC §3.1.3.7상 token endpoint에서
    # 직접 받은 id_token은 HTTPS 백채널이 authenticity를 보장하므로 허용됨.
    # iss/aud/exp는 defense-in-depth로 체크한다.
    try:
        import base64
        import json
        payload_b64 = id_token.split(".")[1]
        pad = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + pad))
    except Exception:
        return _fail_redirect("id_token_parse")

    if payload.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        return _fail_redirect("iss_mismatch")

    aud = payload.get("aud")
    aud_ok = (aud == GOOGLE_CLIENT_ID) or (isinstance(aud, list) and GOOGLE_CLIENT_ID in aud)
    if not aud_ok:
        return _fail_redirect("aud_mismatch")

    if payload.get("exp", 0) < time.time() - 30:
        return _fail_redirect("id_token_expired")

    google_sub = payload.get("sub")
    if not google_sub:
        return _fail_redirect("no_sub")

    return _finish_login("google", str(google_sub), request)
