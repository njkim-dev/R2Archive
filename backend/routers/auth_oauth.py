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
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
import jwt
from jwt import ExpiredSignatureError, InvalidAudienceError, PyJWKClient, PyJWTError

logger = logging.getLogger("auth.oauth")

from auth import (
    clear_session_cookie,
    fetch_user,
    get_current_user_id,
    issue_session_cookie,
    _cookie_domain,
    _request_host,
    upsert_oauth_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# OAuth 자격 증명은 반드시 환경변수로 주입. 값이 비어 있으면 해당 제공자 로그인 시 503.
BASE_URL = os.environ.get("OAUTH_BASE_URL", "https://music.r2archive.com").rstrip("/")

KAKAO_CLIENT_ID      = os.environ.get("OAUTH_KAKAO_CLIENT_ID", "")
NAVER_CLIENT_ID      = os.environ.get("OAUTH_NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET  = os.environ.get("OAUTH_NAVER_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID     = os.environ.get("OAUTH_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("OAUTH_GOOGLE_CLIENT_SECRET", "")
GOOGLE_JWKS_CLIENT = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")


def _require(provider: str, *values: str) -> None:
    if not all(values):
        raise HTTPException(status_code=503, detail=f"{provider} 로그인이 설정되지 않았습니다")

STATE_COOKIE = "r2b_oauth_state"
REMEMBER_COOKIE = "r2b_oauth_remember"
RETURN_COOKIE = "r2b_oauth_return"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"
PUBLIC_APP_HOSTS = {"music.r2archive.com", "xyx.r2archive.com"}


def _request_origin(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    host = host.split(",", 1)[0].strip()
    hostname = host.split(":", 1)[0].lower()
    if hostname in PUBLIC_APP_HOSTS:
        return f"https://{host}"
    if hostname in ("localhost", "127.0.0.1"):
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme
        return f"{proto}://{host}"
    return BASE_URL


def _callback_origin(request: Request) -> str:
    host = _request_host(request)
    if host in PUBLIC_APP_HOSTS:
        return BASE_URL
    return _request_origin(request)


def _redirect_uri(provider: str, request: Request) -> str:
    return f"{_callback_origin(request)}/api/auth/{provider}/callback"


def _safe_return_origin(origin: str | None) -> str:
    if not origin:
        return BASE_URL
    if origin in {f"https://{host}" for host in PUBLIC_APP_HOSTS}:
        return origin
    if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
        return origin
    if origin.startswith("https://localhost:") or origin.startswith("https://127.0.0.1:"):
        return origin
    return BASE_URL


def _verify_google_id_token(id_token: str) -> tuple[dict | None, str | None]:
    try:
        signing_key = GOOGLE_JWKS_CLIENT.get_signing_key_from_jwt(id_token)
        payload = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=GOOGLE_CLIENT_ID,
            leeway=30,
            options={"require": ["aud", "exp", "sub"]},
        )
    except ExpiredSignatureError:
        return None, "id_token_expired"
    except InvalidAudienceError:
        return None, "aud_mismatch"
    except PyJWTError as exc:
        logger.warning("[oauth:google] id_token 검증 실패: %s", exc.__class__.__name__)
        return None, "id_token_verify"

    if payload.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        return None, "iss_mismatch"

    return payload, None


def _set_state_cookie(resp, state: str, request: Request) -> None:
    # OAuth 임시 쿠키는 callback을 받는 현재 호스트에만 필요하다. 과거 parent-domain
    # 쿠키를 먼저 만료해 sibling subdomain의 cookie-tossing 영향을 제거한다.
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(STATE_COOKIE, path="/", domain=domain)
    kwargs = dict(max_age=600, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    resp.set_cookie(STATE_COOKIE, state, **kwargs)


def _check_state(request: Request, state: str) -> None:
    saved = request.cookies.get(STATE_COOKIE)
    if not saved or saved != state:
        raise HTTPException(status_code=400, detail="잘못된 OAuth state입니다")


def _clear_state_cookie(resp, request: Request | None = None) -> None:
    resp.delete_cookie(STATE_COOKIE, path="/")
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(STATE_COOKIE, path="/", domain=domain)


def _set_remember_cookie(resp, remember: bool, request: Request) -> None:
    """'로그인 상태 유지' 선택 여부를 fallback까지 전달하기 위한 임시 쿠키"""
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(REMEMBER_COOKIE, path="/", domain=domain)
    kwargs = dict(max_age=600, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    resp.set_cookie(REMEMBER_COOKIE, "1" if remember else "0", **kwargs)


def _read_remember(request: Request) -> bool:
    return request.cookies.get(REMEMBER_COOKIE) == "1"


def _clear_remember_cookie(resp, request: Request | None = None) -> None:
    resp.delete_cookie(REMEMBER_COOKIE, path="/")
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(REMEMBER_COOKIE, path="/", domain=domain)


def _set_return_cookie(resp, request: Request, return_origin: str | None = None) -> None:
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(RETURN_COOKIE, path="/", domain=domain)
    kwargs = dict(max_age=600, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    resp.set_cookie(RETURN_COOKIE, _safe_return_origin(return_origin or _request_origin(request)), **kwargs)


def _read_return_origin(request: Request) -> str:
    return _safe_return_origin(request.cookies.get(RETURN_COOKIE))


def _clear_return_cookie(resp, request: Request | None = None) -> None:
    resp.delete_cookie(RETURN_COOKIE, path="/")
    domain = _cookie_domain(request)
    if domain:
        resp.delete_cookie(RETURN_COOKIE, path="/", domain=domain)


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
        "searchable": user.get("searchable", "public"),
        "onboarded": user["onboarded"],
        "provider": user["provider"],
        "show_screenshot": user.get("show_screenshot", False),
    }}


@router.get("/admin-status")
def admin_status(request: Request):
    uid = get_current_user_id(request)
    if uid is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    user = fetch_user(uid)
    return {"is_admin": bool(user and user.get("is_admin"))}


@router.post("/logout")
def logout(request: Request):
    resp = JSONResponse({"ok": True})
    clear_session_cookie(resp, request)
    return resp


def _central_login_redirect(
    provider: str,
    request: Request,
    remember: bool,
    return_origin: str | None = None,
) -> RedirectResponse | None:
    request_origin = _safe_return_origin(_request_origin(request))
    if _request_host(request) not in PUBLIC_APP_HOSTS or request_origin == BASE_URL:
        return None
    query = urlencode({
        "remember": "1" if remember else "0",
        "return_origin": _safe_return_origin(return_origin or request_origin),
    })
    return RedirectResponse(f"{BASE_URL}/api/auth/{provider}/login?{query}", status_code=302)


def _build_login_redirect(
    provider: str,
    request: Request,
    auth_url: str,
    params: dict,
    remember: bool,
    return_origin: str | None = None,
) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    params = {**params, "state": state, "redirect_uri": _redirect_uri(provider, request)}
    url = f"{auth_url}?{urlencode(params)}"
    resp = RedirectResponse(url, status_code=302)
    _set_state_cookie(resp, state, request)
    _set_remember_cookie(resp, remember, request)
    _set_return_cookie(resp, request, return_origin)
    return resp


@router.get("/kakao/login")
def kakao_login(request: Request, remember: int = 0, return_origin: str | None = None):
    _require("kakao", KAKAO_CLIENT_ID)
    central = _central_login_redirect("kakao", request, bool(remember), return_origin)
    if central is not None:
        return central
    # scope 생략: 카카오는 별도 scope 없이도 id를 반환함
    return _build_login_redirect(
        "kakao",
        request,
        "https://kauth.kakao.com/oauth/authorize",
        {"client_id": KAKAO_CLIENT_ID, "response_type": "code"},
        remember=bool(remember),
        return_origin=return_origin,
    )


@router.get("/naver/login")
def naver_login(request: Request, remember: int = 0, return_origin: str | None = None):
    _require("naver", NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)
    central = _central_login_redirect("naver", request, bool(remember), return_origin)
    if central is not None:
        return central
    return _build_login_redirect(
        "naver",
        request,
        "https://nid.naver.com/oauth2.0/authorize",
        {"client_id": NAVER_CLIENT_ID, "response_type": "code"},
        remember=bool(remember),
        return_origin=return_origin,
    )


@router.get("/google/login")
def google_login(request: Request, remember: int = 0, return_origin: str | None = None):
    _require("google", GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    central = _central_login_redirect("google", request, bool(remember), return_origin)
    if central is not None:
        return central
    # openid: sub 클레임만 필요. profile/email 요청 안 함.
    return _build_login_redirect(
        "google",
        request,
        "https://accounts.google.com/o/oauth2/v2/auth",
        {"client_id": GOOGLE_CLIENT_ID, "response_type": "code", "scope": "openid"},
        remember=bool(remember),
        return_origin=return_origin,
    )


def _finish_login(provider: str, provider_uid: str, request: Request) -> RedirectResponse:
    persistent = _read_remember(request)
    try:
        user_id = upsert_oauth_user(provider, provider_uid)
    except Exception:
        logger.exception("[oauth:%s] 유저 업서트 실패 (uid=%s)", provider, provider_uid)
        return _fail_redirect("db_upsert", request)
    # 온보딩 여부는 프론트가 user.onboarded로 판단한다.
    resp = RedirectResponse(f"{_read_return_origin(request)}/?auth=ok", status_code=302)
    issue_session_cookie(resp, user_id, persistent=persistent, request=request)
    _clear_state_cookie(resp, request)
    _clear_remember_cookie(resp, request)
    _clear_return_cookie(resp, request)
    return resp


def _fail_redirect(detail: str, request: Request | None = None) -> RedirectResponse:
    return_origin = _read_return_origin(request) if request is not None else BASE_URL
    resp = RedirectResponse(f"{return_origin}/?auth=fail&reason={detail}", status_code=302)
    _clear_state_cookie(resp, request)
    _clear_remember_cookie(resp, request)
    _clear_return_cookie(resp, request)
    return resp


@router.get("/kakao/callback")
async def kakao_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code", request)
    _check_state(request, state)

    async with httpx.AsyncClient(timeout=10) as client:
        tok = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": KAKAO_CLIENT_ID,
                "redirect_uri": _redirect_uri("kakao", request),
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            return _fail_redirect("token_exchange", request)
        access_token = tok.json().get("access_token")
        if not access_token:
            return _fail_redirect("no_token", request)

        me = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"property_keys": "[]"},
        )
        if me.status_code != 200:
            return _fail_redirect("user_fetch", request)
        kakao_id = me.json().get("id")
        if kakao_id is None:
            return _fail_redirect("no_id", request)

    return _finish_login("kakao", str(kakao_id), request)


@router.get("/naver/callback")
async def naver_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code", request)
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
            return _fail_redirect("token_exchange", request)
        access_token = tok.json().get("access_token")
        if not access_token:
            return _fail_redirect("no_token", request)

        me = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if me.status_code != 200:
            return _fail_redirect("user_fetch", request)
        data = me.json().get("response") or {}
        naver_id = data.get("id")
        if not naver_id:
            return _fail_redirect("no_id", request)

    return _finish_login("naver", str(naver_id), request)


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        return _fail_redirect("no_code", request)
    _check_state(request, state)

    async with httpx.AsyncClient(timeout=10) as client:
        tok = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": _redirect_uri("google", request),
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            return _fail_redirect("token_exchange", request)
        id_token = tok.json().get("id_token")
        if not id_token:
            return _fail_redirect("no_token", request)

    payload, error = _verify_google_id_token(id_token)
    if error:
        return _fail_redirect(error, request)

    google_sub = payload.get("sub")
    if not google_sub:
        return _fail_redirect("no_sub", request)

    return _finish_login("google", str(google_sub), request)
