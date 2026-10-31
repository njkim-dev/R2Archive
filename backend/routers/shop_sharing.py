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
from shop_characters import require_character

router = APIRouter(prefix='/api/share', tags=['shop-sharing'])


class ShortInput(BaseModel):
    target: str = Field(max_length=4096)


class HomeInput(BaseModel):
    handle: str = Field(max_length=20)
    character_id: int = Field(gt=0,le=9223372036854775807)


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
def myhome_link(request:Request,character_id:int|None=Query(None,gt=0,le=9223372036854775807)):
    uid=favorite_user(request)
    if not character_id:return JSONResponse({'handle':None},headers=PRIVATE_HEADERS)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        require_character(cur,uid,character_id)
        cur.execute('SELECT handle FROM shop_myhome_links WHERE character_id=%s AND active',(character_id,));row=cur.fetchone()
    return JSONResponse({'handle':row['handle'] if row else None},headers=PRIVATE_HEADERS)


@router.get('/myhome/check')
@limiter.limit('60/minute')
@bounded_shop_read
def check_home(request:Request,handle:str=Query(...,max_length=20),character_id:int|None=Query(None,gt=0,le=9223372036854775807)):
    uid=favorite_user(request);normalized,key=home_handle(handle)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        if character_id:require_character(cur,uid,character_id)
        cur.execute('SELECT user_id,character_id,active FROM shop_myhome_links WHERE handle_key=%s',(key,));row=cur.fetchone()
    available=not row or row['user_id']==uid and (not row['active'] or row['character_id']==character_id)
    return JSONResponse({'handle':normalized,'available':bool(available)},headers=PRIVATE_HEADERS)


@router.put('/myhome')
@limiter.limit('20/minute')
@bounded_shop_read
def publish_home(request:Request,payload:HomeInput):
    from fastapi import HTTPException
    uid=favorite_user(request);handle,key=home_handle(payload.handle)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        require_character(cur,uid,payload.character_id,True)
        cur.execute('SELECT handle FROM shop_myhome_links WHERE character_id=%s AND active',(payload.character_id,));existing=cur.fetchone()
        if existing:handle=existing['handle']
        else:
            cur.execute('INSERT INTO shop_myhome_links(handle_key,handle,user_id,character_id) VALUES(%s,%s,%s,%s) ON CONFLICT(handle_key) DO UPDATE SET active=true,character_id=EXCLUDED.character_id WHERE shop_myhome_links.user_id=EXCLUDED.user_id AND (NOT shop_myhome_links.active OR shop_myhome_links.character_id=EXCLUDED.character_id) RETURNING handle',(key,handle,uid,payload.character_id));row=cur.fetchone()
            if not row:raise HTTPException(409,'이미 사용 중인 ID입니다')
            handle=row['handle']
        conn.commit()
    return JSONResponse({'handle':handle,'url':'https://r2archive.com/myhome/'+quote(handle,safe='')},headers=PRIVATE_HEADERS)


@router.delete('/myhome')
@bounded_shop_read
def unpublish_home(request:Request,character_id:int=Query(...,gt=0,le=9223372036854775807)):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        require_character(cur,uid,character_id,True)
        cur.execute('UPDATE shop_myhome_links SET active=false WHERE character_id=%s AND user_id=%s',(character_id,uid));conn.commit()
    return JSONResponse({'handle':None},headers=PRIVATE_HEADERS)


@router.get('/homes/{handle}')
@bounded_shop_read
def read_public_home(request:Request,handle:str,version:str|None=Query(None,max_length=64)):
    from routers.shop_characters import character_state
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        owner=public_home_owner(cur,handle);revision=catalog(cur,version)['revision']
        state=character_state(cur,{**owner,'id':owner['character_id']},revision,public=True)
        state.pop('thumbnail',None)
    return JSONResponse({**state,'handle':owner['handle']},headers=PRIVATE_HEADERS)
