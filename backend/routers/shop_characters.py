import hashlib
import io

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from PIL import Image
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from database import get_conn
from routers.shop import ACCESSIBLE, ITEM_COLUMNS, bounded_shop_read, catalog, favorite_user, serialize, PRIVATE_HEADERS
from shop_categories import DEPARTMENT_SQL, SLOT_SQL, GROUP_SQL, slot_sql
from shop_characters import SLOTS, character_name, require_character, thumbnail_key

router=APIRouter(prefix='/api/shop/characters',tags=['shop-characters'])
ELIGIBLE=f"(({DEPARTMENT_SQL})='wearable' OR category='507' OR category='508' AND ({GROUP_SQL})='friend')"


class NewCharacter(BaseModel):
    name:str=Field(min_length=1,max_length=20)
    sex:str=Field(pattern='^(male|female)$')


class SaveItems(BaseModel):
    ids:list[int]=Field(min_length=1,max_length=8)


def character_state(cur,character,revision,public=False):
    cid=character['id']
    cur.execute('SELECT item_id,is_private FROM shop_character_items WHERE character_id=%s'+(' AND NOT is_private' if public else '')+' ORDER BY item_id',(cid,))
    rows=cur.fetchall();ids=[str(row['item_id']) for row in rows];private_ids=[str(row['item_id']) for row in rows if row.get('is_private')]
    cur.execute(f'SELECT {ITEM_COLUMNS} FROM shop_items WHERE revision=%s AND {ACCESSIBLE} AND item_id IN (SELECT item_id FROM shop_character_mains WHERE character_id=%s)'+(' AND item_id IN (SELECT item_id FROM shop_character_items WHERE character_id=%s AND NOT is_private)' if public else ''),(revision,cid,cid) if public else (revision,cid))
    items={row['id']:serialize(row) for row in cur.fetchall()}
    cur.execute('SELECT slot,item_id FROM shop_character_mains WHERE character_id=%s ORDER BY slot',(cid,))
    mains=[{'sex':character['sex'],'slot':row['slot'],'item':items[row['item_id']]} for row in cur.fetchall() if row['item_id'] in items]
    key=thumbnail_key(revision,character['sex'],mains)
    return {'character':{'id':str(cid),'name':character['name'],'sex':character['sex']},'ids':ids,'mains':mains,'thumbnail_key':key,'thumbnail':f'/api/shop/characters/{cid}/thumbnail?key={key}' if character.get('thumbnail_key')==key else None,**({'private_ids':private_ids} if not public else {})}


@router.get('')
@bounded_shop_read
def list_characters(request:Request,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        revision=catalog(cur,version)['revision']
        cur.execute('SELECT id,name,sex,thumbnail_key FROM shop_characters WHERE user_id=%s ORDER BY id',(uid,))
        characters=cur.fetchall()
        result=[character_state(cur,c,revision) for c in characters]
    return JSONResponse({'characters':result,'limit':17},headers=PRIVATE_HEADERS)


@router.post('')
@bounded_shop_read
def create_character(request:Request,payload:NewCharacter,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request);name,key=character_name(payload.name)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        revision=catalog(cur,version)['revision']
        cur.execute('SELECT id FROM users WHERE id=%s FOR UPDATE',(uid,))
        cur.execute('SELECT count(*) AS n FROM shop_characters WHERE user_id=%s',(uid,))
        if cur.fetchone()['n']>=17:raise HTTPException(409,'캐릭터는 최대 17개까지 생성할 수 있습니다')
        cur.execute('INSERT INTO shop_characters(user_id,name,name_key,sex) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,name_key) DO NOTHING RETURNING id,name,sex,thumbnail_key',(uid,name,key,payload.sex))
        character=cur.fetchone()
        if not character:raise HTTPException(409,'이미 사용 중인 캐릭터 이름입니다')
        result=character_state(cur,character,revision);conn.commit()
    return JSONResponse(result,status_code=201,headers=PRIVATE_HEADERS)


@router.get('/{character_id}')
@bounded_shop_read
def read_character(request:Request,character_id:int,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        result=character_state(cur,require_character(cur,uid,character_id),catalog(cur,version)['revision'])
    return JSONResponse(result,headers=PRIVATE_HEADERS)


@router.delete('/{character_id}')
@bounded_shop_read
def delete_character(request:Request,character_id:int):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        from shop_couples import lock_couple_changes
        lock_couple_changes(cur)
        require_character(cur,uid,character_id,True)
        cur.execute('UPDATE shop_myhome_links SET active=false WHERE character_id=%s',(character_id,))
        cur.execute('DELETE FROM shop_characters WHERE id=%s AND user_id=%s',(character_id,uid));conn.commit()
    return Response(status_code=204,headers=PRIVATE_HEADERS)


class ItemPrivacy(BaseModel):
    is_private:bool


@router.put('/{character_id}/items/{item_id}/privacy')
@bounded_shop_read
def set_item_privacy(request:Request,character_id:int,item_id:int,payload:ItemPrivacy,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:raise HTTPException(422,'아이템 번호가 올바르지 않습니다')
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        character=require_character(cur,uid,character_id,True);revision=catalog(cur,version)['revision']
        cur.execute('UPDATE shop_character_items SET is_private=%s WHERE character_id=%s AND item_id=%s RETURNING item_id',(payload.is_private,character_id,item_id))
        if not cur.fetchone():raise HTTPException(404,'저장한 아이템을 찾을 수 없습니다')
        result=character_state(cur,character,revision);conn.commit()
    return JSONResponse(result,headers=PRIVATE_HEADERS)


@router.post('/{character_id}/items')
@bounded_shop_read
def save_items(request:Request,character_id:int,payload:SaveItems,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request);ids=sorted(set(payload.ids))
    if any(not 0 < x <= 9223372036854775807 for x in ids):raise HTTPException(422,'아이템 번호가 올바르지 않습니다')
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        character=require_character(cur,uid,character_id,True);revision=catalog(cur,version)['revision']
        cur.execute(f"SELECT item_id,sex,({SLOT_SQL}) AS slot,({DEPARTMENT_SQL}) AS department FROM shop_items WHERE revision=%s AND item_id=ANY(%s) AND {ELIGIBLE} AND sex IN (%s,'common')",(revision,ids,character['sex']))
        rows=cur.fetchall()
        if len(rows)!=len(ids):raise HTTPException(422,'캐릭터 성별에 맞는 의상ㆍ커플링ㆍ단짝링만 저장할 수 있습니다')
        for row in rows:
            cur.execute('INSERT INTO shop_character_items(character_id,item_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(character_id,row['item_id']))
            if row['department']=='wearable' and row['slot'] in SLOTS:
                cur.execute('INSERT INTO shop_character_mains(character_id,slot,item_id) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(character_id,row['slot'],row['item_id']))
        result=character_state(cur,character,revision);conn.commit()
    return JSONResponse(result,headers=PRIVATE_HEADERS)


@router.delete('/{character_id}/items/{item_id}')
@bounded_shop_read
def remove_item(request:Request,character_id:int,item_id:int,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:raise HTTPException(422,'아이템 번호가 올바르지 않습니다')
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        character=require_character(cur,uid,character_id,True);revision=catalog(cur,version)['revision']
        cur.execute('SELECT slot FROM shop_character_mains WHERE character_id=%s AND item_id=%s',(character_id,item_id));affected=cur.fetchall()
        cur.execute('DELETE FROM shop_character_items WHERE character_id=%s AND item_id=%s',(character_id,item_id))
        for row in affected:
            cur.execute(f"INSERT INTO shop_character_mains(character_id,slot,item_id) SELECT %s,%s,i.item_id FROM shop_character_items ci JOIN shop_items i ON i.item_id=ci.item_id WHERE ci.character_id=%s AND i.revision=%s AND ({slot_sql('i')})=%s AND i.sex IN (%s,'common') ORDER BY ci.created_at,i.item_id LIMIT 1 ON CONFLICT DO NOTHING",(character_id,row['slot'],character_id,revision,row['slot'],character['sex']))
        result=character_state(cur,character,revision);conn.commit()
    return JSONResponse(result,headers=PRIVATE_HEADERS)


@router.put('/{character_id}/mains/{item_id}')
@bounded_shop_read
def set_main(request:Request,character_id:int,item_id:int,version:str|None=Query(None,max_length=64)):
    uid=favorite_user(request)
    if not 0 < item_id <= 9223372036854775807:raise HTTPException(422,'아이템 번호가 올바르지 않습니다')
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        character=require_character(cur,uid,character_id,True);revision=catalog(cur,version)['revision']
        cur.execute(f"SELECT ({SLOT_SQL}) AS slot FROM shop_items WHERE revision=%s AND item_id=%s AND ({DEPARTMENT_SQL})='wearable' AND sex IN (%s,'common') AND item_id IN (SELECT item_id FROM shop_character_items WHERE character_id=%s)",(revision,item_id,character['sex'],character_id))
        row=cur.fetchone()
        if not row or row['slot'] not in SLOTS:raise HTTPException(422,'저장한 꾸미기 아이템만 메인으로 지정할 수 있습니다')
        cur.execute('INSERT INTO shop_character_mains(character_id,slot,item_id) VALUES(%s,%s,%s) ON CONFLICT(character_id,slot) DO UPDATE SET item_id=EXCLUDED.item_id',(character_id,row['slot'],item_id))
        result=character_state(cur,character,revision);conn.commit()
    return JSONResponse(result,headers=PRIVATE_HEADERS)


@router.put('/{character_id}/thumbnail')
async def save_thumbnail(request:Request,character_id:int,key:str=Query(...,pattern='^[a-f0-9]{24}$'),version:str|None=Query(None,max_length=64)):
    uid=await run_in_threadpool(favorite_user,request)
    data=bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data)>196608:raise HTTPException(413,'썸네일 용량이 큽니다')
    return await run_in_threadpool(store_thumbnail,request,uid,character_id,key,version,bytes(data))


@bounded_shop_read
def store_thumbnail(request,uid,character_id,key,version,data):
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format!='WEBP' or image.width>512 or image.height>768 or image.width<1 or image.height<1:raise ValueError()
            image.verify()
    except Exception:raise HTTPException(422,'올바른 WebP 썸네일이 아닙니다')
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        character=require_character(cur,uid,character_id,True);state=character_state(cur,character,catalog(cur,version)['revision'])
        if state['thumbnail_key']!=key:raise HTTPException(409,'의상이 변경되었습니다')
        cur.execute('UPDATE shop_characters SET thumbnail=%s,thumbnail_key=%s WHERE id=%s',(data,key,character_id));conn.commit()
    return Response(status_code=204,headers=PRIVATE_HEADERS)


@router.get('/{character_id}/thumbnail')
@bounded_shop_read
def get_thumbnail(request:Request,character_id:int):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        require_character(cur,uid,character_id)
        cur.execute('SELECT thumbnail FROM shop_characters WHERE id=%s',(character_id,));data=cur.fetchone()['thumbnail']
    if not data:raise HTTPException(404,'썸네일을 준비 중입니다')
    headers={'Cache-Control':'private, max-age=0, must-revalidate','ETag':'"'+hashlib.sha256(bytes(data)).hexdigest()+'"'}
    if request.headers.get('if-none-match')==headers['ETag']:return Response(status_code=304,headers=headers)
    return Response(bytes(data),media_type='image/webp',headers=headers)
