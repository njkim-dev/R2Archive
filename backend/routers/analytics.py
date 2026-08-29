import hashlib
import hmac
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from auth import get_current_user_id, require_admin
from database import get_conn
from rate_limit import limiter

router = APIRouter(prefix="/api", tags=["analytics"])

VALID_SERVERS = {"kr", "xyx", "pmang", "unknown"}
VALID_CATALOG_SERVERS = {"kr", "xyx", "pmang"}
VALID_DEVICES = {"desktop", "mobile", "tablet", "unknown"}
CATALOG_COUNT_TABLES = {
    "kr": "songs",
    "xyx": "xyx_songs",
    "pmang": "pmang_songs",
}
ANALYTICS_VISITOR_COOKIE = "r2a_vid"
ANALYTICS_VISITOR_LIMIT = os.environ.get(
    "ANALYTICS_VISITOR_LIMIT", "60/minute;300/hour;1000/day"
)
ANALYTICS_GLOBAL_LIMIT = os.environ.get(
    "ANALYTICS_GLOBAL_LIMIT", "120/minute;1000/hour;5000/day"
)
_ANALYTICS_SECRET = (
    os.environ.get("ANALYTICS_VISITOR_SECRET") or os.environ["SESSION_SECRET"]
).encode("utf-8")
_cleanup_lock = threading.Lock()
_next_cleanup_at = 0.0
VISITOR_KEY_SQL = """
CASE
  WHEN user_id IS NOT NULL THEN 'u:' || user_id::text
  ELSE 's:' || session_id
END
"""


class PageviewCreate(BaseModel):
    path: str = Field("/", max_length=512)
    title: str | None = Field(None, max_length=240)
    server: str = Field("unknown", max_length=16)
    referrer: str | None = Field(None, max_length=2048)
    device: str = Field("unknown", max_length=16)


class SongCatalogViewCreate(BaseModel):
    song_id: int = Field(ge=1)
    server: str = Field("kr", max_length=16)
    path: str = Field("/", max_length=512)
    title: str | None = Field(None, max_length=240)
    referrer: str | None = Field(None, max_length=2048)
    device: str = Field("unknown", max_length=16)


def _clean_path(path: str) -> str:
    value = (path or "/").strip()[:512]
    if not value:
        return "/"
    value = urlsplit(value).path or "/"
    if not value.startswith("/"):
        value = f"/{value}"
    return value[:512]


def _clean_referrer(referrer: str | None) -> str | None:
    value = (referrer or "").strip()
    if not value:
        return None
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        parsed_port = parsed.port
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not hostname:
        return None
    host = hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    default_port = 443 if parsed.scheme == "https" else 80
    port = f":{parsed_port}" if parsed_port and parsed_port != default_port else ""
    path = parsed.path or ""
    if path == "/":
        path = ""
    return f"{parsed.scheme}://{host}{port}{path}"[:2048]


def _visitor_signature(visitor_id: str) -> str:
    return hmac.new(
        _ANALYTICS_SECRET,
        f"r2archive-analytics:{visitor_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]


def _signed_visitor_value(visitor_id: str) -> str:
    return f"{visitor_id}.{_visitor_signature(visitor_id)}"


def _visitor_id_from_cookie(request: Request) -> str | None:
    value = (request.cookies.get(ANALYTICS_VISITOR_COOKIE) or "").strip()
    if not value or "." not in value:
        return None
    visitor_id, signature = value.rsplit(".", 1)
    try:
        normalized = str(uuid.UUID(visitor_id))
    except (ValueError, AttributeError):
        return None
    if normalized != visitor_id:
        return None
    if not hmac.compare_digest(signature, _visitor_signature(visitor_id)):
        return None
    return visitor_id


def _analytics_global_key(request: Request) -> str:
    return "analytics:global"


def _analytics_client_key(request: Request) -> str:
    user_id = get_current_user_id(request)
    if user_id is not None:
        return f"analytics:user:{user_id}"
    visitor_id = _visitor_id_from_cookie(request)
    if visitor_id:
        return f"analytics:visitor:{visitor_id}"
    peer = request.client.host if request.client else "unknown"
    fingerprint = "|".join((
        peer,
        (request.headers.get("user-agent") or "")[:300],
        (request.headers.get("accept-language") or "")[:80],
    ))
    digest = hmac.new(_ANALYTICS_SECRET, fingerprint.encode("utf-8"), hashlib.sha256).hexdigest()[:24]
    return f"analytics:bootstrap:{digest}"


def _cookie_domain(request: Request) -> str | None:
    host = (request.headers.get("host") or "").split(":", 1)[0].lower()
    if host == "r2archive.com" or host.endswith(".r2archive.com"):
        return ".r2archive.com"
    return None


def _is_https(request: Request) -> bool:
    proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
    return proto == "https" or request.url.scheme == "https"


def _set_visitor_cookie(response: Response, request: Request, visitor_id: str):
    response.set_cookie(
        ANALYTICS_VISITOR_COOKIE,
        _signed_visitor_value(visitor_id),
        max_age=60 * 60 * 24 * 400,
        secure=_is_https(request),
        httponly=True,
        samesite="lax",
        domain=_cookie_domain(request),
    )


def _cleanup_due() -> bool:
    global _next_cleanup_at
    now = time.monotonic()
    with _cleanup_lock:
        if now < _next_cleanup_at:
            return False
        _next_cleanup_at = now + 6 * 60 * 60
        return True


def _rows(cur):
    columns = [desc[0] for desc in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


def _is_admin_user(cur, user_id: int | None) -> bool:
    if user_id is None:
        return False
    cur.execute("SELECT is_admin FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    return bool(row and row[0])


@router.post("/analytics/pageview")
@limiter.limit(ANALYTICS_GLOBAL_LIMIT, key_func=_analytics_global_key)
@limiter.limit(ANALYTICS_VISITOR_LIMIT, key_func=_analytics_client_key)
def create_pageview(request: Request, response: Response, body: PageviewCreate):
    session_id = _visitor_id_from_cookie(request)
    if session_id is None:
        session_id = str(uuid.uuid4())
        _set_visitor_cookie(response, request, session_id)
        return {"ok": True, "bootstrap": True}

    server = body.server if body.server in VALID_SERVERS else "unknown"
    device = body.device if body.device in VALID_DEVICES else "unknown"
    user_id = get_current_user_id(request)
    user_agent = (request.headers.get("user-agent") or "")[:1024]

    with get_conn() as conn:
        with conn.cursor() as cur:
            if _is_admin_user(cur, user_id):
                conn.commit()
                return {"ok": True, "ignored": "admin"}

            path = _clean_path(body.path)
            if _cleanup_due():
                cur.execute(
                    "DELETE FROM site_pageviews WHERE created_at < NOW() - INTERVAL '180 days'"
                )
            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s), hashtext(%s))",
                (session_id, path),
            )
            cur.execute(
                """
                SELECT 1
                FROM site_pageviews
                WHERE session_id = %s
                  AND path = %s
                  AND created_at >= NOW() - INTERVAL '5 minutes'
                LIMIT 1
                """,
                (session_id, path),
            )
            if cur.fetchone():
                conn.commit()
                return {"ok": True, "deduped": True}

            cur.execute(
                """
                INSERT INTO site_pageviews
                  (user_id, session_id, path, title, server, referrer, user_agent, device)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    session_id,
                    path,
                    (body.title or None),
                    server,
                    _clean_referrer(body.referrer),
                    user_agent,
                    device,
                ),
            )
            conn.commit()
    return {"ok": True}


@router.post("/analytics/catalog-view")
@limiter.limit(ANALYTICS_GLOBAL_LIMIT, key_func=_analytics_global_key)
@limiter.limit(ANALYTICS_VISITOR_LIMIT, key_func=_analytics_client_key)
def create_catalog_view(request: Request, response: Response, body: SongCatalogViewCreate):
    session_id = _visitor_id_from_cookie(request)
    if session_id is None:
        session_id = str(uuid.uuid4())
        _set_visitor_cookie(response, request, session_id)
        return {"ok": True, "bootstrap": True}

    if body.server not in VALID_CATALOG_SERVERS:
        raise HTTPException(status_code=422, detail="Invalid catalog server")

    server = body.server
    device = body.device if body.device in VALID_DEVICES else "unknown"
    user_id = get_current_user_id(request)
    user_agent = (request.headers.get("user-agent") or "")[:1024]
    path = _clean_path(body.path)
    table = CATALOG_COUNT_TABLES[server]

    with get_conn() as conn:
        with conn.cursor() as cur:
            if _is_admin_user(cur, user_id):
                conn.commit()
                return {"ok": True, "ignored": "admin"}

            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s), hashtext(%s))",
                (session_id, f"{server}:{body.song_id}"),
            )
            cur.execute(
                """
                SELECT 1
                FROM song_catalog_views
                WHERE session_id = %s
                  AND server = %s
                  AND song_id = %s
                  AND created_at >= NOW() - INTERVAL '5 minutes'
                LIMIT 1
                """,
                (session_id, server, body.song_id),
            )
            if cur.fetchone():
                conn.commit()
                return {"ok": True, "deduped": True}

            cur.execute(
                f"""
                UPDATE {table}
                SET catalog_view_count = catalog_view_count + 1
                WHERE id = %s
                RETURNING catalog_view_count
                """,
                (body.song_id,),
            )
            row = cur.fetchone()
            if not row:
                conn.commit()
                return {"ok": True, "ignored": "missing_song"}

            cur.execute(
                """
                INSERT INTO song_catalog_views
                  (user_id, session_id, server, song_id, path, title, referrer, user_agent, device)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    session_id,
                    server,
                    body.song_id,
                    path,
                    body.title or None,
                    _clean_referrer(body.referrer),
                    user_agent,
                    device,
                ),
            )
            conn.commit()
    return {"ok": True, "catalog_view_count": int(row[0])}


@router.get("/admin/analytics/summary")
def analytics_summary(request: Request, days: int = 30):
    require_admin(request)
    days = max(1, min(int(days or 30), 180))
    kst = timezone(timedelta(hours=9))
    start = datetime.now(kst) - timedelta(days=days - 1)
    start = start.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  COUNT(*)::int AS pageviews,
                  COUNT(DISTINCT {VISITOR_KEY_SQL})::int AS visitors,
                  COUNT(DISTINCT user_id)::int AS signed_users,
                  COUNT(*) FILTER (
                    WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date =
                          (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  )::int AS today_pageviews,
                  COUNT(DISTINCT {VISITOR_KEY_SQL}) FILTER (
                    WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date =
                          (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  )::int AS today_visitors,
                  COUNT(DISTINCT {VISITOR_KEY_SQL}) FILTER (
                    WHERE created_at >= NOW() - INTERVAL '15 minutes'
                  )::int AS active_15m
                FROM site_pageviews
                WHERE created_at >= %s
                """,
                (start,),
            )
            totals = dict(zip([d[0] for d in cur.description], cur.fetchone()))

            cur.execute(
                f"""
                SELECT
                  (created_at AT TIME ZONE 'Asia/Seoul')::date::text AS day,
                  COUNT(*)::int AS pageviews,
                  COUNT(DISTINCT {VISITOR_KEY_SQL})::int AS visitors
                FROM site_pageviews
                WHERE created_at >= %s
                GROUP BY day
                ORDER BY day
                """,
                (start,),
            )
            series = _rows(cur)

            cur.execute(
                f"""
                SELECT path, COUNT(*)::int AS pageviews, COUNT(DISTINCT {VISITOR_KEY_SQL})::int AS visitors
                FROM site_pageviews
                WHERE created_at >= %s
                GROUP BY path
                ORDER BY pageviews DESC, visitors DESC, path ASC
                LIMIT 20
                """,
                (start,),
            )
            pages = _rows(cur)

            cur.execute(
                f"""
                SELECT server, COUNT(*)::int AS pageviews, COUNT(DISTINCT {VISITOR_KEY_SQL})::int AS visitors
                FROM site_pageviews
                WHERE created_at >= %s
                GROUP BY server
                ORDER BY pageviews DESC
                """,
                (start,),
            )
            servers = _rows(cur)

            cur.execute(
                f"""
                SELECT device, COUNT(*)::int AS pageviews, COUNT(DISTINCT {VISITOR_KEY_SQL})::int AS visitors
                FROM site_pageviews
                WHERE created_at >= %s
                GROUP BY device
                ORDER BY pageviews DESC
                """,
                (start,),
            )
            devices = _rows(cur)

            cur.execute(
                """
                SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer,
                       COUNT(*)::int AS pageviews
                FROM site_pageviews
                WHERE created_at >= %s
                GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
                ORDER BY pageviews DESC
                LIMIT 10
                """,
                (start,),
            )
            referrers = _rows(cur)

            cur.execute(
                """
                SELECT
                  to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS at,
                  path,
                  server,
                  device,
                  user_id,
                  session_id
                FROM site_pageviews
                ORDER BY created_at DESC
                LIMIT 30
                """
            )
            recent = _rows(cur)

    return {
        "days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": totals,
        "series": series,
        "pages": pages,
        "servers": servers,
        "devices": devices,
        "referrers": referrers,
        "recent": recent,
    }
