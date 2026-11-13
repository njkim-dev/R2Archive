import re
import secrets
import hmac
from contextlib import contextmanager
from ipaddress import ip_address
from threading import Lock

import jwt
from fastapi import HTTPException

from auth import COOKIE_SECURE, SESSION_SECRET
from rate_limit import client_ip


COOKIE = 'r2_shop_image_guest'
LIMIT = 5
LIMIT_MESSAGE = '비로그인 사용자는 이미지 검색이 5회로 제한됩니다'


class IPAllowance:
    def __init__(self, max_entries=65536):
        self._secret = secrets.token_bytes(32)
        self._entries = {}
        self._lock = Lock()
        self._max_entries = max_entries

    def key(self, request):
        value = client_ip(request)
        try:
            address = ip_address(value)
            value = str(getattr(address, 'ipv4_mapped', None) or address)
        except ValueError:
            pass
        # The random key and IP-derived identifiers exist only in this API process.
        return hmac.digest(self._secret, value.encode(), 'sha256')

    def _entry(self, key):
        entry = self._entries.get(key)
        if entry is None:
            if len(self._entries) >= self._max_entries:
                raise HTTPException(503, '비로그인 검색 요청이 많습니다. 로그인 후 이용해주세요.')
            entry = self._entries[key] = [0, 0]
        return entry

    def usage(self, key, known_used=0):
        with self._lock:
            entry = self._entries.get(key)
            if entry is None and not known_used:
                return usage(0)
            entry = self._entry(key)
            if not entry[1]:
                entry[0] = max(entry[0], min(LIMIT, known_used))
            return usage(max(known_used, sum(entry)))

    @contextmanager
    def reserve(self, key):
        with self._lock:
            entry = self._entry(key)
            if sum(entry) >= LIMIT:
                raise exhausted()
            entry[1] += 1
        completed = False
        try:
            yield
            completed = True
        finally:
            with self._lock:
                entry[1] -= 1
                if completed:
                    entry[0] += 1
                if not sum(entry):
                    self._entries.pop(key, None)


ip_allowance = IPAllowance()


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
