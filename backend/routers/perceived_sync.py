from typing import Literal


ServerMode = Literal["kr", "xyx"]


def _counterpart(server: ServerMode) -> ServerMode:
    return "xyx" if server == "kr" else "kr"


def _perceived_table(server: ServerMode) -> str:
    return "xyx_perceived_difficulty" if server == "xyx" else "perceived_difficulty"


def _link_columns(server: ServerMode) -> tuple[str, str]:
    if server == "kr":
        return "kr_song_id", "xyx_song_id"
    return "xyx_song_id", "kr_song_id"


def get_linked_counterpart_song_ids(cur, server: ServerMode, song_id: int) -> list[int]:
    source_col, target_col = _link_columns(server)
    cur.execute(
        f"""
        SELECT DISTINCT {target_col}
        FROM song_server_links
        WHERE {source_col} = %s
          AND confidence = 100
        """,
        (song_id,),
    )
    return [int(row[0]) for row in cur.fetchall()]


def mirror_perceived_vote(
    cur,
    server: ServerMode,
    song_id: int,
    user_id: int | None,
    anon_id: str | None,
    level: float,
    opinion: str | None,
) -> None:
    target_server = _counterpart(server)
    target_table = _perceived_table(target_server)
    target_song_ids = get_linked_counterpart_song_ids(cur, server, song_id)
    if not target_song_ids:
        return

    for target_song_id in target_song_ids:
        if user_id is not None:
            cur.execute(
                f"""
                UPDATE {target_table}
                SET level = %s, opinion = %s, updated_at = NOW()
                WHERE song_id = %s AND user_id = %s
                """,
                (level, opinion, target_song_id, user_id),
            )
            if cur.rowcount > 0:
                continue

            migrated = False
            if anon_id:
                cur.execute(
                    f"""
                    UPDATE {target_table}
                    SET user_id = %s, anon_id = NULL, level = %s, opinion = %s, updated_at = NOW()
                    WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                    """,
                    (user_id, level, opinion, target_song_id, anon_id),
                )
                migrated = cur.rowcount > 0
            if migrated:
                continue

            cur.execute(
                f"""
                INSERT INTO {target_table} (song_id, user_id, level, opinion)
                VALUES (%s, %s, %s, %s)
                """,
                (target_song_id, user_id, level, opinion),
            )
            continue

        if not anon_id:
            continue
        cur.execute(
            f"""
            UPDATE {target_table}
            SET level = %s, opinion = %s, updated_at = NOW()
            WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
            """,
            (level, opinion, target_song_id, anon_id),
        )
        if cur.rowcount > 0:
            continue
        cur.execute(
            f"""
            INSERT INTO {target_table} (song_id, anon_id, level, opinion)
            VALUES (%s, %s, %s, %s)
            """,
            (target_song_id, anon_id, level, opinion),
        )


def mirror_perceived_delete(
    cur,
    server: ServerMode,
    song_id: int,
    user_id: int | None,
    anon_id: str | None,
) -> None:
    target_server = _counterpart(server)
    target_table = _perceived_table(target_server)
    target_song_ids = get_linked_counterpart_song_ids(cur, server, song_id)
    if not target_song_ids:
        return

    for target_song_id in target_song_ids:
        if user_id is not None:
            cur.execute(
                f"DELETE FROM {target_table} WHERE song_id = %s AND user_id = %s",
                (target_song_id, user_id),
            )
        if anon_id:
            cur.execute(
                f"""
                DELETE FROM {target_table}
                WHERE song_id = %s AND anon_id = %s AND user_id IS NULL
                """,
                (target_song_id, anon_id),
            )
