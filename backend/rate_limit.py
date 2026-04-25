from slowapi import Limiter
from starlette.requests import Request

# 같은 호스트의 Caddy만 신뢰. 다른 컨테이너/외부에서 온 요청의 XFF는 무시한다.
_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def _client_ip(request: Request) -> str:
    peer = request.client.host if request.client else ""
    if peer in _TRUSTED_PROXIES:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return peer or "unknown"


def ip_key(request: Request) -> str:
    return _client_ip(request)


def ip_song_key(request: Request) -> str:
    """IP + song_id 조합. 같은 IP라도 다른 곡에는 독립 한도."""
    song_id = request.path_params.get("song_id", "")
    return f"{_client_ip(request)}:{song_id}"


limiter = Limiter(key_func=_client_ip, default_limits=[])
