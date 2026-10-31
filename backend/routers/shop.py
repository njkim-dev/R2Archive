import os
import re
import json
from functools import lru_cache, wraps
from pathlib import Path
from threading import BoundedSemaphore

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field

from auth import fetch_user, require_user_id
from database import get_conn
from shop_categories import DEPARTMENT_SQL, SLOT_SQL, GROUP_SQL, GROUPS, SUBGROUP_SQL, SUBGROUPS, department_sql, slot_sql
from shop_counterparts import counterpart_sql, reviewed_pair_sql
from shop_couple import preview as couple_preview
from shop_sharing import public_home_owner

router = APIRouter(prefix="/api/shop", tags=["shop"])
SHOP_DIR = Path(os.environ.get("SHOP_DIR", Path(__file__).resolve().parents[2] / "shop"))
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}
VERSION_PATTERN = re.compile(r"^[a-f0-9]{12,64}$")
ASSET_PATTERN = re.compile(r"^[a-f0-9]{64}\.(?:webp|json\.gz|mp3|ogg)$")
_shop_reads = BoundedSemaphore(4)


def bounded_shop_read(handler):
    @wraps(handler)
    def run(request, *args, **kwargs):
        with _shop_reads:
            return handler(request, *args, **kwargs)
    return run


def favorite_user(request):
    uid = require_user_id(request)
    if fetch_user(uid) is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return uid


def favorite_storage(cur):
    cur.execute("SELECT to_regclass('public.shop_favorites') AS storage")
    row = cur.fetchone()
    if (row.get('storage') if isinstance(row, dict) else row[0]) is None:
        raise HTTPException(status_code=503, detail="즐겨찾기 저장소를 준비 중입니다")


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
    if item.get('is_unreleased'):
        item['prices'] = []
        item['is_new'] = False
    if item.get('category') == '507':
        item['couple_preview'] = couple_preview(SHOP_DIR, item['id'])
    return item


ITEM_COLUMNS = f"revision, item_id AS id, name, category, ({DEPARTMENT_SQL}) AS department, ({SLOT_SQL}) AS slot, sex, description, prices, thumbnail, model, preview_available, {counterpart_sql()} AS counterpart_id, (COALESCE(attributes->>'New', '0') = '1') AS is_new, NOT show AS is_unreleased, ({GROUP_SQL}) AS item_group, ({SUBGROUP_SQL}) AS item_subgroup"
ACCESSIBLE = f"(show OR ({DEPARTMENT_SQL}) = 'wearable')"


@router.get("/meta")
@bounded_shop_read
def meta(request: Request, version: str | None = Query(None, max_length=64)):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        result = catalog(cur, version)
        cur.execute(f"SELECT ({DEPARTMENT_SQL}) AS department, count(*)::int AS count FROM shop_items WHERE revision = %s AND show GROUP BY 1", (result["revision"],))
        result["counts"] = {r["department"]: r["count"] for r in cur.fetchall()}
        pose = pose_catalog()
        remapped = pose and any(name in pose['models'] for name in result['bases'].values())
        result["bases"] = {sex: model_url(result["revision"], name, pose) for sex, name in result["bases"].items()}
        if remapped:
            result['texture_revision'] = pose['revision']
    result["admin_only"] = False
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
    favorites_only: bool = False,
    owned_only: bool = False,
    home: str | None = Query(None, max_length=20),
    include_unreleased: bool = False,
    cursor: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
):
    if home and (favorites_only or owned_only):
        raise HTTPException(422, '공개 마이홈은 공개 목록 조건으로 조회해주세요')
    uid = favorite_user(request) if favorites_only or owned_only else None
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        if home:
            uid = public_home_owner(cur, home)['user_id']
            owned_only = True
            include_unreleased = True
        current = catalog(cur, version)
        conditions = ["revision = %s", ACCESSIBLE if include_unreleased else "show"]
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
        if favorites_only:
            conditions.append('EXISTS (SELECT 1 FROM shop_favorites AS favorite WHERE favorite.user_id = %s AND favorite.item_id = shop_items.item_id)')
            args.append(uid)
        if owned_only:
            conditions.append(f"({DEPARTMENT_SQL}) = 'wearable'")
            conditions.append('EXISTS (SELECT 1 FROM shop_wardrobe AS owned WHERE owned.user_id = %s AND owned.item_id = shop_items.item_id)')
            args.append(uid)
        if paired_only:
            partner_preview = 'AND partner.preview_available AND partner.model IS NOT NULL' if preview_only else ''
            conditions.append(f"""({department_sql('shop_items')}) = 'wearable' AND (
              (shop_items.category = '1007' AND shop_items.sex = 'common' AND shop_items.preview_available)
              OR (({slot_sql('shop_items')}) = 'pet' AND shop_items.sex = 'common')
              OR EXISTS (
                SELECT 1 FROM shop_items AS partner
                WHERE partner.revision = shop_items.revision
                  AND partner.item_id = {counterpart_sql()}
                  AND {counterpart_sql('partner')} = shop_items.item_id
                  AND {"(partner.show OR " + department_sql('partner') + " = 'wearable')" if include_unreleased else 'partner.show'} AND ({department_sql('partner')}) = 'wearable'
                  AND ({slot_sql('partner')}) = ({slot_sql('shop_items')})
                  AND (partner.name_key = shop_items.name_key OR {reviewed_pair_sql()})
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
            descending = not cursor or cursor.startswith('d:')
            direction = 'DESC' if descending else 'ASC'
            if cursor:
                if not re.fullmatch(r"(?:d:)?\d{1,10}:\d{1,19}", cursor):
                    raise HTTPException(status_code=400, detail="목록 위치가 올바르지 않습니다")
                order, item_id = map(int, cursor.removeprefix('d:').split(":"))
                if order > 2147483647 or item_id > 9223372036854775807:
                    raise HTTPException(status_code=400, detail="목록 위치가 올바르지 않습니다")
                where += f" AND (sort_order, item_id) {'<' if descending else '>'} (%s, %s)"
                args.extend([order, item_id])
            cur.execute(f"SELECT {ITEM_COLUMNS}, sort_order AS _sort_order FROM shop_items WHERE {where} ORDER BY sort_order {direction}, item_id {direction} LIMIT %s", [*args, page_size + 1])
            rows = cur.fetchall()
            has_more = len(rows) > page_size
            rows = rows[:page_size]
            next_cursor = f"{'d:' if descending else ''}{rows[-1]['_sort_order']}:{rows[-1]['id']}" if has_more else None
        else:
            cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE {where} ORDER BY sort_order DESC, item_id DESC LIMIT %s OFFSET %s", [*args, page_size, (page - 1) * page_size])
            rows = cur.fetchall()
            has_more = page * page_size < total
            next_cursor = None
        result = [serialize(r) for r in rows]
    return JSONResponse({"version": current["revision"], "items": result, "total": total, "page": page, "page_size": page_size, "has_more": has_more, "next_cursor": next_cursor}, headers=PRIVATE_HEADERS)


@router.get("/favorites")
@bounded_shop_read
def favorites(request: Request):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor() as cur:
        favorite_storage(cur)
        cur.execute('SELECT item_id FROM shop_favorites WHERE user_id = %s ORDER BY item_id', (uid,))
        ids = [str(row[0]) for row in cur.fetchall()]
    return JSONResponse({'ids': ids}, headers=PRIVATE_HEADERS)


@router.delete("/favorites")
@bounded_shop_read
def clear_favorites(request: Request, slot: str | None = Query(None)):
    uid = favorite_user(request)
    if slot is not None and slot not in ('hair', 'face', 'top', 'bottom', 'shoes', 'pet', 'accessory', 'summon'):
        raise HTTPException(status_code=422, detail="아이템 부위가 올바르지 않습니다")
    with get_conn() as conn, conn.cursor() as cur:
        favorite_storage(cur)
        condition = f" AND EXISTS (SELECT 1 FROM shop_items AS i WHERE i.item_id = shop_favorites.item_id AND ({slot_sql('i')}) = %s)" if slot else ''
        cur.execute('DELETE FROM shop_favorites WHERE user_id = %s' + condition + ' RETURNING item_id', (uid, slot) if slot else (uid,))
        removed = [str(row[0]) for row in cur.fetchall()]
        conn.commit()
    return JSONResponse({'removed_ids': removed, 'count': len(removed)}, headers=PRIVATE_HEADERS)


@router.post("/favorites/{item_id}")
@bounded_shop_read
def add_favorite(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:
        raise HTTPException(status_code=422, detail="아이템 번호가 올바르지 않습니다")
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        favorite_storage(cur)
        current = catalog(cur, version)
        cur.execute(f"SELECT item_id FROM shop_items WHERE revision = %s AND item_id = %s AND {ACCESSIBLE}", (current['revision'], item_id))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="즐겨찾기에 추가할 수 없는 아이템입니다")
        cur.execute('INSERT INTO shop_favorites (user_id, item_id) VALUES (%s, %s) ON CONFLICT DO NOTHING', (uid, item_id))
        conn.commit()
    return JSONResponse({'id': str(item_id), 'favorite': True}, headers=PRIVATE_HEADERS)


@router.delete("/favorites/{item_id}")
@bounded_shop_read
def remove_favorite(request: Request, item_id: int):
    uid = favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:
        raise HTTPException(status_code=422, detail="아이템 번호가 올바르지 않습니다")
    with get_conn() as conn, conn.cursor() as cur:
        favorite_storage(cur)
        cur.execute('DELETE FROM shop_favorites WHERE user_id = %s AND item_id = %s', (uid, item_id))
        conn.commit()
    return JSONResponse({'id': str(item_id), 'favorite': False}, headers=PRIVATE_HEADERS)


def wardrobe_storage(cur):
    cur.execute("SELECT to_regclass('public.shop_wardrobe') AS owned, to_regclass('public.shop_wardrobe_mains') AS mains")
    row = cur.fetchone()
    if not row or not row['owned'] or not row['mains']:
        raise HTTPException(status_code=503, detail="내 의상 저장소를 준비 중입니다")


def wardrobe_state(cur, uid, revision):
    cur.execute('SELECT item_id FROM shop_wardrobe WHERE user_id = %s ORDER BY item_id', (uid,))
    ids = [str(row['item_id']) for row in cur.fetchall()]
    cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision = %s AND {ACCESSIBLE} AND item_id IN (SELECT item_id FROM shop_wardrobe_mains WHERE user_id = %s)", (revision, uid))
    items = {row['id']: serialize(row) for row in cur.fetchall()}
    cur.execute('SELECT sex, slot, item_id FROM shop_wardrobe_mains WHERE user_id = %s ORDER BY sex, slot', (uid,))
    mains = [{'sex': row['sex'], 'slot': row['slot'], 'item': items[row['item_id']]} for row in cur.fetchall() if row['item_id'] in items]
    return {'ids': ids, 'mains': mains}


@router.get('/wardrobe')
@bounded_shop_read
def wardrobe(request: Request, version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        wardrobe_storage(cur)
        current = catalog(cur, version)
        result = wardrobe_state(cur, uid, current['revision'])
    return JSONResponse(result, headers=PRIVATE_HEADERS)


def wardrobe_item(cur, uid, item_id, version):
    if not 0 < item_id <= 9223372036854775807:
        raise HTTPException(status_code=422, detail='아이템 번호가 올바르지 않습니다')
    wardrobe_storage(cur)
    current = catalog(cur, version)
    # Serialize first-save/default selection for the same account, including two concurrent saves.
    cur.execute('SELECT id FROM users WHERE id = %s FOR UPDATE', (uid,))
    cur.execute(f"SELECT sex, ({SLOT_SQL}) AS slot FROM shop_items WHERE revision = %s AND item_id = %s AND ({DEPARTMENT_SQL}) = 'wearable' AND ({SLOT_SQL}) IN ('hair','face','top','bottom','shoes','pet','accessory','summon')", (current['revision'], item_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='내 의상에 저장할 수 없는 아이템입니다')
    return current['revision'], row


class WardrobeBatch(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=8)


@router.post('/wardrobe/batch')
@bounded_shop_read
def save_wardrobe_batch(request: Request, payload: WardrobeBatch, version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    ids = sorted(set(payload.ids))
    if any(not 0 < item_id <= 9223372036854775807 for item_id in ids):
        raise HTTPException(422, '아이템 번호가 올바르지 않습니다')
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        wardrobe_storage(cur)
        current = catalog(cur, version)
        cur.execute('SELECT id FROM users WHERE id = %s FOR UPDATE', (uid,))
        cur.execute(f"SELECT item_id, sex, ({SLOT_SQL}) AS slot FROM shop_items WHERE revision = %s AND item_id = ANY(%s) AND ({DEPARTMENT_SQL}) = 'wearable' AND ({SLOT_SQL}) IN ('hair','face','top','bottom','shoes','pet','accessory','summon')", (current['revision'], ids))
        rows = cur.fetchall()
        if len(rows) != len(ids):
            raise HTTPException(404, '내 의상에 저장할 수 없는 아이템이 포함되어 있습니다')
        for row in rows:
            cur.execute('INSERT INTO shop_wardrobe (user_id,item_id) VALUES (%s,%s) ON CONFLICT DO NOTHING', (uid,row['item_id']))
            for sex in ('male','female') if row['sex'] == 'common' else (row['sex'],):
                cur.execute('INSERT INTO shop_wardrobe_mains (user_id,sex,slot,item_id) VALUES (%s,%s,%s,%s) ON CONFLICT (user_id,sex,slot) DO NOTHING', (uid,sex,row['slot'],row['item_id']))
        result = wardrobe_state(cur, uid, current['revision'])
        conn.commit()
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.delete('/wardrobe/{item_id}')
@bounded_shop_read
def delete_wardrobe(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:
        raise HTTPException(422, '아이템 번호가 올바르지 않습니다')
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        wardrobe_storage(cur)
        current = catalog(cur, version)
        cur.execute('SELECT id FROM users WHERE id = %s FOR UPDATE', (uid,))
        cur.execute('SELECT sex,slot FROM shop_wardrobe_mains WHERE user_id = %s AND item_id = %s', (uid,item_id))
        affected = cur.fetchall()
        cur.execute('DELETE FROM shop_wardrobe WHERE user_id = %s AND item_id = %s', (uid,item_id))
        for main in affected:
            cur.execute(f"""INSERT INTO shop_wardrobe_mains (user_id,sex,slot,item_id)
                SELECT %s,%s,%s,i.item_id FROM shop_wardrobe AS w JOIN shop_items AS i ON i.item_id = w.item_id
                WHERE w.user_id = %s AND i.revision = %s AND i.sex IN (%s,'common') AND ({slot_sql('i')}) = %s AND ({department_sql('i')}) = 'wearable'
                ORDER BY w.created_at,i.item_id LIMIT 1 ON CONFLICT DO NOTHING""", (uid,main['sex'],main['slot'],uid,current['revision'],main['sex'],main['slot']))
        result = wardrobe_state(cur,uid,current['revision'])
        conn.commit()
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.post('/wardrobe/{item_id}')
@bounded_shop_read
def save_wardrobe(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        revision, row = wardrobe_item(cur, uid, item_id, version)
        cur.execute('INSERT INTO shop_wardrobe (user_id, item_id) VALUES (%s, %s) ON CONFLICT DO NOTHING', (uid, item_id))
        for gender in ('male', 'female') if row['sex'] == 'common' else (row['sex'],):
            cur.execute('INSERT INTO shop_wardrobe_mains (user_id, sex, slot, item_id) VALUES (%s, %s, %s, %s) ON CONFLICT (user_id, sex, slot) DO NOTHING', (uid, gender, row['slot'], item_id))
        result = wardrobe_state(cur, uid, revision)
        conn.commit()
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.put('/wardrobe/{item_id}/main')
@bounded_shop_read
def set_wardrobe_main(request: Request, item_id: int, sex: str = Query(..., pattern='^(male|female)$'), version: str | None = Query(None, max_length=64)):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        revision, row = wardrobe_item(cur, uid, item_id, version)
        if row['sex'] not in ('common', sex):
            raise HTTPException(status_code=422, detail='캐릭터 성별에 맞는 의상을 선택해주세요')
        cur.execute('SELECT item_id FROM shop_wardrobe WHERE user_id = %s AND item_id = %s', (uid, item_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='먼저 내 의상으로 저장해주세요')
        cur.execute('INSERT INTO shop_wardrobe_mains (user_id, sex, slot, item_id) VALUES (%s, %s, %s, %s) ON CONFLICT (user_id, sex, slot) DO UPDATE SET item_id = EXCLUDED.item_id', (uid, sex, row['slot'], item_id))
        result = wardrobe_state(cur, uid, revision)
        conn.commit()
    return JSONResponse(result, headers=PRIVATE_HEADERS)


@router.get("/items/{item_id}")
@bounded_shop_read
def item(request: Request, item_id: int, version: str | None = Query(None, max_length=64)):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        cur.execute(f"SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision = %s AND item_id = %s AND {ACCESSIBLE}", (current["revision"], item_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="표시할 수 없는 아이템입니다")
    return JSONResponse(serialize(row), headers=PRIVATE_HEADERS)


@router.get("/assets/{version}/{kind}/{filename}")
@bounded_shop_read
def asset(request: Request, version: str, kind: str, filename: str):
    if not VERSION_PATTERN.fullmatch(version) or kind not in {"models", "textures", "thumbnails", "motions", "audio"} or not ASSET_PATTERN.fullmatch(filename):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    suffix = 'json' if filename.endswith('.json.gz') else 'audio' if filename.endswith(('.mp3', '.ogg')) else 'image'
    expected = 'json' if kind in {'models', 'motions'} else 'audio' if kind == 'audio' else 'image'
    if suffix != expected:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    target = SHOP_DIR / "assets" / version / kind / filename
    root = (SHOP_DIR / "assets").resolve()
    if not target.resolve().is_relative_to(root) or not target.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    headers = dict(PRIVATE_HEADERS)
    if suffix == 'json':
        headers["Content-Encoding"] = "gzip"
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    content_type = 'application/json' if suffix == 'json' else 'audio/mpeg' if filename.endswith('.mp3') else 'audio/ogg' if suffix == 'audio' else 'image/webp'
    return FileResponse(target, media_type=content_type, headers=headers)
