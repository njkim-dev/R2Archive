"""앱 전반 피드백 (버그 신고 + 기능 제안).

엔드포인트:
  GET    /api/feedback?tab=bug|feature&status=&q=  목록
  POST   /api/feedback                              생성 (로그인 필수)
  POST   /api/feedback/{id}/vote                    공감 토글 (로그인 필수)
"""
from __future__ import annotations

from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user_id, require_admin, require_user_id, fetch_user
from database import get_conn
from rate_limit import limiter

router = APIRouter(prefix="/api", tags=["feedback"])

_BUG_TYPES = {"data", "record_issue", "ranking", "comment", "ui", "login", "other"}
_FEATURE_TYPES = {"search", "record_stats", "ranking", "community", "record", "ux", "other"}
_SONG_FEEDBACK_TYPES = {"bpm", "combo", "time", "record_delete", "comment_delete"}


class FeedbackCreate(BaseModel):
    tab: str = Field(pattern=r"^(bug|feature)$")
    type: str = Field(min_length=1, max_length=20)
    # 최소 길이는 1자만 — strip 후 빈 값은 라우터에서 422로 차단.
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    severity: Optional[str] = Field(default="med", pattern=r"^(low|med|high)$")
    song_id: Optional[int] = None
    song_title: Optional[str] = Field(default="", max_length=200)


def _validate_type(tab: str, t: str):
    valid = _BUG_TYPES if tab == "bug" else _FEATURE_TYPES
    if t not in valid:
        raise HTTPException(status_code=422, detail=f"잘못된 유형입니다: {t}")


def _row_to_dict(row, viewer_uid: Optional[int]):
    (fid, user_id, author_nick, tab, type_, title, body, severity,
     song_id, song_title, status, votes, created_at, voted) = row
    return {
        "id": fid,
        "tab": tab,
        "type": type_,
        "title": title,
        "body": body,
        "severity": severity,
        "song_id": song_id,
        "song_title": song_title,
        "status": status,
        "votes": int(votes),
        "voted": bool(voted),
        "author": author_nick or "익명",
        "is_mine": (viewer_uid is not None and user_id is not None and int(user_id) == int(viewer_uid)),
        "created_at": created_at.isoformat() if created_at else None,
    }


def _song_feedback_row_to_dict(row):
    (fid, song_id, song_name, artist, level, anon_id, type_, body,
     status, created_at, resolved_at, admin_note) = row
    return {
        "id": fid,
        "song_id": song_id,
        "song_name": song_name,
        "artist": artist,
        "level": float(level) if level is not None else None,
        "anon_id": anon_id,
        "type": type_,
        "body": body,
        "status": status,
        "created_at": created_at.isoformat() if created_at else None,
        "resolved_at": resolved_at.isoformat() if resolved_at else None,
        "admin_note": admin_note,
    }


@router.get("/admin/song-feedback")
def list_song_feedback(request: Request, status: str = "all", type: str = "all", q: str = ""):
    require_admin(request)
    if status not in ("all", "received", "processing", "completed"):
        raise HTTPException(status_code=422, detail="잘못된 status입니다")
    if type != "all" and type not in _SONG_FEEDBACK_TYPES:
        raise HTTPException(status_code=422, detail=f"잘못된 유형입니다: {type}")

    q_norm = (q or "").strip().lower()
    where = ["1 = 1"]
    params: list = []
    if status != "all":
        where.append("f.status = %s")
        params.append(status)
    if type != "all":
        where.append("f.type = %s")
        params.append(type)
    if q_norm:
        where.append(
            "("
            "LOWER(COALESCE(s.name, '')) LIKE %s OR "
            "LOWER(COALESCE(s.artist, '')) LIKE %s OR "
            "LOWER(f.body) LIKE %s OR "
            "LOWER(f.anon_id) LIKE %s OR "
            "f.song_id::text LIKE %s"
            ")"
        )
        like = f"%{q_norm}%"
        params.extend([like, like, like, like, like])
    where_sql = " AND ".join(where)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT f.id, f.song_id, s.name AS song_name, s.artist, s.level,
                       f.anon_id, f.type, f.body, f.status, f.created_at,
                       f.resolved_at, f.admin_note
                FROM feedback f
                LEFT JOIN songs s ON s.id = f.song_id
                WHERE {where_sql}
                ORDER BY
                    CASE f.status WHEN 'received' THEN 0
                                  WHEN 'processing' THEN 1
                                  WHEN 'completed' THEN 2
                                  ELSE 3 END,
                    f.created_at DESC
                LIMIT 300
                """,
                tuple(params),
            )
            rows = cur.fetchall()
    return [_song_feedback_row_to_dict(r) for r in rows]


@router.get("/feedback")
def list_feedback(request: Request, tab: str = "bug", status: str = "all", q: str = ""):
    if tab not in ("bug", "feature"):
        raise HTTPException(status_code=422, detail="tab은 bug/feature 중 하나여야 합니다")
    if status not in ("all", "open", "in_review", "resolved", "rejected"):
        raise HTTPException(status_code=422, detail="잘못된 status입니다")
    viewer_uid = get_current_user_id(request)
    q_norm = (q or "").strip().lower()

    where = ["fi.tab = %s"]
    params: list = [tab]
    if status != "all":
        where.append("fi.status = %s")
        params.append(status)
    if q_norm:
        where.append("(LOWER(fi.title) LIKE %s OR LOWER(fi.body) LIKE %s)")
        like = f"%{q_norm}%"
        params.extend([like, like])
    where_sql = " AND ".join(where)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT fi.id, fi.user_id,
                       COALESCE(u.nickname, fi.author_nick) AS author_nick,
                       fi.tab, fi.type, fi.title, fi.body, fi.severity,
                       fi.song_id, fi.song_title, fi.status, fi.votes, fi.created_at,
                       (CASE WHEN %s::int IS NULL THEN FALSE ELSE EXISTS (
                          SELECT 1 FROM feedback_votes fv
                          WHERE fv.feedback_id = fi.id AND fv.user_id = %s
                       ) END) AS voted
                FROM feedback_items fi
                LEFT JOIN users u ON u.id = fi.user_id
                WHERE {where_sql}
                ORDER BY
                    CASE fi.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1
                                   WHEN 'resolved' THEN 2 ELSE 3 END,
                    fi.votes DESC, fi.created_at DESC
                LIMIT 200
                """,
                (viewer_uid, viewer_uid, *params),
            )
            rows = cur.fetchall()
    return [_row_to_dict(r, viewer_uid) for r in rows]


@router.post("/feedback", status_code=201)
@limiter.limit("10/hour")
def create_feedback(request: Request, body: FeedbackCreate):
    uid = require_user_id(request)
    user_row = fetch_user(uid)
    if not user_row or not user_row.get("nickname"):
        raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")

    _validate_type(body.tab, body.type)
    title_clean = body.title.strip()
    body_clean = body.body.strip()
    if not title_clean:
        raise HTTPException(status_code=422, detail="제목을 입력해주세요")
    if not body_clean:
        raise HTTPException(status_code=422, detail="내용을 입력해주세요")
    severity = body.severity if body.tab == "bug" else "low"
    song_id = body.song_id if body.tab == "bug" else None
    song_title = (body.song_title or "").strip() if body.tab == "bug" else ""

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO feedback_items
                  (user_id, author_nick, tab, type, title, body, severity,
                   song_id, song_title)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (
                    uid, user_row["nickname"], body.tab, body.type,
                    title_clean, body_clean, severity,
                    song_id, song_title,
                ),
            )
            fid, created_at = cur.fetchone()
        conn.commit()
    return {
        "id": fid,
        "tab": body.tab,
        "type": body.type,
        "title": title_clean,
        "body": body_clean,
        "severity": severity,
        "song_id": song_id,
        "song_title": song_title,
        "status": "open",
        "votes": 0,
        "voted": False,
        "author": user_row["nickname"],
        "is_mine": True,
        "created_at": created_at.isoformat() if created_at else None,
    }


@router.post("/feedback/{fid}/vote")
def toggle_vote(request: Request, fid: int):
    """공감 토글. 이미 vote돼있으면 해제, 없으면 추가. votes 카운터를 동시 갱신."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM feedback_votes WHERE feedback_id = %s AND user_id = %s",
                (fid, uid),
            )
            already = cur.fetchone() is not None
            if already:
                cur.execute(
                    "DELETE FROM feedback_votes WHERE feedback_id = %s AND user_id = %s",
                    (fid, uid),
                )
                cur.execute(
                    "UPDATE feedback_items SET votes = GREATEST(votes - 1, 0) "
                    "WHERE id = %s RETURNING votes",
                    (fid,),
                )
            else:
                try:
                    cur.execute(
                        "INSERT INTO feedback_votes (feedback_id, user_id) VALUES (%s, %s)",
                        (fid, uid),
                    )
                except psycopg2.errors.ForeignKeyViolation:
                    raise HTTPException(status_code=404, detail="피드백을 찾을 수 없습니다")
                cur.execute(
                    "UPDATE feedback_items SET votes = votes + 1 "
                    "WHERE id = %s RETURNING votes",
                    (fid,),
                )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="피드백을 찾을 수 없습니다")
            new_votes = int(row[0])
        conn.commit()
    return {"voted": not already, "votes": new_votes}
