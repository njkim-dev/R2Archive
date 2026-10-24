from slowapi import Limiter
from starlette.requests import Request

from auth import get_current_user_id

import os
import re
from ipaddress import ip_address, ip_network


_TRUSTED_PROXIES = tuple(
    ip_network(value, strict=False)
    for value in re.split(r"[\s,]+", os.environ.get("TRUSTED_PROXY_CIDRS", "127.0.0.1/32 ::1/128").strip())
    if value
)


def _client_ip(request: Request) -> str:
    peer = request.client.host if request.client else ""
    try:
        address = ip_address(peer)
    except ValueError:
        return peer or "unknown"
    if any(address in network for network in _TRUSTED_PROXIES):
        forwarded = request.headers.get("x-forwarded-for", "").strip()
        if forwarded and "," not in forwarded:
            try:
                return str(ip_address(forwarded))
            except ValueError:
                pass
    return str(address)


def ip_key(request: Request) -> str:
    return _client_ip(request)


def ip_song_key(request: Request) -> str:
    """IP + song_id 조합. 같은 IP라도 다른 곡에는 독립 한도."""
    song_id = request.path_params.get("song_id", "")
    return f"{_client_ip(request)}:{song_id}"


def client_ip(request: Request) -> str:
    return _client_ip(request)


def user_key(request: Request) -> str:
    user_id = get_current_user_id(request)
    if user_id is not None:
        return f"user:{user_id}"
    return f"ip:{_client_ip(request)}"


def user_song_key(request: Request) -> str:
    song_id = request.path_params.get("song_id", "")
    return f"{user_key(request)}:{song_id}"


limiter = Limiter(key_func=_client_ip, default_limits=[])
