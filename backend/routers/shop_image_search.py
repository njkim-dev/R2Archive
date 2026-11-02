import logging
import re

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor

from database import get_conn
from rate_limit import limiter, user_key
from routers.shop import ACCESSIBLE, ITEM_COLUMNS, catalog, serialize
import shop_image_search as search
from work_capacity import WorkCapacity, run_blocking


router = APIRouter(prefix='/api/shop/image-search', tags=['shop'])
capacity = WorkCapacity(1)
logger = logging.getLogger(__name__)


@router.get('/status')
def image_search_status():
    return search.status()


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
                       slot: str = Form(...), version: str = Form(''), include_unreleased: bool = Form(True)):
    if sex not in ('male', 'female') or slot not in ('hair', 'top'):
        raise HTTPException(422, '성별과 찾을 부위를 선택해주세요.')
    if version and not re.fullmatch(r'[a-f0-9]{12,64}', version):
        raise HTTPException(422, '상점 데이터 버전이 올바르지 않습니다.')
    with capacity.enter(user_key(request)):
        content = await image.read(search.MAX_BYTES + 1)
        result = await run_blocking(find, content, sex, slot, version or None, include_unreleased)
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
