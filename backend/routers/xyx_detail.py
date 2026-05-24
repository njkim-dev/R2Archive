from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import fetch_user, get_current_user_id
from database import get_conn
from models import CommentCreate, CommentResponse, PerceivedCreate, PerceivedDelete, PerceivedStats, PerceivedUpdate
from rate_limit import limiter, ip_song_key
from routers.perceived_sync import mirror_perceived_delete, mirror_perceived_vote
from routers.records import _extract_video_id, _fetch_youtube_title

router = APIRouter(prefix="/api/xyx/songs", tags=["xyx-detail"])

_BINS = 24


def _level_to_bin(level: float) -> int:
    return max(0, min(_BINS - 1, round((level - 0.5) * 2)))


def _ensure_song(cur, song_id: int) -> None:
    cur.execute("SELECT 1 FROM xyx_songs WHERE id = %s", (song_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Song not found")


@router.get("/{song_id}/comments", response_model=list[CommentResponse])
def get_xyx_comments(song_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            cur.execute(
                """
                SELECT id, nickname, content, created_at
                FROM xyx_comments
                WHERE song_id = %s
                ORDER BY created_at DESC
                """,
                (song_id,),
            )
            rows = cur.fetchall()

    return [
        CommentResponse(
            id=r[0],
            nickname=r[1],
            content=r[2],
            created_at=r[3],
        )
        for r in rows
    ]


@router.post("/{song_id}/comments", response_model=CommentResponse, status_code=201)
@limiter.limit("5/minute;20/hour", key_func=ip_song_key)
def add_xyx_comment(request: Request, song_id: int, body: CommentCreate):
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            if current_uid is not None:
                user_row = fetch_user(current_uid)
                nickname = (user_row.get("nickname") or "").strip() if user_row else ""
                if not nickname:
                    raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")
            elif not body.nickname or not body.nickname.strip():
                cur.execute("SELECT nextval('xyx_anon_comment_seq')")
                seq = cur.fetchone()[0]
                nickname = f"댓글작성자 {seq}"
            else:
                nickname = body.nickname.strip()

            cur.execute(
                """
                INSERT INTO xyx_comments (song_id, nickname, content, user_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (song_id, nickname, body.content, current_uid),
            )
            row = cur.fetchone()
        conn.commit()

    return CommentResponse(
        id=row[0],
        nickname=nickname,
        content=body.content,
        created_at=row[1],
    )


@router.get("/{song_id}/perceived/stats", response_model=PerceivedStats)
def get_xyx_perceived_stats(request: Request, song_id: int, anon_id: str = ""):
    uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            cur.execute(
                "SELECT level FROM xyx_perceived_difficulty WHERE song_id = %s",
                (song_id,),
            )
            votes = [float(r[0]) for r in cur.fetchall()]

            my_vote = None
            if uid is not None:
                cur.execute(
                    """
                    SELECT level, opinion
                    FROM xyx_perceived_difficulty
                    WHERE song_id = %s AND user_id = %s
                    """,
                    (song_id, uid),
                )
                row = cur.fetchone()
                if row:
                    my_vote = {"level": float(row[0]), "opinion": row[1]}
            elif anon_id:
                cur.execute(
                    """
                    SELECT level, opinion
                    FROM xyx_perceived_difficulty
                    WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                    """,
                    (song_id, anon_id),
                )
                row = cur.fetchone()
                if row:
                    my_vote = {"level": float(row[0]), "opinion": row[1]}

    bins = [0] * _BINS
    for vote in votes:
        bins[_level_to_bin(vote)] += 1

    avg = round(sum(votes) / len(votes), 2) if votes else None
    return PerceivedStats(avg=avg, total_votes=len(votes), bins=bins, my_vote=my_vote)


@router.post("/{song_id}/perceived", status_code=201)
@limiter.limit("10/hour", key_func=ip_song_key)
def submit_xyx_perceived(request: Request, song_id: int, body: PerceivedCreate):
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    "SELECT id FROM xyx_perceived_difficulty WHERE song_id = %s AND user_id = %s",
                    (song_id, uid),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=409, detail="이미 투표했습니다. 수정은 PUT을 사용해주세요")

                migrated = False
                if body.anon_id:
                    cur.execute(
                        """
                        UPDATE xyx_perceived_difficulty
                        SET user_id = %s, anon_id = NULL, level = %s, opinion = %s, updated_at = NOW()
                        WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                        """,
                        (uid, body.level, body.opinion, song_id, body.anon_id),
                    )
                    migrated = cur.rowcount > 0
                if not migrated:
                    cur.execute(
                        """
                        INSERT INTO xyx_perceived_difficulty (song_id, user_id, level, opinion)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (song_id, uid, body.level, body.opinion),
                    )
                mirror_perceived_vote(cur, "xyx", song_id, uid, body.anon_id, body.level, body.opinion)
            else:
                cur.execute(
                    """
                    SELECT id
                    FROM xyx_perceived_difficulty
                    WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                    """,
                    (song_id, body.anon_id),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=409, detail="이미 투표했습니다. 수정은 PUT을 사용해주세요")
                cur.execute(
                    """
                    INSERT INTO xyx_perceived_difficulty (song_id, anon_id, level, opinion)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (song_id, body.anon_id, body.level, body.opinion),
                )
                mirror_perceived_vote(cur, "xyx", song_id, None, body.anon_id, body.level, body.opinion)
        conn.commit()
    return {"ok": True}


@router.put("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def update_xyx_perceived(request: Request, song_id: int, body: PerceivedUpdate):
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    """
                    UPDATE xyx_perceived_difficulty
                    SET level = %s, opinion = %s, updated_at = NOW()
                    WHERE song_id = %s AND user_id = %s
                    """,
                    (body.level, body.opinion, song_id, uid),
                )
                affected = cur.rowcount
                if affected == 0 and body.anon_id:
                    cur.execute(
                        """
                        UPDATE xyx_perceived_difficulty
                        SET user_id = %s, anon_id = NULL, level = %s, opinion = %s, updated_at = NOW()
                        WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                        """,
                        (uid, body.level, body.opinion, song_id, body.anon_id),
                    )
                    affected = cur.rowcount
                if affected == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다. 등록은 POST를 사용해주세요")
                mirror_perceived_vote(cur, "xyx", song_id, uid, body.anon_id, body.level, body.opinion)
            else:
                cur.execute(
                    """
                    UPDATE xyx_perceived_difficulty
                    SET level = %s, opinion = %s, updated_at = NOW()
                    WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                    """,
                    (body.level, body.opinion, song_id, body.anon_id),
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다. 등록은 POST를 사용해주세요")
                mirror_perceived_vote(cur, "xyx", song_id, None, body.anon_id, body.level, body.opinion)
        conn.commit()
    return {"ok": True}


@router.delete("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def delete_xyx_perceived(request: Request, song_id: int, body: PerceivedDelete):
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    "DELETE FROM xyx_perceived_difficulty WHERE song_id = %s AND user_id = %s",
                    (song_id, uid),
                )
                total = cur.rowcount
                if body.anon_id:
                    cur.execute(
                        """
                        DELETE FROM xyx_perceived_difficulty
                        WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                        """,
                        (song_id, body.anon_id),
                    )
                    total += cur.rowcount
                if total == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다")
                mirror_perceived_delete(cur, "xyx", song_id, uid, body.anon_id)
            else:
                cur.execute(
                    """
                    DELETE FROM xyx_perceived_difficulty
                    WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                    """,
                    (song_id, body.anon_id),
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다")
                mirror_perceived_delete(cur, "xyx", song_id, None, body.anon_id)
        conn.commit()
    return {"ok": True}


class XyxPlayVideoCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=30)
    youtube_url: str = Field(min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)


class XyxPlayVideoResponse(BaseModel):
    id: int
    nickname: str
    youtube_url: str
    youtube_title: Optional[str] = None
    description: Optional[str]
    created_at: str


@router.get("/{song_id}/play-videos", response_model=list[XyxPlayVideoResponse])
def get_xyx_play_videos(song_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            cur.execute(
                """
                SELECT id, nickname, youtube_url, youtube_title, description, created_at
                FROM xyx_play_videos
                WHERE song_id = %s
                ORDER BY created_at DESC NULLS LAST, id DESC
                """,
                (song_id,),
            )
            rows = cur.fetchall()

    return [
        XyxPlayVideoResponse(
            id=r[0],
            nickname=r[1] or "",
            youtube_url=r[2] or "",
            youtube_title=r[3],
            description=r[4],
            created_at=r[5].isoformat() if r[5] else "",
        )
        for r in rows
    ]


@router.post("/{song_id}/play-videos", response_model=XyxPlayVideoResponse, status_code=201)
@limiter.limit("20/hour", key_func=ip_song_key)
async def add_xyx_play_video(request: Request, song_id: int, body: XyxPlayVideoCreate):
    nickname = (body.nickname or "").strip()
    current_uid = get_current_user_id(request)
    user_row = fetch_user(current_uid) if current_uid is not None else None
    if not nickname and user_row and user_row.get("nickname"):
        nickname = user_row["nickname"]
    if not nickname:
        raise HTTPException(status_code=422, detail="닉네임을 입력해주세요")

    if not _extract_video_id(body.youtube_url):
        raise HTTPException(
            status_code=422,
            detail="YouTube 주소 형식이 올바르지 않습니다",
        )

    youtube_title = await _fetch_youtube_title(body.youtube_url)
    if youtube_title is None:
        raise HTTPException(status_code=422, detail="비공개 영상은 등록할 수 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_song(cur, song_id)
            cur.execute(
                """
                INSERT INTO xyx_play_videos
                    (song_id, user_id, nickname, youtube_url, youtube_title, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (song_id, current_uid, nickname, body.youtube_url, youtube_title, body.description),
            )
            row = cur.fetchone()
        conn.commit()

    return XyxPlayVideoResponse(
        id=row[0],
        nickname=nickname,
        youtube_url=body.youtube_url,
        youtube_title=youtube_title,
        description=body.description,
        created_at=row[1].isoformat(),
    )
