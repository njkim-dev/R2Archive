import os
import sqlite3
import time
import unittest
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

os.environ.setdefault("SESSION_SECRET", "isolated-attachment-privacy-test-secret")
os.environ.setdefault("DB_PORT", "5432")

import httpx
import jwt
from fastapi import FastAPI

from auth import SESSION_COOKIE, SESSION_SECRET
from routers import records


class RecordAttachmentPrivacyTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_responses_enforce_attachment_sharing_and_explicit_video_publication(self):
        conn = sqlite3.connect(":memory:", check_same_thread=False)
        conn.executescript("""
            CREATE TABLE users(id INTEGER PRIMARY KEY, nickname TEXT, show_screenshot BOOLEAN);
            CREATE TABLE group_members(group_id INTEGER, user_id INTEGER);
            CREATE TABLE achievements(id INTEGER, song_id INTEGER, nickname TEXT, youtube_url TEXT,
                description TEXT, created_at TEXT);
            CREATE TABLE records(id INTEGER PRIMARY KEY, song_id INTEGER, user_id INTEGER, anon_id TEXT,
                nickname TEXT, score INTEGER, judgment_percent REAL, combo INTEGER, youtube_url TEXT,
                youtube_title TEXT, memo TEXT, visibility TEXT, created_at TEXT, screenshot_path TEXT,
                memo_public BOOLEAN, is_manual BOOLEAN, speed TEXT, is_play_video BOOLEAN);
            INSERT INTO users VALUES(1, 'Owner', 0), (2, 'Groupmate', 0), (3, 'Outsider', 0);
            INSERT INTO group_members VALUES(10, 1), (10, 2);
        """)

        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params):
                self.cur = conn.execute(sql.replace("%s", "?").replace("r.user_id::text", "CAST(r.user_id AS TEXT)").replace("::text", ""), params)
            def fetchall(self):
                return [tuple(
                    datetime.fromisoformat(value) if column[0] == "created_at" and isinstance(value, str) else value
                    for column, value in zip(self.cur.description, row)
                ) for row in self.cur.fetchall()]

        class Connection:
            def cursor(self): return Cursor()

        @contextmanager
        def connect(): yield Connection()

        app = FastAPI()
        app.include_router(records.router)
        try:
            with patch.object(records, "get_conn", connect), patch.object(records, "ensure_active_song"):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="https://testserver") as client:
                    for visibility in ("public", "group", "private"):
                        for shared in (False, True):
                            for explicit in (False, True):
                                for viewer in (None, 1, 2, 3):
                                    for endpoint in ("ranking", "records", "records/me", "play-videos"):
                                        with self.subTest(visibility=visibility, shared=shared, explicit=explicit, viewer=viewer, endpoint=endpoint):
                                            conn.execute("UPDATE users SET show_screenshot=? WHERE id=1", (shared,))
                                            conn.execute("DELETE FROM records")
                                            conn.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                                                1, 1, 1, None, "Owner", 100, 99 if endpoint == "ranking" else None,
                                                100, "https://youtu.be/abcdefghijk", "Attachment title", "Memo",
                                                visibility, "2026-10-24 00:00:00", "proof.png", False, False, "ultra", explicit,
                                            ))
                                            client.cookies.clear()
                                            if viewer is not None:
                                                token = jwt.encode({"sub": str(viewer), "exp": int(time.time()) + 60}, SESSION_SECRET, algorithm="HS256")
                                                client.cookies.set(SESSION_COOKIE, token)
                                            response = await client.get(f"/api/songs/1/{endpoint}")
                                            if endpoint == "records/me" and viewer is None:
                                                self.assertEqual(response.status_code, 401)
                                                continue
                                            self.assertEqual(response.status_code, 200)
                                            expected_rows = (
                                                visibility == "public" if endpoint == "ranking" else
                                                viewer == 1 if endpoint == "records/me" else
                                                explicit if endpoint == "play-videos" else
                                                explicit or visibility == "public" or viewer == 1 or (visibility == "group" and viewer == 2)
                                            )
                                            data = response.json()
                                            self.assertEqual(len(data), int(bool(expected_rows)))
                                            if not data:
                                                continue
                                            allowed = viewer == 1 or shared or explicit
                                            self.assertEqual(data[0]["youtube_url"], "https://youtu.be/abcdefghijk" if allowed else None)
                                            self.assertEqual(data[0]["youtube_title"], "Attachment title" if allowed else None)
                                            if endpoint == "play-videos":
                                                continue
                                            self.assertEqual(data[0]["is_mine"], viewer == 1)
                                            if not shared and viewer != 1:
                                                self.assertIsNone(data[0]["screenshot_url"])
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
