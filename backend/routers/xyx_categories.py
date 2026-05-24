from __future__ import annotations

import secrets
from typing import Optional

import psycopg2
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user_id, require_user_id
from database import get_conn

router = APIRouter(prefix="/api", tags=["xyx-categories"])

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class XyxCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    is_public: bool = True


class XyxCategoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    is_public: Optional[bool] = None


class XyxCategorySongCreate(BaseModel):
    song_id: int = Field(ge=1)


class XyxCategoryMemberRolePatch(BaseModel):
    role: str = Field(pattern=r"^(viewer|editor)$")


def _generate_code() -> str:
    half1 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    half2 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"{half1}-{half2}"


def _normalize_code(raw: str) -> str:
    value = (raw or "").upper().strip().replace("-", "")
    if len(value) != 8 or any(c not in _CODE_ALPHABET for c in value):
        raise HTTPException(status_code=422, detail="Invalid category code")
    return f"{value[:4]}-{value[4:]}"


def _is_admin(cur, uid: Optional[int]) -> bool:
    if uid is None:
        return False
    cur.execute("SELECT is_admin FROM users WHERE id = %s", (uid,))
    row = cur.fetchone()
    return bool(row and row[0])


def _viewer_role(cur, category_id: int, owner_id: int, viewer_uid: Optional[int]) -> dict:
    is_owner = viewer_uid is not None and int(viewer_uid) == int(owner_id)
    if is_owner:
        return {
            "my_role": "owner",
            "is_owner": True,
            "is_subscribed": False,
            "can_edit": True,
            "can_manage": True,
            "is_admin_view": False,
        }

    member_role = None
    if viewer_uid is not None:
        cur.execute(
            "SELECT role FROM xyx_category_members WHERE category_id = %s AND user_id = %s",
            (category_id, viewer_uid),
        )
        row = cur.fetchone()
        member_role = row[0] if row else None

    if member_role:
        return {
            "my_role": member_role,
            "is_owner": False,
            "is_subscribed": True,
            "can_edit": member_role == "editor",
            "can_manage": False,
            "is_admin_view": False,
        }

    if _is_admin(cur, viewer_uid):
        return {
            "my_role": "admin",
            "is_owner": False,
            "is_subscribed": False,
            "can_edit": False,
            "can_manage": False,
            "is_admin_view": True,
        }

    return {
        "my_role": "guest",
        "is_owner": False,
        "is_subscribed": False,
        "can_edit": False,
        "can_manage": False,
        "is_admin_view": False,
    }


def _category_from_row(row, viewer_uid: Optional[int] = None, *, force_admin: bool = False) -> dict:
    category_id = int(row[0])
    owner_id = int(row[5])
    is_owner = viewer_uid is not None and int(viewer_uid) == owner_id
    role = row[8] if len(row) > 8 else None
    is_admin_view = bool(force_admin and not is_owner and not role)
    my_role = "owner" if is_owner else role or ("admin" if is_admin_view else "guest")
    return {
        "id": category_id,
        "name": row[1],
        "is_public": bool(row[2]),
        "category_code": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
        "owner_id": owner_id,
        "owner_nickname": row[6] or "",
        "song_count": int(row[7] or 0),
        "is_owner": is_owner,
        "is_subscribed": bool(role and not is_owner),
        "my_role": my_role,
        "can_edit": is_owner or role == "editor",
        "can_manage": is_owner,
        "is_admin_view": is_admin_view,
    }


def _fetch_category_summary(cur, category_id: int, viewer_uid: Optional[int]) -> dict:
    cur.execute(
        """
        SELECT xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
               xc.owner_id, COALESCE(u.nickname, '') AS owner_nickname,
               COUNT(xcs.song_id)::int AS song_count
        FROM xyx_categories xc
        LEFT JOIN users u ON u.id = xc.owner_id
        LEFT JOIN xyx_category_songs xcs ON xcs.category_id = xc.id
        WHERE xc.id = %s
        GROUP BY xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                 xc.owner_id, u.nickname
        """,
        (category_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    return {
        "id": int(row[0]),
        "name": row[1],
        "is_public": bool(row[2]),
        "category_code": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
        "owner_id": int(row[5]),
        "owner_nickname": row[6] or "",
        "song_count": int(row[7] or 0),
        **_viewer_role(cur, int(row[0]), int(row[5]), viewer_uid),
    }


def _ensure_can_edit(cur, category_id: int, uid: int) -> dict:
    category = _fetch_category_summary(cur, category_id, uid)
    if not category["can_edit"]:
        raise HTTPException(status_code=403, detail="No category edit permission")
    return category


def _ensure_can_manage(cur, category_id: int, uid: int) -> dict:
    category = _fetch_category_summary(cur, category_id, uid)
    if not category["can_manage"]:
        raise HTTPException(status_code=403, detail="No category manage permission")
    return category


def _fetch_members(cur, category_id: int) -> list[dict]:
    cur.execute(
        """
        SELECT xcm.user_id, COALESCE(u.nickname, '') AS nickname,
               xcm.role, xcm.joined_at
        FROM xyx_category_members xcm
        LEFT JOIN users u ON u.id = xcm.user_id
        WHERE xcm.category_id = %s
        ORDER BY CASE xcm.role WHEN 'editor' THEN 0 ELSE 1 END,
                 xcm.joined_at ASC
        """,
        (category_id,),
    )
    return [
        {
            "user_id": int(r[0]),
            "nickname": r[1],
            "role": r[2],
            "source": "subscribe",
            "joined_at": r[3].isoformat() if r[3] else None,
        }
        for r in cur.fetchall()
    ]


def _fetch_songs_for_category(cur, category_id: int, *, include_removed_korea_names: bool = False) -> list[dict]:
    cur.execute(
        """
        WITH category_song_ids AS (
            SELECT song_id, added_at
            FROM xyx_category_songs
            WHERE category_id = %s
        ),
        category_song_keys AS (
            SELECT DISTINCT s.name, s.artist
            FROM category_song_ids c
            JOIN xyx_songs s ON s.id = c.song_id
        ),
        play_counts AS (
            SELECT s.name, s.artist, COUNT(*)::int AS play_count
            FROM xyx_play_logs pl
            JOIN xyx_songs s ON s.id = pl.song_id
            JOIN category_song_keys k ON k.name = s.name AND k.artist = s.artist
            WHERE pl.played_at >= NOW() - INTERVAL '30 days'
            GROUP BY s.name, s.artist
        ),
        perceived AS (
            SELECT xpd.song_id, AVG(xpd.level)::float AS avg_level, COUNT(*)::int AS vote_count
            FROM xyx_perceived_difficulty xpd
            JOIN category_song_ids c ON c.song_id = xpd.song_id
            GROUP BY xpd.song_id
        ),
        visible_korea_names AS (
            SELECT l.xyx_song_id, MIN(ks.name) AS korea_name
            FROM song_server_links l
            JOIN songs ks ON ks.id = l.kr_song_id
            WHERE l.confidence = 100
              AND (COALESCE(ks.is_removed, FALSE) IS FALSE OR %s)
            GROUP BY l.xyx_song_id
            HAVING COUNT(DISTINCT ks.name) = 1
        )
        SELECT s.id, s.name, vkn.korea_name, s.artist, s.level, s.bpm, s.combo,
               COALESCE(s.real_time, s.time) AS time,
               s.change_bpm, s.youtube_url, s.stat, s.file_order, s.image,
               COALESCE(pc.play_count, 0) AS play_count,
               p.avg_level, COALESCE(p.vote_count, 0) AS vote_count,
               c.added_at
        FROM category_song_ids c
        JOIN xyx_songs s ON s.id = c.song_id
        LEFT JOIN visible_korea_names vkn ON vkn.xyx_song_id = s.id
        LEFT JOIN play_counts pc ON pc.name = s.name AND pc.artist = s.artist
        LEFT JOIN perceived p ON p.song_id = s.id
        GROUP BY s.id, s.name, vkn.korea_name, s.artist, s.level, s.bpm, s.combo,
                 s.time, s.real_time, s.change_bpm, s.youtube_url, s.stat,
                 s.file_order, s.image, pc.play_count, p.avg_level, p.vote_count, c.added_at
        ORDER BY c.added_at DESC, s.file_order DESC NULLS LAST
        """,
        (category_id, include_removed_korea_names),
    )
    rows = cur.fetchall()

    def xyx_image_path(image: str | None) -> str | None:
        image = (image or "").strip().replace("\\", "/")
        if not image:
            return None
        if image.startswith("xyx/"):
            return image
        if image.startswith("rnr_image/"):
            return f"xyx/{image}"
        return image

    return [
        {
            "id": r[0],
            "name": r[1] or "",
            "korea_name": r[2] or "",
            "artist": r[3] or "",
            "level": float(r[4] or 0),
            "bpm": float(r[5] or 0),
            "combo": int(r[6] or 0),
            "time": r[7] or "",
            "youtube_url": r[9] or "",
            "is_new": bool(r[10]),
            "file_order": int(r[11] or 0),
            "image": xyx_image_path(r[12]),
            "play_count": int(r[13] or 0),
            "is_change": bool(r[8]),
            "user_level_avg": round(r[14], 2) if r[14] is not None else None,
            "user_level_votes": int(r[15] or 0),
            "aliases": [r[2]] if r[2] else [],
            "added_at": r[16].isoformat() if r[16] else None,
        }
        for r in rows
    ]


@router.get("/me/xyx-categories")
def list_my_xyx_categories(request: Request):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                       xc.owner_id, COALESCE(u.nickname, '') AS owner_nickname,
                       COUNT(xcs.song_id)::int AS song_count,
                       NULL::text AS member_role
                FROM xyx_categories xc
                LEFT JOIN users u ON u.id = xc.owner_id
                LEFT JOIN xyx_category_songs xcs ON xcs.category_id = xc.id
                WHERE xc.owner_id = %s
                GROUP BY xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                         xc.owner_id, u.nickname
                ORDER BY xc.created_at DESC
                """,
                (uid,),
            )
            rows = cur.fetchall()
    return [_category_from_row(r, uid) for r in rows]


@router.get("/me/xyx-categories/editable")
def list_editable_xyx_categories(request: Request):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                       xc.owner_id, COALESCE(u.nickname, '') AS owner_nickname,
                       COUNT(xcs.song_id)::int AS song_count,
                       xcm.role AS member_role
                FROM xyx_categories xc
                LEFT JOIN xyx_category_members xcm
                  ON xcm.category_id = xc.id AND xcm.user_id = %s
                LEFT JOIN users u ON u.id = xc.owner_id
                LEFT JOIN xyx_category_songs xcs ON xcs.category_id = xc.id
                WHERE xc.owner_id = %s OR xcm.role = 'editor'
                GROUP BY xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                         xc.owner_id, u.nickname, xcm.role
                ORDER BY xc.created_at DESC
                """,
                (uid, uid),
            )
            rows = cur.fetchall()
    return [_category_from_row(r, uid) for r in rows]


@router.get("/me/xyx-category-subscriptions")
def list_my_xyx_category_subscriptions(request: Request):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                       xc.owner_id, COALESCE(u.nickname, '') AS owner_nickname,
                       COUNT(xcs.song_id)::int AS song_count,
                       xcm.role AS member_role
                FROM xyx_category_members xcm
                JOIN xyx_categories xc ON xc.id = xcm.category_id
                LEFT JOIN users u ON u.id = xc.owner_id
                LEFT JOIN xyx_category_songs xcs ON xcs.category_id = xc.id
                WHERE xcm.user_id = %s AND xc.owner_id <> %s
                GROUP BY xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                         xc.owner_id, u.nickname, xcm.role, xcm.joined_at
                ORDER BY xcm.joined_at DESC
                """,
                (uid, uid),
            )
            rows = cur.fetchall()
    return [_category_from_row(r, uid) for r in rows]


@router.get("/xyx-categories/public")
def list_public_xyx_categories(request: Request):
    viewer_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            is_admin = _is_admin(cur, viewer_uid)
            where_sql = "" if is_admin else "WHERE xc.is_public = TRUE"
            cur.execute(
                f"""
                SELECT xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                       xc.owner_id, COALESCE(u.nickname, '') AS owner_nickname,
                       COUNT(xcs.song_id)::int AS song_count,
                       xcm.role AS member_role
                FROM xyx_categories xc
                LEFT JOIN xyx_category_members xcm
                  ON xcm.category_id = xc.id AND xcm.user_id = %s
                LEFT JOIN users u ON u.id = xc.owner_id
                LEFT JOIN xyx_category_songs xcs ON xcs.category_id = xc.id
                {where_sql}
                GROUP BY xc.id, xc.name, xc.is_public, xc.category_code, xc.created_at,
                         xc.owner_id, u.nickname, xcm.role
                ORDER BY xc.created_at DESC
                """,
                (viewer_uid,),
            )
            rows = cur.fetchall()
    return [_category_from_row(r, viewer_uid, force_admin=is_admin) for r in rows]


@router.post("/xyx-categories", status_code=201)
def create_xyx_category(request: Request, body: XyxCategoryCreate):
    uid = require_user_id(request)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name is required")

    last_err = None
    with get_conn() as conn:
        with conn.cursor() as cur:
            for _ in range(5):
                code = _generate_code()
                try:
                    cur.execute(
                        """
                        INSERT INTO xyx_categories (owner_id, name, is_public, category_code)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id
                        """,
                        (uid, name, body.is_public, code),
                    )
                    category_id = int(cur.fetchone()[0])
                    category = _fetch_category_summary(cur, category_id, uid)
                    conn.commit()
                    return category
                except psycopg2.IntegrityError as exc:
                    conn.rollback()
                    last_err = exc
                    continue
    raise HTTPException(status_code=500, detail=f"Category code generation failed: {last_err}")


@router.get("/xyx-categories/by-code/{code}")
def get_xyx_category_by_code(request: Request, code: str):
    normalized = _normalize_code(code)
    viewer_uid = get_current_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM xyx_categories WHERE category_code = %s", (normalized,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Category not found")
            category_id = int(row[0])
            category = _fetch_category_summary(cur, category_id, viewer_uid)
            songs = _fetch_songs_for_category(
                cur,
                category_id,
                include_removed_korea_names=_is_admin(cur, viewer_uid),
            )
            members = _fetch_members(cur, category_id) if category["can_manage"] else []
    category["song_count"] = len(songs)
    return {"category": category, "songs": songs, "members": members}


@router.post("/xyx-categories/by-code/{code}/subscribe", status_code=201)
def subscribe_xyx_category(request: Request, code: str):
    uid = require_user_id(request)
    normalized = _normalize_code(code)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, owner_id, name FROM xyx_categories WHERE category_code = %s",
                (normalized,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Category not found")
            category_id, owner_id, name = int(row[0]), int(row[1]), row[2]
            if owner_id == uid:
                return {"ok": True, "already": True, "category_id": category_id, "category_name": name}

            cur.execute(
                """
                INSERT INTO xyx_category_members (category_id, user_id, role, source)
                VALUES (%s, %s, 'viewer', 'subscribe')
                ON CONFLICT (category_id, user_id)
                DO UPDATE SET
                  role = CASE
                    WHEN xyx_category_members.role = 'editor' THEN 'editor'
                    ELSE 'viewer'
                  END,
                  source = 'subscribe'
                RETURNING role
                """,
                (category_id, uid),
            )
            role = cur.fetchone()[0]
        conn.commit()
    return {"ok": True, "already": False, "category_id": category_id, "category_name": name, "role": role}


@router.delete("/xyx-categories/by-code/{code}/subscribe")
def unsubscribe_xyx_category(request: Request, code: str):
    uid = require_user_id(request)
    normalized = _normalize_code(code)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, owner_id, name FROM xyx_categories WHERE category_code = %s",
                (normalized,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Category not found")
            category_id, owner_id, name = int(row[0]), int(row[1]), row[2]
            if owner_id == uid:
                return {"ok": True, "already": True, "category_id": category_id, "category_name": name}

            cur.execute(
                """
                DELETE FROM xyx_category_members
                WHERE category_id = %s AND user_id = %s
                RETURNING role
                """,
                (category_id, uid),
            )
            removed = cur.fetchone()
        conn.commit()
    return {
        "ok": True,
        "already": removed is None,
        "category_id": category_id,
        "category_name": name,
        "removed_role": removed[0] if removed else None,
    }


@router.patch("/xyx-categories/{category_id}")
def patch_xyx_category(request: Request, category_id: int, body: XyxCategoryPatch):
    uid = require_user_id(request)
    fields, params = [], []
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Category name is required")
        fields.append("name = %s")
        params.append(name)
    if body.is_public is not None:
        fields.append("is_public = %s")
        params.append(body.is_public)
    if not fields:
        return {"ok": True, "updated": 0}

    params.append(category_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_can_edit(cur, category_id, uid)
            cur.execute(
                f"UPDATE xyx_categories SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s",
                tuple(params),
            )
        conn.commit()
    return {"ok": True, "updated": len(fields)}


@router.patch("/xyx-categories/{category_id}/members/{member_user_id}/role")
def patch_xyx_category_member_role(
    request: Request,
    category_id: int,
    member_user_id: int,
    body: XyxCategoryMemberRolePatch,
):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            category = _ensure_can_manage(cur, category_id, uid)
            if int(member_user_id) == int(category["owner_id"]):
                raise HTTPException(status_code=400, detail="Owner role cannot be changed")
            cur.execute(
                """
                WITH updated AS (
                    UPDATE xyx_category_members
                    SET role = %s, source = 'subscribe'
                    WHERE category_id = %s AND user_id = %s
                    RETURNING user_id, role, source, joined_at
                )
                SELECT updated.user_id, COALESCE(u.nickname, ''),
                       updated.role, updated.source, updated.joined_at
                FROM updated
                LEFT JOIN users u ON u.id = updated.user_id
                """,
                (body.role, category_id, member_user_id),
            )
            member = cur.fetchone()
            if not member:
                raise HTTPException(status_code=404, detail="Subscriber not found")
        conn.commit()

    return {
        "ok": True,
        "category_id": category_id,
        "user_id": int(member[0]),
        "nickname": member[1],
        "role": member[2],
        "source": member[3],
        "joined_at": member[4].isoformat() if member[4] else None,
    }


@router.delete("/xyx-categories/{category_id}/members/{member_user_id}")
def delete_xyx_category_member(request: Request, category_id: int, member_user_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            category = _ensure_can_manage(cur, category_id, uid)
            if int(member_user_id) == int(category["owner_id"]):
                raise HTTPException(status_code=400, detail="Owner cannot be removed")
            cur.execute(
                """
                DELETE FROM xyx_category_members
                WHERE category_id = %s AND user_id = %s
                RETURNING user_id
                """,
                (category_id, member_user_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Subscriber not found")
        conn.commit()
    return {"ok": True, "category_id": int(category_id), "user_id": int(row[0])}


@router.post("/xyx-categories/{category_id}/songs", status_code=201)
def add_song_to_xyx_category(request: Request, category_id: int, body: XyxCategorySongCreate):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            category = _ensure_can_edit(cur, category_id, uid)

            cur.execute("SELECT id, name FROM xyx_songs WHERE id = %s", (body.song_id,))
            song = cur.fetchone()
            if not song:
                raise HTTPException(status_code=404, detail="Song not found")

            cur.execute(
                """
                INSERT INTO xyx_category_songs (category_id, song_id)
                VALUES (%s, %s)
                ON CONFLICT (category_id, song_id) DO NOTHING
                RETURNING added_at
                """,
                (category_id, body.song_id),
            )
            added_row = cur.fetchone()
        conn.commit()
    return {
        "ok": True,
        "added": added_row is not None,
        "category_id": int(category_id),
        "category_name": category["name"],
        "song_id": int(body.song_id),
        "song_name": song[1],
    }


@router.delete("/xyx-categories/{category_id}/songs/{song_id}")
def delete_song_from_xyx_category(request: Request, category_id: int, song_id: int):
    uid = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_can_edit(cur, category_id, uid)
            cur.execute(
                """
                DELETE FROM xyx_category_songs
                WHERE category_id = %s AND song_id = %s
                RETURNING song_id
                """,
                (category_id, song_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Saved song not found")
        conn.commit()
    return {"ok": True, "category_id": int(category_id), "song_id": int(row[0])}
