"""체감 난이도 투표.

IP 등 사용자 개인정보를 수집하지 않고, 비회원 투표 참여를 유도하기 위해 rate limit으로만 어뷰징 방어함.

식별 정책:
  - 로그인 사용자: user_id로 식별. anon_id가 와도 본인 식별자로 신뢰하지 않음.
    → 타인이 anon_id를 알아도 본인 투표를 변조/삭제할 수 없음.
  - 비회원: anon_id로 식별 (기존 정책 유지).
  - 마이그레이션: 로그인 사용자가 첫 POST/PUT/DELETE 시점에 body.anon_id로
    과거 익명 투표 행이 있으면 user_id 행으로 자동 승계.
"""
from fastapi import APIRouter, HTTPException, Request
from auth import get_current_user_id
from database import get_conn
from models import PerceivedCreate, PerceivedUpdate, PerceivedDelete, PerceivedStats
from rate_limit import limiter, ip_song_key
from routers.perceived_sync import mirror_perceived_delete, mirror_perceived_vote
from routers.songs import ensure_active_song

router = APIRouter(prefix="/api/songs", tags=["perceived"])

_BINS = 24  # 0.5 ~ 12.0, step 0.5


def _level_to_bin(level: float) -> int:
    return max(0, min(_BINS - 1, round((level - 0.5) * 2)))


@router.get("/{song_id}/perceived/stats", response_model=PerceivedStats)
def get_perceived_stats(request: Request, song_id: int, anon_id: str = ""):
    uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute(
                "SELECT level FROM perceived_difficulty WHERE song_id = %s",
                (song_id,)
            )
            votes = [float(r[0]) for r in cur.fetchall()]

            my_vote = None
            if uid is not None:
                cur.execute(
                    "SELECT level, opinion FROM perceived_difficulty "
                    "WHERE song_id = %s AND user_id = %s",
                    (song_id, uid)
                )
                row = cur.fetchone()
                if row:
                    my_vote = {"level": float(row[0]), "opinion": row[1]}
            elif anon_id:
                cur.execute(
                    "SELECT level, opinion FROM perceived_difficulty "
                    "WHERE song_id = %s AND anon_id = %s AND user_id IS NULL",
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
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    "SELECT id FROM perceived_difficulty WHERE song_id = %s AND user_id = %s",
                    (song_id, uid)
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="이미 투표했습니다. 수정은 PUT을 사용해주세요"
                    )
                migrated = False
                if body.anon_id:
                    cur.execute(
                        "UPDATE perceived_difficulty "
                        "SET user_id = %s, anon_id = NULL, level = %s, opinion = %s, updated_at = NOW() "
                        "WHERE song_id = %s AND anon_id = %s AND user_id IS NULL",
                        (uid, body.level, body.opinion, song_id, body.anon_id)
                    )
                    migrated = cur.rowcount > 0
                if not migrated:
                    cur.execute(
                        "INSERT INTO perceived_difficulty (song_id, user_id, level, opinion) "
                        "VALUES (%s, %s, %s, %s)",
                        (song_id, uid, body.level, body.opinion)
                    )
                mirror_perceived_vote(cur, "kr", song_id, uid, body.anon_id, body.level, body.opinion)
            else:
                cur.execute(
                    "SELECT id FROM perceived_difficulty "
                    "WHERE song_id = %s AND anon_id = %s AND user_id IS NULL",
                    (song_id, body.anon_id)
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="이미 투표했습니다. 수정은 PUT을 사용해주세요"
                    )
                cur.execute(
                    "INSERT INTO perceived_difficulty (song_id, anon_id, level, opinion) "
                    "VALUES (%s, %s, %s, %s)",
                    (song_id, body.anon_id, body.level, body.opinion)
                )
                mirror_perceived_vote(cur, "kr", song_id, None, body.anon_id, body.level, body.opinion)
        conn.commit()
    return {"ok": True}


@router.put("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def update_perceived(request: Request, song_id: int, body: PerceivedUpdate):
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    "UPDATE perceived_difficulty "
                    "SET level=%s, opinion=%s, updated_at=NOW() "
                    "WHERE song_id=%s AND user_id=%s",
                    (body.level, body.opinion, song_id, uid)
                )
                affected = cur.rowcount
                if affected == 0 and body.anon_id:
                    cur.execute(
                        "UPDATE perceived_difficulty "
                        "SET user_id=%s, anon_id=NULL, level=%s, opinion=%s, updated_at=NOW() "
                        "WHERE song_id=%s AND anon_id=%s AND user_id IS NULL",
                        (uid, body.level, body.opinion, song_id, body.anon_id)
                    )
                    affected = cur.rowcount
                if affected == 0:
                    raise HTTPException(
                        status_code=404,
                        detail="투표 내역이 없습니다. 등록은 POST를 사용해주세요"
                    )
                mirror_perceived_vote(cur, "kr", song_id, uid, body.anon_id, body.level, body.opinion)
            else:
                cur.execute(
                    "UPDATE perceived_difficulty SET level=%s, opinion=%s, updated_at=NOW() "
                    "WHERE song_id=%s AND anon_id=%s AND user_id IS NULL",
                    (body.level, body.opinion, song_id, body.anon_id)
                )
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=404,
                        detail="투표 내역이 없습니다. 등록은 POST를 사용해주세요"
                    )
                mirror_perceived_vote(cur, "kr", song_id, None, body.anon_id, body.level, body.opinion)
        conn.commit()
    return {"ok": True}


@router.delete("/{song_id}/perceived")
@limiter.limit("10/hour", key_func=ip_song_key)
def delete_perceived(request: Request, song_id: int, body: PerceivedDelete):
    uid = get_current_user_id(request)
    if uid is None and not body.anon_id:
        raise HTTPException(status_code=422, detail="식별자가 없습니다")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            if uid is not None:
                cur.execute(
                    "DELETE FROM perceived_difficulty WHERE song_id=%s AND user_id=%s",
                    (song_id, uid)
                )
                total = cur.rowcount
                if body.anon_id:
                    cur.execute(
                        "DELETE FROM perceived_difficulty "
                        "WHERE song_id=%s AND anon_id=%s AND user_id IS NULL",
                        (song_id, body.anon_id)
                    )
                    total += cur.rowcount
                if total == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다")
                mirror_perceived_delete(cur, "kr", song_id, uid, body.anon_id)
            else:
                cur.execute(
                    "DELETE FROM perceived_difficulty "
                    "WHERE song_id=%s AND anon_id=%s AND user_id IS NULL",
                    (song_id, body.anon_id)
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="투표 내역이 없습니다")
                mirror_perceived_delete(cur, "kr", song_id, None, body.anon_id)
        conn.commit()
    return {"ok": True}
