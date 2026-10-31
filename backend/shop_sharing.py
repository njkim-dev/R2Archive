import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit

from fastapi import HTTPException


def home_handle(value):
    handle = unicodedata.normalize('NFC', value)
    if not re.fullmatch(r'[A-Za-z0-9\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\[\]_-]+', handle) or not 1 <= len(handle.encode('utf8')) <= 20:
        raise HTTPException(422, 'ID는 영어ㆍ숫자ㆍ한글ㆍ[ㆍ]ㆍ-ㆍ_만 사용할 수 있으며 최대 20byte입니다')
    return handle, handle.casefold()


def public_home_owner(cur, handle):
    _, key = home_handle(handle)
    cur.execute('SELECT l.user_id,l.handle,c.id AS character_id,c.name,c.sex,c.thumbnail_key FROM shop_myhome_links l JOIN shop_characters c ON c.id=l.character_id WHERE l.handle_key=%s AND l.active',(key,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, '존재하지 않거나 공유가 해제된 마이홈입니다')
    return row


def short_target(value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.path != '/shop' or parsed.fragment or len(value) > 4096:
        raise HTTPException(422, '상점 공유 URL만 저장할 수 있습니다')
    try:
        pairs = parse_qsl(parsed.query, keep_blank_values=True, max_num_fields=48)
    except ValueError:
        raise HTTPException(422, '공유 URL이 올바르지 않습니다')
    fields = dict(pairs)
    if len(fields) != len(pairs):
        raise HTTPException(422, '공유 URL에 중복된 항목이 있습니다')
    patterns = {'v':r'[a-f0-9]{12,64}', 'sex':r'male|female', 'view':r'preview|couple', 'pair':r'[01]', 'price':r'[A-Z0-9]{1,8}'}
    patterns['partnerSex']=r'male|female'
    for key in ['item','hair','face','top','bottom','shoes','pet','accessory','summon']:
        patterns[key] = r'[0-9]{1,12}'
        if key!='item':patterns['partner_'+key]=r'[0-9]{1,12}'
    for key, val in fields.items():
        if key in ['angle','zoom','panX','panY']:
            import math
            try:
                number = float(val)
            except ValueError:
                raise HTTPException(422, '카메라 값이 올바르지 않습니다')
            low, high = (0,360) if key == 'angle' else (75,135) if key == 'zoom' else (-75,75)
            if not math.isfinite(number) or not low <= number <= high:
                raise HTTPException(422, '카메라 값이 올바르지 않습니다')
            fields[key] = format(number, '.8g')
        elif key not in patterns or not re.fullmatch(patterns[key], val):
            raise HTTPException(422, '공유 URL 항목이 올바르지 않습니다')
    return '/shop' + ('?' + urlencode(sorted(fields.items())) if fields else '')
