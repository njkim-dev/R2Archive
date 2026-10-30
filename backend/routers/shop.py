import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from psycopg2.extras import RealDictCursor

from auth import require_admin
from database import get_conn

router = APIRouter(prefix="/api/shop", tags=["shop"])
SHOP_DIR = Path(os.environ.get("SHOP_DIR", Path(__file__).resolve().parents[2] / "shop"))
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}
VERSION_PATTERN = re.compile(r"^[a-f0-9]{12,64}$")
ASSET_PATTERN = re.compile(r"^[a-f0-9]{64}\.(?:webp|json\.gz)$")


def catalog(cur, version=None):
    if version and not VERSION_PATTERN.fullmatch(version):
        raise HTTPException(status_code=400, detail="상점 데이터 버전이 올바르지 않습니다")
    if version:
        cur.execute("SELECT revision, bases FROM shop_catalogs WHERE revision = %s", (version,))
    else:
        cur.execute("SELECT revision, bases FROM shop_catalogs WHERE active ORDER BY created_at DESC LIMIT 1")
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404 if version else 503, detail="상점 데이터를 준비 중이거나 해당 버전이 없습니다")
    return dict(row)


def asset_url(revision, kind, filename):
    return f"/api/shop/assets/{revision}/{kind}/{filename}" if filename else None


def serialize(row):
    item = dict(row)
    revision = item.pop("revision")
    item["id"] = str(item["id"])
    if item.get("counterpart_id"):
        item["counterpart_id"] = str(item["counterpart_id"])
    item["thumbnail"] = asset_url(revision, "thumbnails", item.get("thumbnail"))
    item["model"] = asset_url(revision, "models", item.get("model"))
    item["version"] = revision
    return item


ITEM_COLUMNS = "revision, item_id AS id, name, category, department, slot, sex, description, prices, thumbnail, model, preview_available, counterpart_id"


@router.get("/meta")
def meta(request: Request, version: str | None = Query(None, max_length=64)):
    require_admin(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        result = catalog(cur, version)
        cur.execute("SELECT department, count(*)::int AS count FROM shop_items WHERE revision = %s AND show GROUP BY department", (result["revision"],))
        result["counts"] = {r["department"]: r["count"] for r in cur.fetchall()}
        result["bases"] = {sex: asset_url(result["revision"], "models", name) for sex, name in result["bases"].items()}
    result["admin_only"] = True
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.get("/items")
def items(
    request: Request,
    version: str | None = Query(None, max_length=64),
    q: str = Query("", max_length=120),
    department: str | None = Query(None, pattern="^(wearable|functional|other)$"),
    sex: str | None = Query(None, pattern="^(male|female|common)$"),
    slot: str | None = Query(None, pattern="^(hair|top|bottom|shoes|pet)$"),
    category: str | None = Query(None, max_length=20),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
):
    require_admin(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        conditions = ["revision = %s", "show"]
        args = [current["revision"]]
        if q.strip():
            conditions.append("position(lower(%s) in lower(name)) > 0")
            args.append(q.strip())
        for column, value in [("department", department), ("slot", slot), ("category", category)]:
            if value:
                conditions.append(f"{column} = %s")
                args.append(value)
        if sex:
            conditions.append("sex IN (%s, 'common')")
            args.append(sex)
        where = " AND ".join(conditions)
        cur.execute(f"SELECT count(*)::int AS count FROM shop_items WHERE {where}", args)
        total = cur.fetchone()["count"]
        cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE {where} ORDER BY sort_order, item_id LIMIT %s OFFSET %s", [*args, page_size, (page - 1) * page_size])
        result = [serialize(r) for r in cur.fetchall()]
    return JSONResponse({"version": current["revision"], "items": result, "total": total, "page": page, "page_size": page_size}, headers=PRIVATE_HEADERS)


@router.get("/items/{item_id}")
def item(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    require_admin(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision = %s AND item_id = %s AND show", (current["revision"], item_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="표시할 수 없는 아이템입니다")
    return JSONResponse(serialize(row), headers=PRIVATE_HEADERS)


@router.get("/assets/{version}/{kind}/{filename}")
def asset(request: Request, version: str, kind: str, filename: str):
    require_admin(request)
    if not VERSION_PATTERN.fullmatch(version) or kind not in {"models", "textures", "thumbnails"} or not ASSET_PATTERN.fullmatch(filename):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    if (kind == "models") != filename.endswith(".json.gz"):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    target = SHOP_DIR / "assets" / version / kind / filename
    root = (SHOP_DIR / "assets").resolve()
    if not target.resolve().is_relative_to(root) or not target.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    headers = dict(PRIVATE_HEADERS)
    if kind == "models":
        headers["Content-Encoding"] = "gzip"
    return FileResponse(target, media_type="application/json" if kind == "models" else "image/webp", headers=headers)
