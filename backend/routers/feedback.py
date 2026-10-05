from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from database import get_conn
from discord_notifications import build_song_feedback_notification, send_discord_notification
from models import FeedbackCreate
from rate_limit import limiter
from routers.songs import ensure_active_song

router = APIRouter(prefix="/api/songs", tags=["feedback"])

_VALID_TYPES = {"bpm", "combo", "time", "record_delete", "comment_delete"}


@router.post("/{song_id}/feedback", status_code=201)
@limiter.limit("5/minute;20/hour")
def submit_feedback(request: Request, song_id: int, body: FeedbackCreate, background_tasks: BackgroundTasks):
    if body.type not in _VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"잘못된 피드백 유형입니다: {body.type}")
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="내용을 입력해주세요")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute("SELECT name, artist, level FROM songs WHERE id = %s", (song_id,))
            song_name, artist, level = cur.fetchone()
            cur.execute(
                "INSERT INTO feedback (song_id, anon_id, type, body) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (song_id, body.anon_id, body.type, body.body.strip())
            )
            feedback_id = cur.fetchone()[0]
        conn.commit()
    background_tasks.add_task(
        send_discord_notification,
        build_song_feedback_notification(
            feedback_id=feedback_id,
            song_id=song_id,
            song_name=song_name,
            artist=artist,
            level=float(level) if level is not None else None,
            type_=body.type,
            body=body.body,
        ),
    )
    return {"ok": True}
