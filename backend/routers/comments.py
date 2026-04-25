from fastapi import APIRouter, HTTPException, Request
from database import get_conn
from models import CommentCreate, CommentResponse
from rate_limit import limiter, ip_song_key

router = APIRouter(prefix="/api/songs", tags=["comments"])


@router.get("/{song_id}/comments", response_model=list[CommentResponse])
def get_comments(song_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nickname, content, created_at "
                "FROM comments WHERE song_id = %s ORDER BY created_at DESC",
                (song_id,)
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
def add_comment(request: Request, song_id: int, body: CommentCreate):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if not body.nickname or not body.nickname.strip():
                cur.execute("SELECT nextval('anon_comment_seq')")
                seq = cur.fetchone()[0]
                nickname = f"댓글작성자{seq}"
            else:
                nickname = body.nickname.strip()

            cur.execute(
                "INSERT INTO comments (song_id, nickname, content) "
                "VALUES (%s, %s, %s) RETURNING id, created_at",
                (song_id, nickname, body.content)
            )
            row = cur.fetchone()
        conn.commit()

    return CommentResponse(
        id=row[0],
        nickname=nickname,
        content=body.content,
        created_at=row[1],
    )