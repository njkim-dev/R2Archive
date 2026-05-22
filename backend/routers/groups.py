"""그룹 관리 API.

엔드포인트:
  GET    /api/me/groups                              내가 가입한 그룹 + 내 역할
  POST   /api/groups                                 그룹 생성 (생성자가 owner)
  POST   /api/groups/join                            가입 코드로 가입 / 신청
  GET    /api/groups/{gid}                           그룹 상세 (멤버 + 신청 + 내 역할)
  PATCH  /api/groups/{gid}                           이름/설명/auto_accept 변경 (owner)
  DELETE /api/groups/{gid}                           그룹 삭제 (owner)
  POST   /api/groups/{gid}/regen-code                코드 재발급 (owner)
  POST   /api/groups/{gid}/revoke-code               코드 폐기 (owner)
  POST   /api/groups/{gid}/applications/{aid}/accept  수락 (owner/manager)
  POST   /api/groups/{gid}/applications/{aid}/reject  거절 (owner/manager)
  PATCH  /api/groups/{gid}/members/{mid}/role         역할 변경 (owner)
  DELETE /api/groups/{gid}/members/{mid}              추방 (owner는 모두, manager는 member만)
  POST   /api/groups/{gid}/transfer-owner             owner 양도 (owner → 다른 멤버)
  POST   /api/groups/{gid}/leave                      탈퇴 (owner는 양도 후에만)

권한 모델:
  owner   : 모든 권한 (단, 양도 후에만 탈퇴 가능)
  manager : application 수락/거절, member 추방
  member  : 기본
"""
from __future__ import annotations

import secrets
from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_user_id, fetch_user
from database import get_conn

router = APIRouter(prefix="/api", tags=["groups"])

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O/I/L 제외


def _generate_code() -> str:
    """XXXX-XXXX 8자 코드 (혼동 문자 제외). 생성 후 UNIQUE 충돌은 호출자가 재시도."""
    half1 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    half2 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"{half1}-{half2}"


def _normalize_code(raw: str) -> str:
    s = (raw or "").upper().strip().replace("-", "")
    if len(s) != 8 or any(c not in _CODE_ALPHABET for c in s):
        raise HTTPException(status_code=422, detail="가입 코드 형식이 올바르지 않습니다")
    return f"{s[:4]}-{s[4:]}"


def _is_admin(cur, uid: int) -> bool:
    cur.execute("SELECT is_admin FROM users WHERE id = %s", (uid,))
    row = cur.fetchone()
    return bool(row and row[0])


def _ensure_member(cur, gid: int, uid: int) -> dict:
    """본 그룹 멤버인지 확인하고 멤버 row(role 포함) 반환. 아니면 403.
    쓰기/관리 액션용 — admin 우회 불가 (그룹 운영 위임은 owner/manager만).
    """
    cur.execute(
        "SELECT id, role FROM group_members WHERE group_id = %s AND user_id = %s",
        (gid, uid),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="그룹 멤버가 아닙니다")
    return {"id": row[0], "role": row[1]}


def _ensure_role(cur, gid: int, uid: int, allowed: tuple[str, ...]) -> dict:
    me = _ensure_member(cur, gid, uid)
    if me["role"] not in allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    return me


def _ensure_member_or_admin(cur, gid: int, uid: int) -> dict:
    """읽기 액션용 — 멤버 또는 관리자면 통과. 관리자가 비-멤버일 때 role='admin'.
    'admin' role은 group_members.role 컬럼에는 존재하지 않는 합성 값 — 프론트에서
    관리자 뷰 표시용으로만 사용.
    """
    cur.execute(
        "SELECT id, role FROM group_members WHERE group_id = %s AND user_id = %s",
        (gid, uid),
    )
    row = cur.fetchone()
    if row:
        return {"id": row[0], "role": row[1], "is_admin_view": False}
    if _is_admin(cur, uid):
        return {"id": None, "role": "admin", "is_admin_view": True}
    raise HTTPException(status_code=403, detail="그룹 멤버가 아닙니다")



class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    description: str = Field(default="", max_length=240)
    auto_accept: bool = True
    bio: str = Field(default="", max_length=80)


class GroupJoin(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    bio: str = Field(default="", max_length=80)


class GroupPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=40)
    description: Optional[str] = Field(default=None, max_length=240)
    auto_accept: Optional[bool] = None


class RolePatch(BaseModel):
    role: str = Field(pattern=r"^(manager|member)$")


class TransferOwner(BaseModel):
    to_user_id: int = Field(ge=1)



@router.get("/me/groups")
def list_my_groups(request: Request):
    """내가 가입한 그룹들. 각 그룹의 멤버 수와 내 역할 포함.
    관리자는 비-멤버 그룹도 함께 반환 — my_role='admin'으로 표시.
    """
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            is_admin = _is_admin(cur, uid)
            if is_admin:
                cur.execute(
                    """
                    SELECT g.id, g.name, g.description, g.owner_id, g.auto_accept,
                           g.join_code, g.code_revoked, g.created_at,
                           COALESCE(gm.role, 'admin') AS role,
                           (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS member_count,
                           (SELECT COUNT(*) FROM group_applications a
                            WHERE a.group_id = g.id AND a.status = 'pending') AS pending_count,
                           (SELECT COUNT(DISTINCT r.song_id)
                            FROM records r
                            JOIN group_members gm2 ON gm2.user_id = r.user_id AND gm2.group_id = g.id
                            WHERE r.judgment_percent IS NOT NULL
                              AND NOT r.is_manual
                              AND r.visibility IN ('public', 'anonymous')
                           ) AS ranked_song_count
                    FROM groups g
                    LEFT JOIN group_members gm
                      ON gm.group_id = g.id AND gm.user_id = %s
                    ORDER BY (gm.user_id IS NULL), COALESCE(gm.joined_at, g.created_at) ASC
                    """,
                    (uid,),
                )
            else:
                cur.execute(
                    """
                    SELECT g.id, g.name, g.description, g.owner_id, g.auto_accept,
                           g.join_code, g.code_revoked, g.created_at,
                           gm.role,
                           (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS member_count,
                           (SELECT COUNT(*) FROM group_applications a
                            WHERE a.group_id = g.id AND a.status = 'pending') AS pending_count,
                           (SELECT COUNT(DISTINCT r.song_id)
                            FROM records r
                            JOIN group_members gm2 ON gm2.user_id = r.user_id AND gm2.group_id = g.id
                            WHERE r.judgment_percent IS NOT NULL
                              AND NOT r.is_manual
                              AND r.visibility IN ('public', 'anonymous')
                           ) AS ranked_song_count
                    FROM group_members gm
                    JOIN groups g ON g.id = gm.group_id
                    WHERE gm.user_id = %s
                    ORDER BY gm.joined_at ASC
                    """,
                    (uid,),
                )
            rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "description": r[2],
            "owner_id": r[3],
            "auto_accept": bool(r[4]),
            "join_code": r[5] if r[8] in ("owner", "manager", "admin") else None,
            "code_revoked": bool(r[6]),
            "created_at": r[7].isoformat() if r[7] else None,
            "my_role": r[8],
            "member_count": int(r[9]),
            "pending_count": int(r[10]),
            "ranked_song_count": int(r[11]),
        }
        for r in rows
    ]


@router.get("/groups/{gid}")
def get_group_detail(request: Request, gid: int):
    """그룹 상세. 멤버는 누구나 조회 가능. 비멤버는 차단 (멤버 목록 비공개 정책).
    관리자는 비-멤버여도 조회 가능 (my_role='admin'으로 응답).
    """
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            me = _ensure_member_or_admin(cur, gid, uid)
            cur.execute(
                "SELECT id, name, description, owner_id, auto_accept, "
                "       join_code, code_revoked, created_at "
                "FROM groups WHERE id = %s",
                (gid,),
            )
            g = cur.fetchone()
            if not g:
                raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")

            cur.execute(
                """
                SELECT gm.id, gm.user_id, COALESCE(u.nickname, '') AS nickname,
                       gm.bio, gm.role, gm.joined_at,
                       COALESCE(u.searchable, 'public') AS searchable
                FROM group_members gm
                LEFT JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s
                ORDER BY CASE gm.role
                            WHEN 'owner' THEN 0
                            WHEN 'manager' THEN 1
                            ELSE 2 END,
                         gm.joined_at ASC
                """,
                (gid,),
            )
            members = [
                {
                    "id": r[0],
                    "user_id": r[1],
                    "nickname": r[2],
                    "bio": r[3],
                    "role": r[4],
                    "joined_at": r[5].isoformat() if r[5] else None,
                    "searchable": r[6],
                }
                for r in cur.fetchall()
            ]

            applications = []
            if me["role"] in ("owner", "manager", "admin"):
                cur.execute(
                    """
                    SELECT ga.id, ga.user_id, COALESCE(u.nickname, '') AS nickname,
                           ga.bio, ga.created_at
                    FROM group_applications ga
                    LEFT JOIN users u ON u.id = ga.user_id
                    WHERE ga.group_id = %s AND ga.status = 'pending'
                    ORDER BY ga.created_at ASC
                    """,
                    (gid,),
                )
                applications = [
                    {
                        "id": r[0],
                        "user_id": r[1],
                        "nickname": r[2],
                        "bio": r[3],
                        "created_at": r[4].isoformat() if r[4] else None,
                    }
                    for r in cur.fetchall()
                ]

    return {
        "id": g[0],
        "name": g[1],
        "description": g[2],
        "owner_id": g[3],
        "auto_accept": bool(g[4]),
        "join_code": g[5] if me["role"] in ("owner", "manager", "admin") else None,
        "code_revoked": bool(g[6]),
        "created_at": g[7].isoformat() if g[7] else None,
        "my_role": me["role"],
        "members": members,
        "applications": applications,
    }



@router.post("/groups", status_code=201)
def create_group(request: Request, body: GroupCreate):
    uid = require_user_id(request)
    user_row = fetch_user(uid)
    if not user_row or not user_row.get("nickname"):
        raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")

    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="그룹 이름은 2자 이상 입력해주세요")

    last_err = None
    with get_conn() as conn:
        with conn.cursor() as cur:
            for _ in range(5):
                code = _generate_code()
                try:
                    cur.execute(
                        "INSERT INTO groups (name, description, owner_id, auto_accept, join_code) "
                        "VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
                        (name, body.description.strip(), uid, body.auto_accept, code),
                    )
                    gid, created_at = cur.fetchone()
                    cur.execute(
                        "INSERT INTO group_members (group_id, user_id, bio, role) "
                        "VALUES (%s, %s, %s, 'owner')",
                        (gid, uid, body.bio.strip()),
                    )
                    conn.commit()
                    return {
                        "id": gid,
                        "name": name,
                        "description": body.description.strip(),
                        "owner_id": uid,
                        "auto_accept": body.auto_accept,
                        "join_code": code,
                        "code_revoked": False,
                        "created_at": created_at.isoformat() if created_at else None,
                        "my_role": "owner",
                        "member_count": 1,
                        "pending_count": 0,
                    }
                except psycopg2.IntegrityError as e:
                    conn.rollback()
                    last_err = e
                    continue
    raise HTTPException(status_code=500, detail=f"코드 생성 실패: {last_err}")


@router.get("/groups/by-code/{code}")
def lookup_group_by_code(request: Request, code: str):
    """가입 코드로 그룹 식별. 이미 멤버이면 is_member=true (프론트에서 detail로 redirect용).
    폐기 코드는 410, 매칭 없음은 404. 로그인 필수.
    """
    normalized = _normalize_code(code)
    viewer_uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, description, auto_accept, code_revoked,
                       (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS member_count
                FROM groups WHERE join_code = %s
                """,
                (normalized,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="유효하지 않은 가입 코드입니다")
            gid, name, desc, auto_accept, revoked, member_count = row
            if revoked:
                raise HTTPException(status_code=410, detail="폐기된 가입 코드입니다")
            cur.execute(
                "SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s",
                (gid, viewer_uid),
            )
            is_member = cur.fetchone() is not None
    return {
        "id": int(gid),
        "name": name,
        "description": desc,
        "auto_accept": bool(auto_accept),
        "member_count": int(member_count),
        "is_member": is_member,
    }


@router.post("/groups/join")
def join_group(request: Request, body: GroupJoin):
    """가입 코드로 가입. auto_accept=TRUE면 즉시 멤버, 아니면 신청 큐로."""
    uid = require_user_id(request)
    user_row = fetch_user(uid)
    if not user_row or not user_row.get("nickname"):
        raise HTTPException(status_code=422, detail="닉네임을 먼저 설정해주세요")

    code = _normalize_code(body.code)
    bio = body.bio.strip()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, auto_accept, code_revoked FROM groups WHERE join_code = %s",
                (code,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="유효하지 않은 가입 코드입니다")
            gid, gname, auto_accept, revoked = row
            if revoked:
                raise HTTPException(status_code=410, detail="폐기된 가입 코드입니다")

            cur.execute(
                "SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s",
                (gid, uid),
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="이미 가입된 그룹입니다")

            if auto_accept:
                cur.execute(
                    "INSERT INTO group_members (group_id, user_id, bio, role) "
                    "VALUES (%s, %s, %s, 'member')",
                    (gid, uid, bio),
                )
                conn.commit()
                return {"status": "joined", "group_id": gid, "group_name": gname}

            try:
                cur.execute(
                    "INSERT INTO group_applications (group_id, user_id, bio) "
                    "VALUES (%s, %s, %s)",
                    (gid, uid, bio),
                )
            except psycopg2.IntegrityError:
                conn.rollback()
                raise HTTPException(status_code=409, detail="이미 신청한 그룹입니다")
            conn.commit()
            return {"status": "applied", "group_id": gid, "group_name": gname}



@router.patch("/groups/{gid}")
def patch_group(request: Request, gid: int, body: GroupPatch):
    uid = require_user_id(request)
    fields, params = [], []
    if body.name is not None:
        fields.append("name = %s")
        params.append(body.name.strip())
    if body.description is not None:
        fields.append("description = %s")
        params.append(body.description.strip())
    if body.auto_accept is not None:
        fields.append("auto_accept = %s")
        params.append(body.auto_accept)
    if not fields:
        return {"ok": True, "updated": 0}

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            params.append(gid)
            cur.execute(f"UPDATE groups SET {', '.join(fields)} WHERE id = %s", tuple(params))
        conn.commit()
    return {"ok": True, "updated": len(fields)}


@router.delete("/groups/{gid}", status_code=204)
def delete_group(request: Request, gid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            cur.execute("DELETE FROM groups WHERE id = %s", (gid,))
        conn.commit()


@router.post("/groups/{gid}/regen-code")
def regen_code(request: Request, gid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            for _ in range(5):
                code = _generate_code()
                try:
                    cur.execute(
                        "UPDATE groups SET join_code = %s, code_revoked = FALSE "
                        "WHERE id = %s",
                        (code, gid),
                    )
                    conn.commit()
                    return {"join_code": code, "code_revoked": False}
                except psycopg2.IntegrityError:
                    conn.rollback()
                    continue
    raise HTTPException(status_code=500, detail="코드 생성에 실패했습니다")


@router.post("/groups/{gid}/revoke-code")
def revoke_code(request: Request, gid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            cur.execute("UPDATE groups SET code_revoked = TRUE WHERE id = %s", (gid,))
        conn.commit()
    return {"ok": True}



@router.post("/groups/{gid}/applications/{aid}/accept")
def accept_application(request: Request, gid: int, aid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner", "manager"))
            cur.execute(
                "SELECT user_id, bio, status FROM group_applications "
                "WHERE id = %s AND group_id = %s",
                (aid, gid),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="신청을 찾을 수 없습니다")
            applicant_id, bio, status = row
            if status != "pending":
                raise HTTPException(status_code=409, detail="이미 처리된 신청입니다")

            cur.execute(
                "UPDATE group_applications SET status = 'accepted' WHERE id = %s",
                (aid,),
            )
            cur.execute(
                "INSERT INTO group_members (group_id, user_id, bio, role) "
                "VALUES (%s, %s, %s, 'member') "
                "ON CONFLICT (group_id, user_id) DO NOTHING",
                (gid, applicant_id, bio),
            )
        conn.commit()
    return {"ok": True}


@router.post("/groups/{gid}/applications/{aid}/reject")
def reject_application(request: Request, gid: int, aid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner", "manager"))
            cur.execute(
                "UPDATE group_applications SET status = 'rejected' "
                "WHERE id = %s AND group_id = %s AND status = 'pending'",
                (aid, gid),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="처리할 신청이 없습니다")
        conn.commit()
    return {"ok": True}



@router.patch("/groups/{gid}/members/{mid}/role")
def change_role(request: Request, gid: int, mid: int, body: RolePatch):
    """역할 변경 (owner만, member ↔ manager). owner role은 transfer-owner로만 변경."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            cur.execute(
                "SELECT user_id, role FROM group_members WHERE id = %s AND group_id = %s",
                (mid, gid),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다")
            target_uid, current_role = row
            if current_role == "owner":
                raise HTTPException(status_code=400, detail="owner 역할은 양도로만 변경됩니다")
            if target_uid == uid:
                raise HTTPException(status_code=400, detail="본인 역할은 변경할 수 없습니다")

            cur.execute(
                "UPDATE group_members SET role = %s WHERE id = %s",
                (body.role, mid),
            )
        conn.commit()
    return {"ok": True}


@router.delete("/groups/{gid}/members/{mid}", status_code=204)
def kick_member(request: Request, gid: int, mid: int):
    """추방. owner는 모두 강퇴 가능. manager는 member만 강퇴 가능."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            me = _ensure_role(cur, gid, uid, ("owner", "manager"))
            cur.execute(
                "SELECT user_id, role FROM group_members WHERE id = %s AND group_id = %s",
                (mid, gid),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다")
            target_uid, target_role = row
            if target_role == "owner":
                raise HTTPException(status_code=400, detail="owner는 강퇴할 수 없습니다")
            if target_uid == uid:
                raise HTTPException(status_code=400, detail="본인은 강퇴할 수 없습니다 (탈퇴를 사용해주세요)")
            if me["role"] == "manager" and target_role != "member":
                raise HTTPException(status_code=403, detail="매니저는 일반 멤버만 강퇴할 수 있습니다")
            cur.execute("DELETE FROM group_members WHERE id = %s", (mid,))
        conn.commit()


@router.post("/groups/{gid}/transfer-owner")
def transfer_owner(request: Request, gid: int, body: TransferOwner):
    """owner 권한 양도. 양도 후 본인은 manager로 강등."""
    uid = require_user_id(request)
    if body.to_user_id == uid:
        raise HTTPException(status_code=400, detail="본인에게 양도할 수 없습니다")
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_role(cur, gid, uid, ("owner",))
            cur.execute(
                "SELECT id FROM group_members WHERE group_id = %s AND user_id = %s",
                (gid, body.to_user_id),
            )
            target_row = cur.fetchone()
            if not target_row:
                raise HTTPException(status_code=404, detail="대상 사용자가 그룹 멤버가 아닙니다")

            cur.execute(
                "UPDATE group_members SET role = 'manager' "
                "WHERE group_id = %s AND user_id = %s",
                (gid, uid),
            )
            cur.execute(
                "UPDATE group_members SET role = 'owner' "
                "WHERE group_id = %s AND user_id = %s",
                (gid, body.to_user_id),
            )
            cur.execute("UPDATE groups SET owner_id = %s WHERE id = %s", (body.to_user_id, gid))
        conn.commit()
    return {"ok": True}


@router.post("/groups/{gid}/leave", status_code=204)
def leave_group(request: Request, gid: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            me = _ensure_member(cur, gid, uid)
            if me["role"] == "owner":
                raise HTTPException(
                    status_code=400,
                    detail="owner는 다른 멤버에게 양도하거나 그룹을 삭제해야 탈퇴할 수 있습니다",
                )
            cur.execute("DELETE FROM group_members WHERE id = %s", (me["id"],))
        conn.commit()



@router.get("/groups/{gid}/leaderboard")
def get_group_leaderboard(request: Request, gid: int):
    """그룹 멤버별 통계: 평균 판정·곡 수·99%+·95%+·최근 기록 시각.
    합성 점수(gscore)는 프론트에서 계산. admin은 비-멤버여도 조회 가능.
    """
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_member_or_admin(cur, gid, uid)
            cur.execute(
                """
                WITH user_best AS (
                    SELECT DISTINCT ON (r.user_id, r.song_id)
                           r.user_id, r.song_id, r.judgment_percent, r.created_at
                    FROM records r
                    JOIN group_members gm ON gm.user_id = r.user_id AND gm.group_id = %s
                    WHERE r.judgment_percent IS NOT NULL
                      AND NOT r.is_manual
                      AND r.visibility IN ('public', 'anonymous')
                    ORDER BY r.user_id, r.song_id,
                             r.judgment_percent DESC NULLS LAST, r.created_at ASC
                ),
                agg AS (
                    SELECT user_id,
                           COUNT(*)::int AS num_songs,
                           AVG(judgment_percent)::float AS avg_jp,
                           SUM(CASE WHEN judgment_percent >= 99   THEN 1 ELSE 0 END)::int AS top99,
                           SUM(CASE WHEN judgment_percent >= 98.9 THEN 1 ELSE 0 END)::int AS top989,
                           SUM(CASE WHEN judgment_percent >= 98.8 THEN 1 ELSE 0 END)::int AS top988,
                           SUM(CASE WHEN judgment_percent >= 98.7 THEN 1 ELSE 0 END)::int AS top987,
                           SUM(CASE WHEN judgment_percent >= 98.5 THEN 1 ELSE 0 END)::int AS top985,
                           SUM(CASE WHEN judgment_percent >= 98   THEN 1 ELSE 0 END)::int AS top98,
                           MAX(created_at) AS last_at
                    FROM user_best
                    GROUP BY user_id
                )
                SELECT gm.user_id, COALESCE(u.nickname, '') AS nickname,
                       gm.bio, gm.role, gm.joined_at,
                       COALESCE(a.num_songs, 0),
                       a.avg_jp,
                       COALESCE(a.top99, 0),
                       COALESCE(a.top989, 0),
                       COALESCE(a.top988, 0),
                       COALESCE(a.top987, 0),
                       COALESCE(a.top985, 0),
                       COALESCE(a.top98, 0),
                       a.last_at
                FROM group_members gm
                LEFT JOIN users u ON u.id = gm.user_id
                LEFT JOIN agg a ON a.user_id = gm.user_id
                WHERE gm.group_id = %s
                ORDER BY gm.joined_at ASC
                """,
                (gid, gid),
            )
            rows = cur.fetchall()
    return [
        {
            "user_id": r[0],
            "nickname": r[1],
            "bio": r[2],
            "role": r[3],
            "joined_at": r[4].isoformat() if r[4] else None,
            "num_songs": int(r[5]),
            "avg_jp": float(r[6]) if r[6] is not None else None,
            "top99": int(r[7]),
            "top989": int(r[8]),
            "top988": int(r[9]),
            "top987": int(r[10]),
            "top985": int(r[11]),
            "top98": int(r[12]),
            "last_at": r[13].isoformat() if r[13] else None,
        }
        for r in rows
    ]


@router.get("/groups/{gid}/feed")
def get_group_feed(request: Request, gid: int, limit: int = 80):
    """활동 피드: 가입 이벤트 + 점수 기록.
    그룹 생성자(joined_at == groups.created_at)의 join 이벤트는 제외.

    노출 정책:
      - visibility='public'/'anonymous' 기록은 항상 피드에 포함.
      - visibility='private' 기록은 owner.searchable이 'public' 또는 'group'일 때만 포함
        (그룹 내 신뢰 컨텍스트 — searchable로 그룹 멤버에게의 식별을 허용한 사용자에 한해 노출).
      - score 이벤트의 record_id/screenshot_url/youtube_url은 can_view 통과 시에만:
        본인 / show_screenshot=TRUE / searchable in ('public','group').
    """
    uid = require_user_id(request)
    limit = max(1, min(int(limit or 80), 200))
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_member_or_admin(cur, gid, uid)
            cur.execute(
                """
                (
                    SELECT 'join' AS kind,
                           gm.joined_at AS at,
                           gm.user_id,
                           COALESCE(u.nickname, '') AS nickname,
                           gm.role,
                           NULL::int AS song_id,
                           NULL::text AS song_name,
                           NULL::float AS judgment_percent,
                           NULL::int AS record_id,
                           NULL::text AS screenshot_path,
                           NULL::text AS youtube_url,
                           NULL::boolean AS owner_show,
                           NULL::text AS owner_searchable
                    FROM group_members gm
                    JOIN groups g ON g.id = gm.group_id
                    LEFT JOIN users u ON u.id = gm.user_id
                    WHERE gm.group_id = %s
                      AND gm.joined_at <> g.created_at
                )
                UNION ALL
                (
                    SELECT 'score' AS kind,
                           r.created_at AS at,
                           r.user_id,
                           COALESCE(u.nickname, r.nickname) AS nickname,
                           NULL::text AS role,
                           r.song_id,
                           s.name AS song_name,
                           r.judgment_percent,
                           r.id AS record_id,
                           r.screenshot_path,
                           r.youtube_url,
                           COALESCE(u.show_screenshot, FALSE) AS owner_show,
                           COALESCE(u.searchable, 'public') AS owner_searchable
                    FROM records r
                    JOIN group_members gm ON gm.user_id = r.user_id AND gm.group_id = %s
                    LEFT JOIN users u ON u.id = r.user_id
                    LEFT JOIN songs s ON s.id = r.song_id
                    WHERE r.judgment_percent IS NOT NULL
                      AND NOT r.is_manual
                      AND (
                        r.visibility IN ('public', 'anonymous')
                        OR (
                          r.visibility = 'private'
                          AND COALESCE(u.searchable, 'public') IN ('public', 'group')
                        )
                      )
                )
                ORDER BY at DESC NULLS LAST
                LIMIT %s
                """,
                (gid, gid, limit),
            )
            rows = cur.fetchall()

    out = []
    for r in rows:
        kind = r[0]
        owner_uid = r[2]
        record_id = r[8]
        screenshot_path = r[9]
        youtube_url_raw = r[10]
        owner_show = bool(r[11]) if r[11] is not None else False
        owner_searchable = r[12]
        is_mine = (owner_uid is not None and int(owner_uid) == int(uid))

        can_view = (
            is_mine
            or owner_show
            or owner_searchable in ("public", "group")
        )

        screenshot_url = None
        youtube_url = None
        if kind == "score" and can_view:
            if screenshot_path and record_id:
                screenshot_url = f"/api/records/{record_id}/screenshot"
            if youtube_url_raw:
                youtube_url = youtube_url_raw

        out.append({
            "kind": kind,
            "at": r[1].isoformat() if r[1] else None,
            "user_id": r[2],
            "nickname": r[3],
            "role": r[4],
            "song_id": r[5],
            "song_name": r[6],
            "judgment_percent": float(r[7]) if r[7] is not None else None,
            "record_id": record_id,
            "screenshot_url": screenshot_url,
            "youtube_url": youtube_url,
        })
    return out


@router.get("/groups/{gid}/song-firsts")
def get_group_song_firsts(request: Request, gid: int):
    """곡별 그룹 1위 분포: 멤버별 1위 곡 수 + 99%+ 1위 곡 수. admin은 비-멤버여도 조회 가능."""
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_member_or_admin(cur, gid, uid)
            cur.execute(
                """
                WITH user_best AS (
                    SELECT DISTINCT ON (r.user_id, r.song_id)
                           r.user_id, r.song_id, r.judgment_percent, r.created_at
                    FROM records r
                    JOIN group_members gm ON gm.user_id = r.user_id AND gm.group_id = %s
                    WHERE r.judgment_percent IS NOT NULL
                      AND NOT r.is_manual
                      AND r.visibility IN ('public', 'anonymous')
                    ORDER BY r.user_id, r.song_id,
                             r.judgment_percent DESC NULLS LAST, r.created_at ASC
                ),
                ranked AS (
                    SELECT user_id, song_id, judgment_percent,
                           ROW_NUMBER() OVER (
                               PARTITION BY song_id
                               ORDER BY judgment_percent DESC NULLS LAST, created_at ASC
                           ) AS rn
                    FROM user_best
                )
                SELECT r.user_id, COALESCE(u.nickname, ''),
                       COUNT(*)::int AS num_firsts,
                       SUM(CASE WHEN r.judgment_percent >= 99 THEN 1 ELSE 0 END)::int AS num_firsts_99
                FROM ranked r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.rn = 1
                GROUP BY r.user_id, u.nickname
                ORDER BY num_firsts DESC, u.nickname ASC
                """,
                (gid,),
            )
            rows = cur.fetchall()
    return [
        {
            "user_id": r[0],
            "nickname": r[1],
            "num_firsts": int(r[2]),
            "num_firsts_99": int(r[3]),
        }
        for r in rows
    ]
