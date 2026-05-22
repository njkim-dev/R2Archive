"""과거 피망곡 전용 유저 데이터 API.
본 게임의 comments / records / user_favorites와 동일한 정책으로 pmang_* 테이블에 매핑.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import fetch_user, get_current_user_id, require_user_id
from database import get_conn
from rate_limit import ip_song_key, limiter
from routers.records import _extract_video_id, _fetch_youtube_title

router = APIRouter(prefix="/api", tags=["pmang_user"])


class PmangCommentCreate(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=30)
    content: str = Field(min_length=1, max_length=1000)


class PmangCommentResponse(BaseModel):
    id: int
    nickname: str
    content: str
    created_at: str  # ISO


class PmangRecordCreate(BaseModel):
    anon_id: Optional[str] = Field(default=None, max_length=64)
    nickname: str = Field(min_length=1, max_length=30)
    youtube_url: Optional[str] = Field(default=None, max_length=300)
    memo: Optional[str] = Field(default=None, max_length=500)


class PmangRecordResponse(BaseModel):
    id: int
    nickname: str
    youtube_url: Optional[str]
    youtube_title: Optional[str]
    memo: Optional[str]
    is_mine: bool
    created_at: str


@router.get("/pmang-songs/{song_id}/comments", response_model=list[PmangCommentResponse])
def get_pmang_comments(song_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT c.id, COALESCE(u.nickname, c.nickname), c.content, c.created_at "
                "FROM pmang_comments c LEFT JOIN users u ON u.id = c.user_id "
                "WHERE c.song_id = %s "
                "ORDER BY c.created_at DESC",
                (song_id,),
            )
            rows = cur.fetchall()
    return [
        PmangCommentResponse(
            id=r[0], nickname=r[1] or "", content=r[2],
            created_at=r[3].isoformat() if r[3] else "",
        )
        for r in rows
    ]


@router.post("/pmang-songs/{song_id}/comments", response_model=PmangCommentResponse, status_code=201)
@limiter.limit("5/minute;20/hour", key_func=ip_song_key)
def add_pmang_comment(request: Request, song_id: int, body: PmangCommentCreate):
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pmang_songs WHERE id = %s", (song_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="곡을 찾을 수 없습니다")

            if current_uid is not None:
                user_row = fetch_user(current_uid)
                nickname = (user_row.get("nickname") or "").strip() if user_row else ""
                if not nickname:
                    raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")
            elif not body.nickname or not body.nickname.strip():
                cur.execute("SELECT nextval('anon_comment_seq')")
                seq = cur.fetchone()[0]
                nickname = f"댓글작성자{seq}"
            else:
                nickname = body.nickname.strip()

            cur.execute(
                "INSERT INTO pmang_comments (song_id, nickname, content, user_id) "
                "VALUES (%s, %s, %s, %s) RETURNING id, created_at",
                (song_id, nickname, body.content, current_uid),
            )
            row = cur.fetchone()
        conn.commit()
    return PmangCommentResponse(
        id=row[0], nickname=nickname, content=body.content,
        created_at=row[1].isoformat(),
    )


@router.get("/pmang-songs/{song_id}/records", response_model=list[PmangRecordResponse])
def get_pmang_records(request: Request, song_id: int):
    """플레이 영상 목록. 비공개(visibility='private') 본인 외에는 제외.
    pmang 곡의 'records' 탭은 youtube_url 있는 항목 = 플레이 영상.
    """
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, COALESCE(u.nickname, r.nickname), r.youtube_url, r.youtube_title,
                       r.memo, r.created_at, r.user_id, r.visibility, r.memo_public
                FROM pmang_achievements r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.song_id = %s
                  AND r.youtube_url IS NOT NULL
                  AND (r.visibility <> 'private' OR r.user_id = %s)
                ORDER BY r.created_at DESC
                """,
                (song_id, current_uid),
            )
            rows = cur.fetchall()
    result = []
    for r in rows:
        is_mine = (current_uid is not None and r[6] is not None
                   and int(r[6]) == int(current_uid))
        visibility = r[7] or "public"
        memo_public = bool(r[8])
        # 익명 설정인 경우 닉네임 마스킹, 메모 비공개면 본인만 노출
        nickname = "익명" if (visibility == "anonymous" and not is_mine) else (r[1] or "")
        memo = r[4] if (memo_public or is_mine) else None
        result.append(PmangRecordResponse(
            id=r[0], nickname=nickname, youtube_url=r[2], youtube_title=r[3],
            memo=memo, is_mine=is_mine,
            created_at=r[5].isoformat() if r[5] else "",
        ))
    return result


@router.post("/pmang-songs/{song_id}/records", response_model=PmangRecordResponse, status_code=201)
@limiter.limit("20/hour", key_func=ip_song_key)
async def add_pmang_record(request: Request, song_id: int, body: PmangRecordCreate):
    nickname = (body.nickname or "").strip()
    current_uid = get_current_user_id(request)
    user_row = fetch_user(current_uid) if current_uid is not None else None
    if not nickname and user_row and user_row.get("nickname"):
        nickname = user_row["nickname"]
    if not nickname:
        raise HTTPException(status_code=422, detail="닉네임을 입력해주세요")

    if not body.youtube_url:
        raise HTTPException(status_code=422, detail="YouTube 영상 URL은 필수입니다")
    if not _extract_video_id(body.youtube_url):
        raise HTTPException(
            status_code=422,
            detail="YouTube 주소 형식이 올바르지 않습니다 (https://youtu.be/<id> 또는 https://www.youtube.com/watch?v=<id>)",
        )
    youtube_title = await _fetch_youtube_title(body.youtube_url)
    if youtube_title is None:
        raise HTTPException(status_code=422, detail="비공개 영상은 등록할 수 없습니다.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pmang_songs WHERE id = %s", (song_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="곡을 찾을 수 없습니다")

            cur.execute(
                """
                INSERT INTO pmang_achievements
                    (song_id, user_id, anon_id, nickname, youtube_url, youtube_title, memo,
                     memo_public, visibility, is_play_video)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (
                    song_id, current_uid, body.anon_id, nickname,
                    body.youtube_url, youtube_title, body.memo,
                    True, "public", True,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return PmangRecordResponse(
        id=row[0], nickname=nickname,
        youtube_url=body.youtube_url, youtube_title=youtube_title,
        memo=body.memo, is_mine=current_uid is not None,
        created_at=row[1].isoformat(),
    )


@router.get("/users/me/pmang-favorites")
def get_my_pmang_favorites(request: Request):
    """비로그인 시 빈 배열."""
    try:
        uid = require_user_id(request)
    except HTTPException:
        return {"favorites": []}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT song_id FROM pmang_favorites WHERE user_id = %s",
                (uid,),
            )
            favorites = [r[0] for r in cur.fetchall()]
    return {"favorites": favorites}


@router.post("/users/me/pmang-favorites/{song_id}", status_code=201)
def add_pmang_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pmang_songs WHERE id = %s", (song_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="곡을 찾을 수 없습니다")
            cur.execute(
                "INSERT INTO pmang_favorites (user_id, song_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}


@router.delete("/users/me/pmang-favorites/{song_id}")
def remove_pmang_favorite(request: Request, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM pmang_favorites WHERE user_id = %s AND song_id = %s",
                (uid, song_id),
            )
        conn.commit()
    return {"ok": True}
