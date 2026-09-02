from __future__ import annotations

import os
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

from starlette.responses import JSONResponse

from auth import SESSION_COOKIE

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_DEFAULT_TRUSTED_ORIGINS = (
    "https://music.r2archive.com,"
    "https://xyx.r2archive.com,"
    "https://r2archive.com,"
    "http://localhost:5173,"
    "http://localhost:3000"
)


def _normalize_origin(value: str) -> str | None:
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    if parsed.username or parsed.password:
        return None
    default_port = 443 if parsed.scheme == "https" else 80
    port = parsed.port or default_port
    suffix = "" if port == default_port else f":{port}"
    return f"{parsed.scheme}://{parsed.hostname.lower()}{suffix}"


TRUSTED_BROWSER_ORIGINS = {
    normalized
    for item in os.environ.get("CSRF_TRUSTED_ORIGINS", _DEFAULT_TRUSTED_ORIGINS).split(",")
    if (normalized := _normalize_origin(item))
}


def _trusted_request_source(origin: str | None, referer: str | None) -> bool:
    source = origin or referer
    normalized = _normalize_origin(source) if source else None
    return normalized in TRUSTED_BROWSER_ORIGINS


def _has_session_cookie(raw_cookie: str) -> bool:
    try:
        cookies = SimpleCookie()
        cookies.load(raw_cookie)
        return SESSION_COOKIE in cookies
    except Exception:
        return False


class BrowserCSRFMiddleware:
    """신뢰하지 않는 웹 출처의 쿠키 인증 변경 요청을 차단한다."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method", "GET").upper() not in _UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        if not _has_session_cookie(headers.get("cookie", "")):
            await self.app(scope, receive, send)
            return

        if not _trusted_request_source(headers.get("origin"), headers.get("referer")):
            response = JSONResponse({"detail": "허용되지 않은 요청 출처입니다."}, status_code=403)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
