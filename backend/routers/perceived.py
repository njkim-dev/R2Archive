"""체감 난이도 투표.

IP 등 사용자 개인정보를 수집하지 않고, 비회원 투표 참여를 유도하기 위해 rate limit으로만 어뷰징 방어함
"""
from fastapi import APIRouter, HTTPException, Request
from database import get_conn
from models import PerceivedCreate, PerceivedUpdate, PerceivedDelete, PerceivedStats
from rate_limit import limiter, ip_song_key

router = APIRouter(prefix="/api/songs", tags=["perceived"])

_BINS = 24  # 0.5 ~ 12.0, step 0.5


def _level_to_bin(level: float) -> int:
    return max(0, min(_BINS - 1, round((level - 0.5) * 2)))


@router.get("/{song_id}/perceived/stats", response_model=PerceivedStats)
def get_perceived_stats(song_id: int, anon_id: str = ""):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT level FROM perceived_difficulty WHERE song_id = %s",
                (song_id,)
            )
            votes = [float(r[0]) for r in cur.fetchall()]

            my_vote = None
            if anon_id:
                cur.execute(
                    "SELECT level, opinion FROM perceived_difficulty "
                    "WHERE song_id = %s AND anon_id = %s",
                    (song_id, anon_id)
                )
                row = cur.fetchone()
                if row:
                    my_vote = {"level": float(row[0]), "opinion": row[1]}

    bins = [0] * _BINS
    for v in votes:
        bins[_level_to_bin(v)] += 1

    avg = round(sum(votes) / len(votes), 2) if votes else None
    return PerceivedStats(avg=avg, total_votes=len(votes), bins=bins, my_vote=my_vote)


@router.post("/{song_id}/perceived", status_code=201)
@limiter.limit("10/hour", key_func=ip_song_key)
def submit_perceived(request: Request, song_id: int, body: PerceivedCreate):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM perceived_difficulty WHERE song_id = %s AND anon_id = %s",
                (song_id, body.anon_id)
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="이미 투표했습니다. 수정은 PUT을 사용해주세요")
            cur.execute(
                "INSERT INTO perceived_difficulty (song_id, anon_id, level, opinion) "
                "VALUES (%s, %s, %s, %s)",
                (song_id, body.anon_id, body.level, body.opinion)
            )
        conn.commit()
    return {"ok": True}


@router.put("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def update_perceived(request: Request, song_id: int, body: PerceivedUpdate):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE perceived_difficulty SET level=%s, opinion=%s, updated_at=NOW() "
                "WHERE song_id=%s AND anon_id=%s",
                (body.level, body.opinion, song_id, body.anon_id)
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="투표 내역이 없습니다. 등록은 POST를 사용해주세요")
        conn.commit()
    return {"ok": True}


@router.delete("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def delete_perceived(request: Request, song_id: int, body: PerceivedDelete):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM perceived_difficulty WHERE song_id=%s AND anon_id=%s",
                (song_id, body.anon_id)
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="투표 내역이 없습니다")
        conn.commit()
    return {"ok": True}
