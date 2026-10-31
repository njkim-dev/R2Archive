import hashlib
from fastapi import HTTPException
from shop_sharing import home_handle


SLOTS = ('hair','face','top','bottom','shoes','pet','accessory','summon')


def require_character(cur, uid, character_id, lock=False):
    if not isinstance(character_id,int) or not 0 < character_id <= 9223372036854775807:
        raise HTTPException(422,'캐릭터 번호가 올바르지 않습니다')
    cur.execute('SELECT id,user_id,name,sex,thumbnail_key FROM shop_characters WHERE id=%s AND user_id=%s'+(' FOR UPDATE' if lock else ''),(character_id,uid))
    row=cur.fetchone()
    if not row:
        raise HTTPException(404,'캐릭터를 찾을 수 없습니다')
    return row


def character_name(value):
    return home_handle(value)


def thumbnail_key(revision,sex,mains):
    raw='|'.join([revision,sex,*sorted(main['slot']+':'+main['item']['id'] for main in mains)])
    return hashlib.sha256(raw.encode()).hexdigest()[:24]
