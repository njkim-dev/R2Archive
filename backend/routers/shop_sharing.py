import hashlib
import secrets
import string
from urllib.parse import quote

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from database import get_conn
from rate_limit import limiter
from routers.shop import bounded_shop_read, PRIVATE_HEADERS, catalog, favorite_user, wardrobe_state
from shop_sharing import home_handle, public_home_owner, short_target

router = APIRouter(prefix='/api/share', tags=['shop-sharing'])


class ShortInput(BaseModel):
    target: str = Field(max_length=4096)


class HomeInput(BaseModel):
    handle: str = Field(max_length=20)


@router.post('/short')
@limiter.limit('60/minute')
@bounded_shop_read
def create_short(request: Request, payload: ShortInput):
    target = short_target(payload.target)
    digest = hashlib.sha256(target.encode()).hexdigest()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT code FROM shop_short_links WHERE target_hash = %s', (digest,))
        existing = cur.fetchone()
        if existing:
            return JSONResponse({'url':'https://r2archive.com/short/' + existing[0]}, headers=PRIVATE_HEADERS)
        for _ in range(32):
            code = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(4))
            cur.execute('INSERT INTO shop_short_links (code,target,target_hash) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING RETURNING code', (code,target,digest))
            saved = cur.fetchone()
            if saved:
                conn.commit()
                return JSONResponse({'url':'https://r2archive.com/short/' + saved[0]}, headers=PRIVATE_HEADERS)
            cur.execute('SELECT code FROM shop_short_links WHERE target_hash = %s', (digest,))
            existing = cur.fetchone()
            if existing:
                return JSONResponse({'url':'https://r2archive.com/short/' + existing[0]}, headers=PRIVATE_HEADERS)
    from fastapi import HTTPException
    raise HTTPException(503, '짧은 URL을 생성하지 못했습니다. 다시 시도해주세요')


@router.get('/short/{code}')
@limiter.limit('120/minute')
@bounded_shop_read
def resolve_short(request: Request, code: str):
    import re
    from fastapi import HTTPException
    if not re.fullmatch(r'[a-z0-9]{4}', code):
        raise HTTPException(404, '존재하지 않거나 만료된 공유 URL입니다')
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('UPDATE shop_short_links SET use_count = use_count + 1, last_used_at = now() WHERE code = %s RETURNING target', (code,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, '존재하지 않거나 만료된 공유 URL입니다')
        target = short_target(row[0])
        conn.commit()
    return JSONResponse({'target':target}, headers=PRIVATE_HEADERS)


@router.get('/myhome')
@bounded_shop_read
def myhome_link(request: Request):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT handle FROM shop_myhome_links WHERE user_id = %s AND active', (uid,))
        row = cur.fetchone()
    return JSONResponse({'handle':row[0] if row else None}, headers=PRIVATE_HEADERS)


@router.get('/myhome/check')
@limiter.limit('60/minute')
@bounded_shop_read
def check_home(request: Request, handle: str = Query(..., max_length=20)):
    uid = favorite_user(request)
    normalized, key = home_handle(handle)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT user_id FROM shop_myhome_links WHERE handle_key = %s', (key,))
        row = cur.fetchone()
    return JSONResponse({'handle':normalized,'available':not row or row[0] == uid}, headers=PRIVATE_HEADERS)


@router.put('/myhome')
@limiter.limit('20/minute')
@bounded_shop_read
def publish_home(request: Request, payload: HomeInput):
    from fastapi import HTTPException
    uid = favorite_user(request)
    handle, key = home_handle(payload.handle)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM users WHERE id = %s FOR UPDATE', (uid,))
        cur.execute('SELECT handle FROM shop_myhome_links WHERE user_id = %s AND active', (uid,))
        existing = cur.fetchone()
        if existing:
            handle = existing[0]
        else:
            cur.execute('INSERT INTO shop_myhome_links (handle_key,handle,user_id) VALUES (%s,%s,%s) ON CONFLICT (handle_key) DO UPDATE SET active = true WHERE shop_myhome_links.user_id = EXCLUDED.user_id RETURNING handle', (key,handle,uid))
            row = cur.fetchone()
            if not row:
                raise HTTPException(409, '이미 사용 중인 ID입니다')
            handle = row[0]
        conn.commit()
    return JSONResponse({'handle':handle,'url':'https://r2archive.com/myhome/' + quote(handle,safe='')}, headers=PRIVATE_HEADERS)


@router.delete('/myhome')
@bounded_shop_read
def unpublish_home(request: Request):
    uid = favorite_user(request)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM users WHERE id = %s FOR UPDATE', (uid,))
        cur.execute('UPDATE shop_myhome_links SET active = false WHERE user_id = %s AND active', (uid,))
        conn.commit()
    return JSONResponse({'handle':None}, headers=PRIVATE_HEADERS)


@router.get('/homes/{handle}')
@bounded_shop_read
def read_public_home(request: Request, handle: str, version: str | None = Query(None, max_length=64)):
    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        owner = public_home_owner(cur, handle)
        current = catalog(cur, version)
        state = wardrobe_state(cur, owner['user_id'], current['revision'])
    return JSONResponse({**state,'handle':owner['handle']}, headers=PRIVATE_HEADERS)
