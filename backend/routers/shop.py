import os
import re
import json
from functools import lru_cache, wraps
from pathlib import Path
from threading import BoundedSemaphore

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from psycopg2.extras import RealDictCursor

from auth import require_admin
from database import get_conn
from shop_categories import DEPARTMENT_SQL, SLOT_SQL, GROUP_SQL, GROUPS, SUBGROUP_SQL, SUBGROUPS, department_sql, slot_sql

router = APIRouter(prefix="/api/shop", tags=["shop"])
SHOP_DIR = Path(os.environ.get("SHOP_DIR", Path(__file__).resolve().parents[2] / "shop"))
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}
VERSION_PATTERN = re.compile(r"^[a-f0-9]{12,64}$")
ASSET_PATTERN = re.compile(r"^[a-f0-9]{64}\.(?:webp|json\.gz)$")
_shop_reads = BoundedSemaphore(4)


def bounded_shop_read(handler):
    @wraps(handler)
    def run(request, *args, **kwargs):
        with _shop_reads:
            require_admin(request)
            return handler(request, *args, **kwargs)
    return run


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


@lru_cache(maxsize=1)
def _pose_catalog(path, modified, size):
    if size > 8 * 1024 * 1024:
        return None
    data = json.loads(Path(path).read_text(encoding='utf8'))
    if data.get('schema') != 'shop-static-pose-v1' or not VERSION_PATTERN.fullmatch(data.get('revision', '')):
        return None
    models = data.get('models')
    if not isinstance(models, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not re.fullmatch(r'[a-f0-9]{64}\.json\.gz', k) or not re.fullmatch(r'[a-f0-9]{64}\.json\.gz', v) for k, v in models.items()):
        return None
    return data


def pose_catalog():
    path = SHOP_DIR / 'pose-catalog.json'
    try:
        stat = path.stat()
        return _pose_catalog(str(path), stat.st_mtime_ns, stat.st_size)
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def model_url(revision, filename, pose):
    replacement = pose['models'].get(filename) if pose and filename else None
    return asset_url(pose['revision'] if replacement else revision, 'models', replacement or filename)


def serialize(row):
    item = dict(row)
    item.pop("_sort_order", None)
    if 'item_group' in item:
        item['group'] = item.pop('item_group')
        item['subgroup'] = item.pop('item_subgroup', None)
    revision = item.pop("revision")
    item["id"] = str(item["id"])
    if item.get("counterpart_id"):
        item["counterpart_id"] = str(item["counterpart_id"])
    item["thumbnail"] = asset_url(revision, "thumbnails", item.get("thumbnail"))
    item["model"] = model_url(revision, item.get("model"), pose_catalog())
    item["version"] = revision
    return item


ITEM_COLUMNS = f"revision, item_id AS id, name, category, ({DEPARTMENT_SQL}) AS department, ({SLOT_SQL}) AS slot, sex, description, prices, thumbnail, model, preview_available, counterpart_id, ({GROUP_SQL}) AS item_group, ({SUBGROUP_SQL}) AS item_subgroup"


@router.get("/meta")
@bounded_shop_read
def meta(request: Request, version: str | None = Query(None, max_length=64)):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        result = catalog(cur, version)
        cur.execute(f"SELECT ({DEPARTMENT_SQL}) AS department, count(*)::int AS count FROM shop_items WHERE revision = %s AND show GROUP BY 1", (result["revision"],))
        result["counts"] = {r["department"]: r["count"] for r in cur.fetchall()}
        pose = pose_catalog()
        result["bases"] = {sex: model_url(result["revision"], name, pose) for sex, name in result["bases"].items()}
        if pose:
            result['texture_revision'] = pose['revision']
    result["admin_only"] = True
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.get("/items")
@bounded_shop_read
def items(
    request: Request,
    version: str | None = Query(None, max_length=64),
    q: str = Query("", max_length=120),
    department: str | None = Query(None, pattern="^(wearable|functional|other)$"),
    sex: str | None = Query(None, pattern="^(male|female|common)$"),
    slot: str | None = Query(None, pattern="^(hair|face|top|bottom|shoes|pet|accessory|summon)$"),
    category: str | None = Query(None, max_length=20),
    group: str | None = Query(None, max_length=32, pattern='^(' + '|'.join(GROUPS) + ')$'),
    subgroup: str | None = Query(None, max_length=32, pattern='^(' + '|'.join(SUBGROUPS) + ')$'),
    paired_only: bool = False,
    preview_only: bool = False,
    cursor: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        conditions = ["revision = %s", "show"]
        args = [current["revision"]]
        if q.strip():
            conditions.append("position(lower(%s) in lower(name)) > 0")
            args.append(q.strip())
        for column, value in [(f"({DEPARTMENT_SQL})", department), (f"({SLOT_SQL})", slot), ("category", category), (f"({GROUP_SQL})", group), (f"({SUBGROUP_SQL})", subgroup)]:
            if value:
                conditions.append(f"{column} = %s")
                args.append(value)
        if sex:
            conditions.append("sex IN (%s, 'common')")
            args.append(sex)
        if preview_only:
            conditions.append('preview_available AND model IS NOT NULL')
        if paired_only:
            partner_preview = 'AND partner.preview_available AND partner.model IS NOT NULL' if preview_only else ''
            conditions.append(f"""({department_sql('shop_items')}) = 'wearable' AND (
              (shop_items.category = '1007' AND shop_items.sex = 'common' AND shop_items.preview_available)
              OR EXISTS (
                SELECT 1 FROM shop_items AS partner
                WHERE partner.revision = shop_items.revision
                  AND partner.item_id = shop_items.counterpart_id
                  AND partner.counterpart_id = shop_items.item_id
                  AND partner.show AND ({department_sql('partner')}) = 'wearable'
                  AND ({slot_sql('partner')}) = ({slot_sql('shop_items')}) AND partner.name_key = shop_items.name_key
                  {partner_preview}
                  AND ((shop_items.sex = 'male' AND partner.sex = 'female')
                    OR (shop_items.sex = 'female' AND partner.sex = 'male'))
            ))""")
        where = " AND ".join(conditions)
        total = None
        if not cursor:
            cur.execute(f"SELECT count(*)::int AS count FROM shop_items WHERE {where}", args)
            total = cur.fetchone()["count"]
        if cursor is not None:
            if cursor:
                if not re.fullmatch(r"\d{1,10}:\d{1,19}", cursor):
                    raise HTTPException(status_code=400, detail="목록 위치가 올바르지 않습니다")
                order, item_id = map(int, cursor.split(":"))
                if order > 2147483647 or item_id > 9223372036854775807:
                    raise HTTPException(status_code=400, detail="목록 위치가 올바르지 않습니다")
                where += " AND (sort_order, item_id) > (%s, %s)"
                args.extend([order, item_id])
            cur.execute(f"SELECT {ITEM_COLUMNS}, sort_order AS _sort_order FROM shop_items WHERE {where} ORDER BY sort_order, item_id LIMIT %s", [*args, page_size + 1])
            rows = cur.fetchall()
            has_more = len(rows) > page_size
            rows = rows[:page_size]
            next_cursor = f"{rows[-1]['_sort_order']}:{rows[-1]['id']}" if has_more else None
        else:
            cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE {where} ORDER BY sort_order, item_id LIMIT %s OFFSET %s", [*args, page_size, (page - 1) * page_size])
            rows = cur.fetchall()
            has_more = page * page_size < total
            next_cursor = None
        result = [serialize(r) for r in rows]
    return JSONResponse({"version": current["revision"], "items": result, "total": total, "page": page, "page_size": page_size, "has_more": has_more, "next_cursor": next_cursor}, headers=PRIVATE_HEADERS)


@router.get("/items/{item_id}")
@bounded_shop_read
def item(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision = %s AND item_id = %s AND show", (current["revision"], item_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="표시할 수 없는 아이템입니다")
    return JSONResponse(serialize(row), headers=PRIVATE_HEADERS)


@router.get("/assets/{version}/{kind}/{filename}")
@bounded_shop_read
def asset(request: Request, version: str, kind: str, filename: str):
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
