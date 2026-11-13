import re
import secrets

import jwt
from fastapi import HTTPException

from auth import COOKIE_SECURE, SESSION_SECRET


COOKIE = 'r2_shop_image_guest'
LIMIT = 5
LIMIT_MESSAGE = '비로그인 사용자는 이미지 검색이 5회로 제한됩니다'


def identity(request):
    try:
        payload = jwt.decode(request.cookies.get(COOKIE, ''), SESSION_SECRET, algorithms=['HS256'])
        value = payload.get('guest_id', '')
        if payload.get('purpose') == COOKIE and isinstance(value, str) and re.fullmatch(r'[a-f0-9]{32}', value):
            return value
    except jwt.InvalidTokenError:
        pass
    return None


def new_identity():
    return secrets.token_hex(16)


def initialize(response, guest_id):
    token = jwt.encode({'purpose': COOKIE, 'guest_id': guest_id}, SESSION_SECRET, algorithm='HS256')
    response.set_cookie(COOKIE, token, max_age=34560000, httponly=True, secure=COOKIE_SECURE, samesite='lax', path='/api/shop/image-search')
    return guest_id


def usage(used):
    return {'authenticated': False, 'limit': LIMIT, 'used': used, 'remaining': max(0, LIMIT-used)}


def exhausted():
    return HTTPException(429, LIMIT_MESSAGE)
