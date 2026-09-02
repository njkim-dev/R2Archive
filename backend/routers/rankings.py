"""랭킹 페이지용 집계 API.

네 엔드포인트:
  - GET /api/rankings/songs                   곡별 1위 + 추가 기록 수
  - GET /api/rankings/users?q=                닉네임으로 사용자 검색
  - GET /api/rankings/users/lookup?nickname=  닉네임 딥링크 조회
  - GET /api/rankings/users/{user_id}/records 특정 사용자의 곡별 베스트

노출 정책:
  - visibility='public'    : 닉네임/점수 공개
  - visibility='group'     : 같은 그룹원에게만 점수/닉네임 공개
  - visibility='private'   : 본인에게만
  - 사용자 검색·사용자별 기록은 공개 범위와 검색 허용 정책을 함께 적용
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user_id
from database import get_conn

router = APIRouter(prefix="/api/rankings", tags=["rankings"])


class RankingTop(BaseModel):
    # user_id는 조회자가 식별할 수 있는 기록에서만 노출한다.
    user_id: Optional[int] = None
    nickname: str
    judgment_percent: float
    score: Optional[int] = None
    combo: Optional[int] = None
    is_mine: bool = False
    visibility: str


class SongRanking(BaseModel):
    song_id: int
    top: RankingTop
    total_records: int
    # 그룹 1위는 선택한 그룹 또는 가입한 전체 그룹을 기준으로 계산한다.
    group_top: Optional[RankingTop] = None


class UserSearchHit(BaseModel):
    user_id: int
    nickname: str
    record_count: int


class UserRecord(BaseModel):
    song_id: int
    judgment_percent: float
    score: Optional[int] = None
    combo: Optional[int] = None
    is_manual: bool = False


def _mask_nickname(nickname: str, visibility: str, owner_uid: Optional[int], viewer_uid: Optional[int]) -> str:
    return nickname or ""


@router.get("/songs", response_model=list[SongRanking])
def list_song_rankings(request: Request, group_id: Optional[int] = None):
    """모든 곡에 대해 곡별 1위 + (로그인 시) 그룹 1위.

    group_id 쿼리:
      - 미지정 + 로그인: 가입한 모든 그룹 멤버들 합집합 중 1위
      - 지정 + 멤버 확인 통과: 해당 그룹 멤버들 중 1위
      - 비로그인: 그룹 1위 없음
    """
    viewer_uid = get_current_user_id(request)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH user_best AS (
                    SELECT DISTINCT ON (r.song_id, COALESCE(r.user_id::text, 'anon:' || r.anon_id))
                           r.song_id,
                           r.user_id,
                           COALESCE(u.nickname, r.nickname) AS nickname,
                           r.score,
                           r.judgment_percent,
                           r.combo,
                           r.visibility,
                           r.created_at
                    FROM records r
                    LEFT JOIN users u ON u.id = r.user_id
                    WHERE r.judgment_percent IS NOT NULL
                      AND r.visibility = 'public'
                      -- manual 기록도 youtube_url이 있으면 (검증된 영상 인증) 랭킹에 합류
                      AND (NOT r.is_manual OR r.youtube_url IS NOT NULL)
                    ORDER BY r.song_id,
                             COALESCE(r.user_id::text, 'anon:' || r.anon_id),
                             r.judgment_percent DESC NULLS LAST,
                             r.created_at ASC
                ),
                ranked AS (
                    SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility,
                           ROW_NUMBER() OVER (
                               PARTITION BY song_id
                               ORDER BY judgment_percent DESC NULLS LAST, created_at ASC
                           ) AS song_rn,
                           COUNT(*) OVER (PARTITION BY song_id) AS total_records
                    FROM user_best
                )
                SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility, total_records
                FROM ranked
                WHERE song_rn = 1
                """
            )
            overall_rows = cur.fetchall()

            group_rows: list = []
            if viewer_uid is not None:
                if group_id is not None:
                    cur.execute(
                        "SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s",
                        (group_id, viewer_uid),
                    )
                    if cur.fetchone():
                        cur.execute(
                            """
                            WITH user_best AS (
                                SELECT DISTINCT ON (r.song_id, r.user_id)
                                       r.song_id, r.user_id,
                                       COALESCE(u.nickname, r.nickname) AS nickname,
                                       r.score, r.judgment_percent, r.combo, r.visibility, r.created_at
                                FROM records r
                                JOIN users u ON u.id = r.user_id
                                JOIN group_members gm ON gm.user_id = r.user_id AND gm.group_id = %s
                                WHERE r.judgment_percent IS NOT NULL
                                  AND r.visibility IN ('public', 'group')
                                  AND (NOT r.is_manual OR r.youtube_url IS NOT NULL)
                                ORDER BY r.song_id, r.user_id,
                                         r.judgment_percent DESC NULLS LAST, r.created_at ASC
                            ),
                            ranked AS (
                                SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility,
                                       ROW_NUMBER() OVER (
                                           PARTITION BY song_id
                                           ORDER BY judgment_percent DESC NULLS LAST, created_at ASC
                                       ) AS song_rn
                                FROM user_best
                            )
                            SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility
                            FROM ranked WHERE song_rn = 1
                            """,
                            (group_id,),
                        )
                        group_rows = cur.fetchall()
                else:
                    cur.execute(
                        """
                        WITH my_group_users AS (
                            SELECT DISTINCT them.user_id
                            FROM group_members me
                            JOIN group_members them ON them.group_id = me.group_id
                            WHERE me.user_id = %s
                        ),
                        user_best AS (
                            SELECT DISTINCT ON (r.song_id, r.user_id)
                                   r.song_id, r.user_id,
                                   COALESCE(u.nickname, r.nickname) AS nickname,
                                   r.score, r.judgment_percent, r.combo, r.visibility, r.created_at
                            FROM records r
                            JOIN users u ON u.id = r.user_id
                            JOIN my_group_users mgu ON mgu.user_id = r.user_id
                            WHERE r.judgment_percent IS NOT NULL
                              AND r.visibility IN ('public', 'group')
                              AND NOT r.is_manual
                            ORDER BY r.song_id, r.user_id,
                                     r.judgment_percent DESC NULLS LAST, r.created_at ASC
                        ),
                        ranked AS (
                            SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility,
                                   ROW_NUMBER() OVER (
                                       PARTITION BY song_id
                                       ORDER BY judgment_percent DESC NULLS LAST, created_at ASC
                                   ) AS song_rn
                            FROM user_best
                        )
                        SELECT song_id, user_id, nickname, score, judgment_percent, combo, visibility
                        FROM ranked WHERE song_rn = 1
                        """,
                        (viewer_uid,),
                    )
                    group_rows = cur.fetchall()

    group_map: dict[int, RankingTop] = {}
    for r in group_rows:
        sid, owner_uid, nickname, score, jp, combo, visibility = r
        is_mine = (viewer_uid is not None and owner_uid is not None and int(owner_uid) == int(viewer_uid))
        vis = visibility or "public"
        group_map[sid] = RankingTop(
            user_id=int(owner_uid) if (owner_uid is not None and vis in ("public", "group")) else None,
            nickname=_mask_nickname(nickname or "", vis, owner_uid, viewer_uid),
            judgment_percent=float(jp),
            score=score,
            combo=combo,
            is_mine=is_mine,
            visibility=vis,
        )

    out: list[SongRanking] = []
    for r in overall_rows:
        song_id, owner_uid, nickname, score, jp, combo, visibility, total = r
        is_mine = (viewer_uid is not None and owner_uid is not None and int(owner_uid) == int(viewer_uid))
        vis = visibility or "public"
        out.append(SongRanking(
            song_id=song_id,
            top=RankingTop(
                user_id=int(owner_uid) if (owner_uid is not None and vis == "public") else None,
                nickname=_mask_nickname(nickname or "", vis, owner_uid, viewer_uid),
                judgment_percent=float(jp),
                score=score,
                combo=combo,
                is_mine=is_mine,
                visibility=vis,
            ),
            total_records=int(total),
            group_top=group_map.get(song_id),
        ))
    return out


@router.get("/users", response_model=list[UserSearchHit])
def search_users(request: Request, q: str = ""):
    """닉네임 ILIKE 검색.

    매칭 정책 (users.searchable × records.visibility):
      - 본인        : 모든 visibility 기록 카운트
      - searchable in ('public','group') AND viewer가 동일 그룹 멤버
                    : visibility='public'/'group' 기록 카운트
      - searchable='public' AND 비-그룹  : visibility='public' 기록만 카운트
      - searchable='group'  AND 비-그룹  : 매칭 없음
      - searchable='private'             : 본인 외 매칭 없음
    """
    nick = (q or "").strip()
    if len(nick) < 1:
        return []
    if len(nick) > 30:
        raise HTTPException(status_code=422, detail="검색어가 너무 깁니다")
    pattern = f"%{nick}%"
    viewer_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.nickname, COUNT(DISTINCT r.song_id) AS record_count
                FROM users u
                JOIN records r ON r.user_id = u.id
                WHERE u.nickname ILIKE %s
                  AND r.judgment_percent IS NOT NULL
                  AND (
                    u.id = %s
                    OR (u.searchable IN ('public', 'group')
                        AND %s IS NOT NULL
                        AND EXISTS (
                          SELECT 1 FROM group_members me
                          JOIN group_members them ON them.group_id = me.group_id
                          WHERE me.user_id = %s AND them.user_id = u.id
                        )
                        AND r.visibility IN ('public', 'group'))
                    OR (u.searchable = 'public' AND r.visibility = 'public')
                  )
                GROUP BY u.id, u.nickname
                ORDER BY record_count DESC, u.nickname ASC
                LIMIT 50
                """,
                (pattern, viewer_uid, viewer_uid, viewer_uid),
            )
            rows = cur.fetchall()
    return [UserSearchHit(user_id=r[0], nickname=r[1], record_count=int(r[2])) for r in rows]


@router.get("/users/lookup")
def lookup_user_by_nickname(request: Request, nickname: str = ""):
    """닉네임으로 단건 조회 (대소문자 무시). 딥링크 `/rankings/<닉네임>`용.

    searchable 정책으로 차단되거나 일치 사용자가 없으면 모두 404로 응답해
    사용자 존재 자체를 숨긴다 (검색에서와 동일한 정책).
    """
    nick = (nickname or "").strip()
    if not nick or len(nick) > 30:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    viewer_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 사용자 검색과 같은 공개 범위 정책을 적용한다.
            cur.execute(
                """
                SELECT u.id, u.nickname, u.searchable
                FROM users u
                WHERE LOWER(TRIM(u.nickname)) = LOWER(TRIM(%s))
                  AND EXISTS (
                      SELECT 1 FROM records r
                      WHERE r.user_id = u.id
                        AND r.judgment_percent IS NOT NULL
                        AND (
                          u.id = %s
                          OR (u.searchable IN ('public', 'group')
                              AND %s IS NOT NULL
                              AND EXISTS (
                                SELECT 1 FROM group_members me
                                JOIN group_members them ON them.group_id = me.group_id
                                WHERE me.user_id = %s AND them.user_id = u.id
                              )
                              AND r.visibility IN ('public', 'group'))
                          OR (u.searchable = 'public' AND r.visibility = 'public')
                        )
                  )
                LIMIT 1
                """,
                (nick, viewer_uid, viewer_uid, viewer_uid),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
            uid, nickname_val, searchable = row
            is_self = (viewer_uid is not None and int(viewer_uid) == int(uid))
            if not is_self:
                if searchable == "private":
                    raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
                if searchable == "group":
                    if viewer_uid is None:
                        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
                    cur.execute(
                        """
                        SELECT 1 FROM group_members me
                        JOIN group_members them ON them.group_id = me.group_id
                        WHERE me.user_id = %s AND them.user_id = %s
                        LIMIT 1
                        """,
                        (viewer_uid, uid),
                    )
                    if not cur.fetchone():
                        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    return {"user_id": int(uid), "nickname": nickname_val}


@router.get("/users/{user_id}/records", response_model=list[UserRecord])
def get_user_records(request: Request, user_id: int):
    """특정 사용자의 곡별 베스트 (사용자당 곡당 1건).

    노출 정책:
      - 본인 조회: visibility 무관 전부.
      - viewer가 target과 동일 그룹 멤버: visibility='public'/'group' 기록.
        searchable='private'은 위쪽 가드에서 이미 차단됨.
      - 그 외 타인: visibility='public'만.
    """
    viewer_uid = get_current_user_id(request)
    is_self = viewer_uid is not None and int(viewer_uid) == int(user_id)

    # 본인은 검색 허용 설정과 관계없이 조회할 수 있다.
    shares_group = False
    if not is_self:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT searchable FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
                target_searchable = row[0]
                if target_searchable == "private":
                    raise HTTPException(status_code=403, detail="해당 사용자의 기록은 비공개입니다")
                # 같은 그룹 여부는 검색 허용과 기록 공개 범위에 함께 사용한다.
                if viewer_uid is not None:
                    cur.execute(
                        """
                        SELECT 1 FROM group_members me
                        JOIN group_members them ON them.group_id = me.group_id
                        WHERE me.user_id = %s AND them.user_id = %s
                        LIMIT 1
                        """,
                        (viewer_uid, user_id),
                    )
                    shares_group = bool(cur.fetchone())
                if target_searchable == "group" and not shares_group:
                    raise HTTPException(status_code=403, detail="해당 사용자의 기록은 그룹 멤버에게만 공개됩니다")

    if is_self:
        visibility_clause = "r.visibility IN ('public', 'group', 'private')"
    elif shares_group:
        visibility_clause = "r.visibility IN ('public', 'group')"
    else:
        visibility_clause = "r.visibility = 'public'"

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT DISTINCT ON (r.song_id)
                       r.song_id, r.judgment_percent, r.score, r.combo, r.is_manual
                FROM records r
                WHERE r.user_id = %s
                  AND r.judgment_percent IS NOT NULL
                  AND {visibility_clause}
                ORDER BY r.song_id,
                         r.judgment_percent DESC NULLS LAST,
                         r.created_at ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()
    return [
        UserRecord(
            song_id=r[0],
            judgment_percent=float(r[1]),
            score=r[2],
            combo=r[3],
            is_manual=bool(r[4]),
        )
        for r in rows
    ]
