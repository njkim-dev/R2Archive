from urllib.parse import unquote,urlsplit
from fastapi import APIRouter,HTTPException,Query,Request,Response
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel,Field
from database import get_conn
from routers.shop import bounded_shop_read,favorite_user,PRIVATE_HEADERS,catalog
from shop_characters import require_character
from shop_sharing import public_home_owner
from shop_couples import partner_character,lock_couple_changes

router=APIRouter(prefix='/api/shop/couples',tags=['shop-couples'])

class CoupleRequest(BaseModel):
    url:str=Field(max_length=512)

def public_handle(url):
    try:
        target=urlsplit(url)
        segments=target.path.strip('/').split('/')
        if target.scheme!='https' or target.netloc!='r2archive.com' or len(segments)!=2 or segments[0]!='myhome':raise ValueError()
        return unquote(segments[1],errors='strict')
    except (ValueError,UnicodeError):raise HTTPException(422,'상대 캐릭터의 마이홈 URL을 입력해주세요')

def relations(cur,uid):
    cur.execute("SELECT r.id,r.status,r.created_at,own.id AS character_id,own.name AS character_name,own.sex AS character_sex,peer.id AS partner_id,peer.name AS partner_name,peer.sex AS partner_sex,COALESCE(u.nickname,peer.name) AS requester_name,(r.recipient_id=own.id) AS incoming FROM shop_couple_members m JOIN shop_characters own ON own.id=m.character_id JOIN shop_couple_relationships r ON r.id=m.relationship_id JOIN shop_characters peer ON peer.id=CASE WHEN r.sender_id=own.id THEN r.recipient_id ELSE r.sender_id END JOIN users u ON u.id=peer.user_id WHERE own.user_id=%s ORDER BY r.created_at,r.id",(uid,))
    return [{'id':str(row['id']),'status':row['status'],'incoming':row['incoming'],'requester_name':row['requester_name'],'character':{'id':str(row['character_id']),'name':row['character_name'],'sex':row['character_sex']},'partner':{'id':str(row['partner_id']),'name':row['partner_name'],'sex':row['partner_sex']},'url':'/myhome/partners/'+str(row['character_id'])} for row in cur.fetchall()]

@router.get('')
@bounded_shop_read
def list_couples(request:Request):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:result=relations(cur,uid)
    return JSONResponse({'relationships':result},headers=PRIVATE_HEADERS)

@router.post('/{character_id}')
@bounded_shop_read
def request_couple(request:Request,character_id:int,payload:CoupleRequest):
    uid=favorite_user(request);handle=public_handle(payload.url)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        lock_couple_changes(cur)
        require_character(cur,uid,character_id)
        peer=public_home_owner(cur,handle);other=peer['character_id']
        if other==character_id:raise HTTPException(422,'같은 캐릭터는 커플로 등록할 수 없습니다')
        cur.execute('SELECT id FROM shop_characters WHERE id=ANY(%s) ORDER BY id FOR UPDATE',([character_id,other],))
        if len(cur.fetchall())!=2:raise HTTPException(404,'캐릭터를 찾을 수 없습니다')
        cur.execute('SELECT 1 FROM shop_couple_members WHERE character_id=ANY(%s)',([character_id,other],))
        if cur.fetchone():raise HTTPException(409,'이미 커플이 등록되어 있거나 진행 중인 요청이 있습니다')
        status='accepted' if peer['user_id']==uid else 'pending'
        cur.execute('INSERT INTO shop_couple_relationships(sender_id,recipient_id,status) VALUES(%s,%s,%s) RETURNING id',(character_id,other,status));rid=cur.fetchone()['id']
        cur.execute('INSERT INTO shop_couple_members(character_id,relationship_id) VALUES(%s,%s),(%s,%s)',(character_id,rid,other,rid));conn.commit()
    return JSONResponse({'ok':True,'status':status},status_code=201,headers=PRIVATE_HEADERS)

def locked_relation(cur,uid,character_id,expected_id=None,expected_status=None):
    lock_couple_changes(cur)
    require_character(cur,uid,character_id)
    cur.execute('SELECT r.id,r.sender_id,r.recipient_id,r.status FROM shop_couple_relationships r JOIN shop_couple_members m ON m.relationship_id=r.id WHERE m.character_id=%s',(character_id,));row=cur.fetchone()
    if not row:raise HTTPException(404,'커플 요청 또는 등록 정보를 찾을 수 없습니다')
    cur.execute('SELECT id FROM shop_characters WHERE id=ANY(%s) ORDER BY id FOR UPDATE',([row['sender_id'],row['recipient_id']],));cur.fetchall()
    cur.execute('SELECT id,sender_id,recipient_id,status FROM shop_couple_relationships WHERE id=%s FOR UPDATE',(row['id'],));row=cur.fetchone()
    if not row:raise HTTPException(409,'이미 처리된 요청입니다')
    if expected_id is not None and row['id']!=expected_id or expected_status is not None and row['status']!=expected_status:raise HTTPException(409,'커플 정보가 변경되었습니다. 현재 상태를 다시 확인해주세요')
    return row

@router.post('/{character_id}/accept')
@bounded_shop_read
def accept_couple(request:Request,character_id:int,relationship_id:int|None=Query(None,gt=0,le=9223372036854775807)):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        row=locked_relation(cur,uid,character_id,relationship_id)
        if row['recipient_id']!=character_id or row['status']!='pending':raise HTTPException(409,'수락할 수 있는 요청이 아닙니다')
        cur.execute("UPDATE shop_couple_relationships SET status='accepted' WHERE id=%s",(row['id'],));conn.commit()
    return JSONResponse({'ok':True},headers=PRIVATE_HEADERS)

@router.delete('/{character_id}')
@bounded_shop_read
def remove_couple(request:Request,character_id:int,relationship_id:int|None=Query(None,gt=0,le=9223372036854775807),expected_status:str|None=Query(None,pattern='^(pending|accepted)$')):
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        row=locked_relation(cur,uid,character_id,relationship_id,expected_status);cur.execute('DELETE FROM shop_couple_relationships WHERE id=%s',(row['id'],));conn.commit()
    return Response(status_code=204,headers=PRIVATE_HEADERS)

@router.get('/{character_id}/home')
@bounded_shop_read
def read_partner(request:Request,character_id:int,version:str|None=Query(None,max_length=64)):
    from routers.shop_characters import character_state
    uid=favorite_user(request)
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as cur:
        peer=partner_character(cur,uid,character_id);result=character_state(cur,peer,catalog(cur,version)['revision'],public=True);result.pop('thumbnail',None)
    return JSONResponse(result,headers=PRIVATE_HEADERS)
