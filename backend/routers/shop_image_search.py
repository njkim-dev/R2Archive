import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor

from database import get_conn
from auth import require_admin
from rate_limit import limiter, user_key
from routers.shop import ACCESSIBLE, ITEM_COLUMNS, catalog, serialize
import shop_image_search as search
import shop_outfit_search as outfit
from work_capacity import WorkCapacity, run_blocking


router = APIRouter(prefix='/api/shop/image-search', tags=['shop'], dependencies=[Depends(require_admin)])
capacity = WorkCapacity(1)
logger = logging.getLogger(__name__)


@router.get('/status')
def image_search_status():
    return JSONResponse({**search.status(), 'automatic': outfit.configured()}, headers={'Cache-Control': 'no-store'})


def find_outfit(content, sex, slot, version, include_unreleased):
    try:
        image = search.decode_image(content)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not outfit.configured():
        image.close()
        raise HTTPException(503, '자동 이미지 검색을 준비 중입니다. 잠시 후 다시 시도해주세요.')
    try:
        with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            current = catalog(cur, version)
            cur.execute(f'SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision=%s '
                        f'AND ({"show" if not include_unreleased else ACCESSIBLE}) '
                        f'AND ({outfit_slot_sql()})', (current['revision'],))
            allowed = {str(row['id']): dict(row) for row in cur.fetchall()}
        slots = outfit.SLOTS if slot == 'all' else (slot,)
        result = outfit.cached_search(content, image, allowed, current['revision'], slots, sex if sex in ('male', 'female') else None)
        groups = []
        items = []
        for part,match in result['parts'].items():
            selected = match['id']
            ids = ([selected] if selected else []) + match['alternatives']
            candidates = [serialize(allowed[item_id]) for item_id in ids if item_id in allowed]
            groups.append({'slot': part, 'selected_id': selected, 'confidence': match['confidence'],
                           'exact_match_supported': match['exact_match_supported'], 'items': candidates})
            items.extend(candidates)
        return {'items': items, 'groups': groups, 'sex': result['sex'], 'version': current['revision'],
                'elapsed_seconds': result['timing']['total_seconds'] if not result['cached'] else 0,
                'cached': result['cached']}
    except outfit.SearchUnavailable as exc:
        raise HTTPException(503, str(exc)) from None
    except HTTPException:
        raise
    except Exception:
        logger.exception('Automatic shop image search failed')
        raise HTTPException(503, '이미지 검색을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.') from None
    finally:
        image.close()


def outfit_slot_sql():
    from routers.shop import SLOT_SQL, DEPARTMENT_SQL
    return f"({DEPARTMENT_SQL})='wearable' AND ({SLOT_SQL}) IN ('hair','top','bottom','shoes')"


def find(content, sex, slot, version, include_unreleased):
    try:
        image = search.decode_image(content)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        model = search.engine()
    except Exception:
        logger.exception('Shop image search index is unavailable')
        raise HTTPException(503, '이미지 검색을 준비 중입니다. 잠시 후 다시 시도해주세요.') from None
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        current = catalog(cur, version)
        cur.execute(f'SELECT item_id, thumbnail FROM shop_items WHERE revision=%s AND sex IN (%s,\'common\') '
                    f'AND slot=%s AND {ACCESSIBLE if include_unreleased else "show"}',
                    (current['revision'], sex, slot))
        allowed = {str(row['item_id']): row['thumbnail'] for row in cur.fetchall()}
    try:
        ids = model.search(image, sex, slot, allowed)
    except Exception:
        logger.exception('Shop image search inference failed')
        raise HTTPException(503, '이미지 검색을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.') from None
    finally:
        image.close()
    if not ids:
        return {'items': [], 'version': current['revision']}
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f'SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision=%s AND item_id=ANY(%s) '
                    f'AND {ACCESSIBLE if include_unreleased else "show"}', (current['revision'], [int(i) for i in ids]))
        items = {str(row['id']): serialize(row) for row in cur.fetchall()}
    return {'items': [items[i] for i in ids if i in items], 'version': current['revision']}


@router.post('')
@limiter.limit('10/minute', key_func=user_key)
async def image_search(request: Request, image: UploadFile = File(...), sex: str = Form(...),
                       slot: str = Form(...), version: str = Form(''), include_unreleased: bool = Form(True),
                       mode: str = Form('cpu')):
    if mode not in ('cpu', 'terra'):
        raise HTTPException(422, '검색 방식이 올바르지 않습니다.')
    if (mode == 'cpu' and (sex not in ('male', 'female') or slot not in ('hair', 'top'))) or (mode == 'terra' and (sex not in ('auto', 'male', 'female') or slot not in ('all', *outfit.SLOTS))):
        raise HTTPException(422, '성별과 찾을 부위를 선택해주세요.')
    if version and not re.fullmatch(r'[a-f0-9]{12,64}', version):
        raise HTTPException(422, '상점 데이터 버전이 올바르지 않습니다.')
    with capacity.enter(user_key(request)):
        content = await image.read(search.MAX_BYTES + 1)
        result = await run_blocking(find_outfit if mode == 'terra' else find, content, sex, slot, version or None, include_unreleased)
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
