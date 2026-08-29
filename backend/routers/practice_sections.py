from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user_id, require_admin, require_user_id
from database import get_conn
from rate_limit import limiter, ip_song_key
from routers.songs import ensure_active_song

router = APIRouter(prefix="/api/songs", tags=["practice-sections"])


class PracticeSectionCreate(BaseModel):
    start_seconds: int = Field(ge=0, le=60 * 60 * 6)
    end_seconds: int = Field(ge=1, le=60 * 60 * 6)
    description: str = Field(min_length=1, max_length=200)


class PracticeSectionResponse(BaseModel):
    id: int
    song_id: int
    start_seconds: int
    end_seconds: int
    description: str
    nickname: str
    is_recommended: bool
    is_mine: bool = False
    created_at: datetime
    recommended_at: Optional[datetime] = None


def _row_to_response(row, current_uid: Optional[int]) -> PracticeSectionResponse:
    user_id = row[7]
    return PracticeSectionResponse(
        id=int(row[0]),
        song_id=int(row[1]),
        start_seconds=int(row[2]),
        end_seconds=int(row[3]),
        description=row[4] or "",
        nickname=row[5] or "탈퇴한 사용자",
        is_recommended=bool(row[6]),
        is_mine=current_uid is not None and user_id is not None and int(user_id) == int(current_uid),
        created_at=row[8],
        recommended_at=row[9],
    )


def _fetch_sections(cur, song_id: int, current_uid: Optional[int], *, mode: str) -> list[PracticeSectionResponse]:
    where = ["ps.song_id = %s"]
    params: list = [song_id]
    if mode == "recommended":
        where.append("ps.is_recommended IS TRUE")
    elif mode == "mine":
        if current_uid is None:
            return []
        where.append("ps.user_id = %s")
        params.append(current_uid)

    cur.execute(
        f"""
        SELECT ps.id, ps.song_id, ps.start_seconds, ps.end_seconds, ps.description,
               COALESCE(u.nickname, '') AS nickname,
               ps.is_recommended, ps.user_id, ps.created_at, ps.recommended_at
        FROM song_practice_sections ps
        LEFT JOIN users u ON u.id = ps.user_id
        WHERE {' AND '.join(where)}
        ORDER BY ps.is_recommended DESC,
                 ps.start_seconds ASC,
                 ps.end_seconds ASC,
                 ps.created_at DESC,
                 ps.id DESC
        """,
        params,
    )
    return [_row_to_response(r, current_uid) for r in cur.fetchall()]


@router.get("/{song_id}/practice-sections", response_model=list[PracticeSectionResponse])
def list_practice_sections(request: Request, song_id: int):
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            return _fetch_sections(cur, song_id, current_uid, mode="all")


@router.get("/{song_id}/practice-sections/recommended", response_model=list[PracticeSectionResponse])
def list_recommended_practice_sections(request: Request, song_id: int):
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            return _fetch_sections(cur, song_id, current_uid, mode="recommended")


@router.get("/{song_id}/practice-sections/mine", response_model=list[PracticeSectionResponse])
def list_my_practice_sections(request: Request, song_id: int):
    current_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            return _fetch_sections(cur, song_id, current_uid, mode="mine")


@router.post("/{song_id}/practice-sections", response_model=PracticeSectionResponse, status_code=201)
@limiter.limit("20/hour", key_func=ip_song_key)
def add_practice_section(request: Request, song_id: int, body: PracticeSectionCreate):
    uid = require_user_id(request)
    if body.end_seconds <= body.start_seconds:
        raise HTTPException(status_code=422, detail="종료 시간은 시작 시간보다 뒤여야 합니다.")
    description = body.description.strip()
    if not description:
        raise HTTPException(status_code=422, detail="설명을 입력해주세요.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute(
                """
                INSERT INTO song_practice_sections
                    (song_id, user_id, start_seconds, end_seconds, description)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (song_id, uid, body.start_seconds, body.end_seconds, description),
            )
            section_id = cur.fetchone()[0]
            conn.commit()

            cur.execute(
                """
                SELECT ps.id, ps.song_id, ps.start_seconds, ps.end_seconds, ps.description,
                       COALESCE(u.nickname, '') AS nickname,
                       ps.is_recommended, ps.user_id, ps.created_at, ps.recommended_at
                FROM song_practice_sections ps
                LEFT JOIN users u ON u.id = ps.user_id
                WHERE ps.id = %s
                """,
                (section_id,),
            )
            return _row_to_response(cur.fetchone(), uid)


@router.delete("/{song_id}/practice-sections/{section_id}")
def delete_practice_section(request: Request, song_id: int, section_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute(
                """
                SELECT user_id
                FROM song_practice_sections
                WHERE id = %s AND song_id = %s
                """,
                (section_id, song_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="연습 구간을 찾을 수 없습니다.")

            cur.execute("SELECT is_admin FROM users WHERE id = %s", (uid,))
            user_row = cur.fetchone()
            is_admin = bool(user_row and user_row[0])
            owner_id = row[0]
            is_owner = owner_id is not None and int(owner_id) == int(uid)
            if not is_owner and not is_admin:
                raise HTTPException(status_code=403, detail="본인의 연습 구간만 삭제할 수 있습니다.")

            cur.execute(
                "DELETE FROM song_practice_sections WHERE id = %s AND song_id = %s",
                (section_id, song_id),
            )
            conn.commit()
            return {"ok": True}


@router.post("/{song_id}/practice-sections/{section_id}/recommend", response_model=PracticeSectionResponse)
def recommend_practice_section(request: Request, song_id: int, section_id: int):
    admin = require_admin(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_active_song(cur, song_id)
            cur.execute(
                """
                UPDATE song_practice_sections
                SET is_recommended = TRUE,
                    recommended_by = %s,
                    recommended_at = COALESCE(recommended_at, NOW()),
                    updated_at = NOW()
                WHERE id = %s AND song_id = %s
                RETURNING id
                """,
                (admin["id"], section_id, song_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="연습 구간을 찾을 수 없습니다.")
            conn.commit()

            cur.execute(
                """
                SELECT ps.id, ps.song_id, ps.start_seconds, ps.end_seconds, ps.description,
                       COALESCE(u.nickname, '') AS nickname,
                       ps.is_recommended, ps.user_id, ps.created_at, ps.recommended_at
                FROM song_practice_sections ps
                LEFT JOIN users u ON u.id = ps.user_id
                WHERE ps.id = %s
                """,
                (section_id,),
            )
            return _row_to_response(cur.fetchone(), admin["id"])
