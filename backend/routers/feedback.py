from fastapi import APIRouter, HTTPException, Request
from database import get_conn
from models import FeedbackCreate
from rate_limit import limiter

router = APIRouter(prefix="/api/songs", tags=["feedback"])

_VALID_TYPES = {"bpm", "combo", "time", "record_delete", "comment_delete"}


@router.post("/{song_id}/feedback", status_code=201)
@limiter.limit("5/minute;20/hour")
def submit_feedback(request: Request, song_id: int, body: FeedbackCreate):
    if body.type not in _VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"잘못된 피드백 유형입니다: {body.type}")
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="내용을 입력해주세요")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO feedback (song_id, anon_id, type, body) VALUES (%s, %s, %s, %s)",
                (song_id, body.anon_id, body.type, body.body.strip())
            )
        conn.commit()
    return {"ok": True}
