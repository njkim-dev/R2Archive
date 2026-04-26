import os
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import httpx
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from auth import fetch_user, get_current_user_id, require_user_id
from database import get_conn
from models import RecordCreate, RecordResponse
from rate_limit import limiter, ip_song_key

_YT_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{11}$')
_ALLOWED_IMG_EXT = {"png", "jpg", "jpeg", "webp"}
_ALLOWED_IMG_FORMATS = {"PNG", "JPEG", "WEBP"}  # Pillow가 보고하는 format 명
_MAX_IMG_DIMENSION = 4000  # 메모리 폭탄 방지 — 가로/세로 각각 4000px 한도
_SCREENSHOTS_DIR = Path(__file__).resolve().parent.parent.parent / "record_screenshots"
_SCREENSHOTS_DIR.mkdir(exist_ok=True)

router = APIRouter(prefix="/api", tags=["records"])


def _extract_video_id(url: str) -> str | None:
    try:
        u = urlparse(url)
    except Exception:
        return None
    if u.scheme != 'https':
        return None
    if u.hostname == 'youtu.be':
        vid = u.path.lstrip('/').split('/', 1)[0]
    elif u.hostname in ('www.youtube.com', 'youtube.com', 'm.youtube.com'):
        if u.path != '/watch':
            return None
        vid = parse_qs(u.query).get('v', [''])[0]
    else:
        return None
    return vid if _YT_ID_PATTERN.match(vid) else None


async def _fetch_youtube_title(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
        if r.status_code != 200:
            return None
        title = r.json().get("title")
        if not isinstance(title, str):
            return None
        return title.strip()[:200] or None
    except Exception:
        return None


def _mask_nickname(nickname: str, visibility: str, is_mine: bool) -> str:
    if visibility == "anonymous" and not is_mine:
        return "익명"
    return nickname or ""


def _row_to_response(r: tuple, current_uid: int | None) -> RecordResponse:
    (rid, nickname, score, judgment_percent, combo, youtube_url,
     youtube_title, memo, visibility, created_at, row_user_id,
     screenshot_path, owner_show, memo_public) = (*r, None, False, False)[:14]

    is_mine = (current_uid is not None
               and row_user_id is not None
               and int(row_user_id) == int(current_uid))
    # 실제 파일 서빙은 /api/records/{id}/screenshot 에서 권한 검사.
    screenshot_url = (
        f"/api/records/{rid}/screenshot"
        if screenshot_path and (owner_show or is_mine)
        else None
    )
    # memo_public=true 이거나 본인 기록일 때만 노출.
    visible_memo = memo if (memo_public or is_mine) else None
    return RecordResponse(
        id=rid,
        nickname=_mask_nickname(nickname or "", visibility or "public", is_mine),
        score=score,
        judgment_percent=float(judgment_percent) if judgment_percent is not None else None,
        combo=combo,
        youtube_url=youtube_url,
        youtube_title=youtube_title,
        memo=visible_memo,
        memo_public=bool(memo_public),
        visibility=visibility or "public",
        is_mine=is_mine,
        screenshot_url=screenshot_url,
        owner_show_screenshot=bool(owner_show),
        created_at=created_at,
    )


@router.get("/songs/{song_id}/records", response_model=list[RecordResponse])
def get_records(request: Request, song_id: int):
    """기존 성과 등록 탭용. YouTube URL/메모 기반 기록만 반환.
    스크린샷 기반 판정% 기록(judgment_percent IS NOT NULL)은 '랭킹' 탭 전용이므로 제외한다.
    visibility=private은 본인 것이 아니면 숨긴다.
    로그인 유저의 닉네임은 users.nickname 최신값으로 치환.
    """
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, COALESCE(u.nickname, r.nickname) AS nickname,
                       r.score, r.judgment_percent, r.combo, r.youtube_url,
                       r.youtube_title, r.memo, r.visibility, r.created_at, r.user_id,
                       r.screenshot_path, COALESCE(u.show_screenshot, FALSE), r.memo_public
                FROM records r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.song_id = %s
                  AND r.judgment_percent IS NULL
                  AND (r.visibility <> 'private' OR r.user_id = %s)
                ORDER BY r.score DESC NULLS LAST, r.created_at ASC
                """,
                (song_id, current_uid),
            )
            rows = cur.fetchall()
    return [_row_to_response(r, current_uid) for r in rows]


@router.get("/songs/{song_id}/ranking", response_model=list[RecordResponse])
def get_ranking(request: Request, song_id: int, limit: int = 10):
    """판정 랭킹 TOP N. 유저별 최고 judgment_percent 1건, 비공개는 미표시.
    로그인 유저의 닉네임은 users.nickname 최신값으로 치환.
    """
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, nickname, score, judgment_percent, combo, youtube_url,
                       youtube_title, memo, visibility, created_at, user_id,
                       screenshot_path, owner_show_screenshot, memo_public
                FROM (
                    SELECT r.id, COALESCE(u.nickname, r.nickname) AS nickname,
                           r.score, r.judgment_percent, r.combo, r.youtube_url,
                           r.youtube_title, r.memo, r.visibility, r.created_at,
                           r.user_id, r.anon_id,
                           r.screenshot_path,
                           COALESCE(u.show_screenshot, FALSE) AS owner_show_screenshot,
                           r.memo_public,
                           ROW_NUMBER() OVER (
                               PARTITION BY COALESCE(r.user_id::text, 'anon:' || r.anon_id)
                               ORDER BY r.judgment_percent DESC NULLS LAST, r.created_at ASC
                           ) AS rn
                    FROM records r
                    LEFT JOIN users u ON u.id = r.user_id
                    WHERE r.song_id = %s
                      AND r.judgment_percent IS NOT NULL
                      AND r.visibility IN ('public', 'anonymous')
                ) t
                WHERE rn = 1
                ORDER BY judgment_percent DESC NULLS LAST, created_at ASC
                LIMIT %s
                """,
                (song_id, limit),
            )
            rows = cur.fetchall()
    return [_row_to_response(r, current_uid) for r in rows]


@router.get("/songs/{song_id}/records/me", response_model=list[RecordResponse])
def get_my_records_for_song(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, COALESCE(u.nickname, r.nickname) AS nickname,
                       r.score, r.judgment_percent, r.combo, r.youtube_url,
                       r.youtube_title, r.memo, r.visibility, r.created_at, r.user_id,
                       r.screenshot_path, COALESCE(u.show_screenshot, FALSE), r.memo_public
                FROM records r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.song_id = %s AND r.user_id = %s
                ORDER BY r.created_at DESC
                """,
                (song_id, uid),
            )
            rows = cur.fetchall()
    return [_row_to_response(r, uid) for r in rows]


@router.post("/songs/{song_id}/records", response_model=RecordResponse, status_code=201)
@limiter.limit("20/hour", key_func=ip_song_key)
async def add_record(request: Request, song_id: int, body: RecordCreate):
    nickname = (body.nickname or "").strip()
    current_uid = get_current_user_id(request)

    # 로그인 유저가 닉네임을 Null로 보낸 경우 프로필 닉네임으로 대체
    user_row = fetch_user(current_uid) if current_uid is not None else None
    if not nickname and user_row and user_row.get("nickname"):
        nickname = user_row["nickname"]
    if not nickname:
        raise HTTPException(status_code=422, detail="닉네임을 입력해주세요")

    visibility = body.visibility or (user_row.get("default_visibility") if user_row else "public")

    youtube_title: str | None = None
    if body.youtube_url:
        if not _extract_video_id(body.youtube_url):
            raise HTTPException(
                status_code=422,
                detail="YouTube 주소 형식이 올바르지 않습니다 (https://youtu.be/<id> 또는 https://www.youtube.com/watch?v=<id>)",
            )
        youtube_title = await _fetch_youtube_title(body.youtube_url)

    with get_conn() as conn:
        with conn.cursor() as cur:
            if body.combo is not None:
                cur.execute("SELECT combo FROM songs WHERE id = %s", (song_id,))
                row = cur.fetchone()
                if row and body.combo > row[0]:
                    raise HTTPException(status_code=422, detail="콤보가 곡의 최대값을 초과합니다")

            cur.execute(
                """
                INSERT INTO records
                    (song_id, user_id, anon_id, nickname, score, judgment_percent,
                     combo, youtube_url, youtube_title, memo, memo_public, visibility)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (
                    song_id, current_uid, body.anon_id, nickname,
                    body.score, body.judgment_percent, body.combo,
                    body.youtube_url, youtube_title, body.memo, body.memo_public, visibility,
                ),
            )
            r = cur.fetchone()
        conn.commit()

    return RecordResponse(
        id=r[0],
        nickname=nickname,
        score=body.score,
        judgment_percent=body.judgment_percent,
        combo=body.combo,
        youtube_url=body.youtube_url,
        youtube_title=youtube_title,
        memo=body.memo,
        memo_public=body.memo_public,
        visibility=visibility,
        is_mine=current_uid is not None,
        created_at=r[1],
    )


@router.post("/records/{record_id}/screenshot")
@limiter.limit("30/hour")
async def upload_record_screenshot(
    request: Request,
    record_id: int,
    image: UploadFile = File(...),
):
    """기록에 스크린샷 첨부. 본인 기록만 가능. 파일은 record_screenshots/ 에 저장."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM records WHERE id = %s", (record_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다")
            if row[0] is None or int(row[0]) != int(uid):
                raise HTTPException(status_code=403, detail="본인의 기록만 수정할 수 있습니다")

    original_name = image.filename or "upload"
    ext = Path(original_name).suffix.lower().lstrip(".")
    if ext not in _ALLOWED_IMG_EXT:
        raise HTTPException(status_code=422, detail=f"지원하지 않는 이미지 형식입니다: {ext}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM records "
                "WHERE user_id = %s AND screenshot_filename = %s AND id <> %s LIMIT 1",
                (uid, original_name, record_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"이미 등록한 스크린샷입니다: {original_name}",
                )

    content = await image.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="파일 용량이 너무 큽니다 (최대 10MB)")

    # 매직바이트 검증 — 확장자만 믿지 않고 실제 이미지인지 확인.
    # verify()는 픽셀 디코드를 하지 않아 메모리/CPU 부담이 작음.
    from io import BytesIO
    from PIL import Image
    try:
        with Image.open(BytesIO(content)) as im:
            img_format = im.format
            width, height = im.size
            im.verify()
    except Exception:
        raise HTTPException(status_code=422, detail="유효하지 않은 이미지 파일입니다")
    if img_format not in _ALLOWED_IMG_FORMATS:
        raise HTTPException(status_code=422, detail=f"지원하지 않는 이미지 형식입니다: {img_format}")
    if width > _MAX_IMG_DIMENSION or height > _MAX_IMG_DIMENSION:
        raise HTTPException(
            status_code=422,
            detail=f"이미지 크기가 너무 큽니다 (최대 {_MAX_IMG_DIMENSION}x{_MAX_IMG_DIMENSION})",
        )

    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = _SCREENSHOTS_DIR / filename
    with open(filepath, "wb") as f:
        f.write(content)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 기존 파일 교체 시 이전 파일 삭제
            cur.execute("SELECT screenshot_path FROM records WHERE id = %s", (record_id,))
            prev = cur.fetchone()
            prev_path = prev[0] if prev else None
            cur.execute(
                "UPDATE records SET screenshot_path = %s, screenshot_filename = %s "
                "WHERE id = %s",
                (filename, original_name, record_id),
            )
        conn.commit()
    if prev_path:
        try:
            (_SCREENSHOTS_DIR / prev_path).unlink(missing_ok=True)
        except Exception:
            pass

    return {"ok": True, "screenshot_path": filename}


@router.get("/records/{record_id}/screenshot")
def get_record_screenshot(request: Request, record_id: int):
    """기록 스크린샷을 권한 검사 후 직접 서빙.
    본인이거나, 소유자가 show_screenshot=TRUE 설정하면서, visibility가 'private' 가 아닐 때만 허용.
    """
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.user_id, r.screenshot_path, r.visibility, "
                "       COALESCE(u.show_screenshot, FALSE) "
                "FROM records r LEFT JOIN users u ON u.id = r.user_id "
                "WHERE r.id = %s",
                (record_id,),
            )
            row = cur.fetchone()
    if not row or not row[1]:
        raise HTTPException(status_code=404, detail="스크린샷을 찾을 수 없습니다")
    owner_uid, path, visibility, owner_show = row
    is_mine = (current_uid is not None and owner_uid is not None
               and int(owner_uid) == int(current_uid))
    if not is_mine:
        if (visibility or "public") == "private":
            raise HTTPException(status_code=404, detail="스크린샷을 찾을 수 없습니다")
        if not owner_show:
            raise HTTPException(status_code=403, detail="공유되지 않은 스크린샷입니다")

    safe_name = Path(path).name
    file_path = (_SCREENSHOTS_DIR / safe_name).resolve()
    if not str(file_path).startswith(str(_SCREENSHOTS_DIR.resolve())):
        raise HTTPException(status_code=404, detail="스크린샷을 찾을 수 없습니다")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="스크린샷 파일이 존재하지 않습니다")
    # 캐시는 same-user 단위로만. 권한이 바뀌면(공유 OFF) 캐시가 남아 있어도
    # 새 요청은 위 권한 검사로 차단됨. 다만 즉시 반영을 위해 짧은 max-age 사용.
    return FileResponse(
        str(file_path),
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/users/me/screenshot-filenames")
def my_screenshot_filenames(request: Request):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT screenshot_filename FROM records "
                "WHERE user_id = %s AND screenshot_filename IS NOT NULL",
                (uid,),
            )
            rows = cur.fetchall()
    return {"filenames": [r[0] for r in rows if r[0]]}
