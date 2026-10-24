import asyncio
import inspect
import io
import os
import sqlite3
import tempfile
import threading
import unittest
import httpx
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SESSION_SECRET", "isolated-security-regression-secret-32-bytes")
os.environ.setdefault("DB_PORT", "5432")

from fastapi import FastAPI, HTTPException, UploadFile
from PIL import Image
from starlette.requests import Request

from models import ManualRecordsBulk, RecordCreate
from rate_limit import ip_key
from routers import analytics, groups, auth_oauth, parse_screenshot, personal_categories, records, users, xyx_categories
from work_capacity import WorkCapacity


def request(peer="127.0.0.1", forwarded=None):
    headers = [(b"host", b"music.r2archive.com")]
    if forwarded:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request({"type": "http", "method": "POST", "scheme": "https", "path": "/",
                    "query_string": b"", "headers": headers, "client": (peer, 1234)})


class DB:
    def __init__(self, *, visibility="private", show=False, same_group=False, member=None,
                 public=False, contributions=False, edits=False):
        self.visibility, self.show, self.same_group = visibility, show, same_group
        self.member, self.public = member, public
        self.contributions, self.edits = contributions, edits
        self.queries = []
        self.row = None

    def __enter__(self): return self
    def __exit__(self, *args): pass
    def cursor(self): return self
    def commit(self): pass

    def execute(self, sql, params=()):
        sql = " ".join(sql.split())
        self.queries.append(sql)
        if "FROM records r LEFT JOIN users" in sql:
            self.row = (1, "image.png", self.show, self.visibility)
        elif "FROM group_members" in sql:
            self.row = (1,) if self.same_group else None
        elif "AS song_count" in sql:
            self.row = (11, "category", self.public, "ABCD-EFGH", datetime.now(), 1,
                        "owner", 1, self.contributions, self.edits)
        elif "SELECT role" in sql:
            self.row = (self.member,) if self.member else None
        elif "SELECT is_admin" in sql:
            self.row = (False,)
        elif "SELECT id, name FROM" in sql:
            self.row = (1, "song")
        elif sql.startswith("INSERT INTO"):
            self.row = (datetime.now(),)
        elif sql.startswith("DELETE FROM"):
            self.row = (1,)
        else:
            raise AssertionError(sql)

    def fetchone(self): return self.row

    @contextmanager
    def connect(self): yield self


class ScreenshotAccessTests(unittest.TestCase):
    def test_ocr_preprocessing_preserves_recognition_and_rejects_invalid_images(self):
        image = io.BytesIO()
        Image.new("RGB", (100, 100), "white").save(image, format="PNG")
        with patch.object(parse_screenshot.pytesseract, "image_to_string", return_value="98.123") as ocr:
            self.assertEqual(parse_screenshot._parse_content(image.getvalue())["judgment_percent"], 98.123)
            self.assertEqual(ocr.call_count, 4)
            self.assertTrue(all(0 < call.kwargs["timeout"] <= 5 for call in ocr.call_args_list))
        self.assertIsNone(parse_screenshot._parse_content(b"not an image")["judgment_percent"])

    def test_canonical_images_strip_trailing_data_and_reject_invalid_dimensions(self):
        image = io.BytesIO()
        Image.new("RGB", (20, 20), "white").save(image, format="PNG")
        payload = b"untrusted-trailing-data"
        data, extension = records._canonical_image(image.getvalue() + payload)
        self.assertEqual(extension, "png")
        self.assertNotIn(payload, data)
        with Image.open(io.BytesIO(data)) as decoded:
            self.assertEqual(decoded.size, (20, 20))
        image = io.BytesIO()
        Image.new("RGB", (4001, 1), "white").save(image, format="PNG")
        with self.assertRaises(HTTPException) as caught:
            records._canonical_image(image.getvalue())
        self.assertEqual(caught.exception.status_code, 422)

    def test_visibility_and_sharing_are_enforced_before_serving(self):
        cases = [
            ("private", False, True, 2, 403),
            ("private", True, True, 2, 403),
            ("public", False, True, 2, 403),
            ("group", False, True, 2, 403),
            ("group", True, False, 2, 403),
            ("group", True, True, 2, 200),
            ("public", True, False, None, 200),
            ("private", False, False, 1, 200),
        ]
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "image.png").write_bytes(b"test")
            for visibility, show, same_group, viewer, expected in cases:
                with self.subTest(visibility=visibility, show=show, viewer=viewer, group=same_group):
                    db = DB(visibility=visibility, show=show, same_group=same_group)
                    with patch.object(records, "get_conn", db.connect), patch.object(
                        records, "get_current_user_id", return_value=viewer
                    ), patch.object(records, "_SCREENSHOTS_DIR", Path(folder)):
                        if expected == 403:
                            with self.assertRaises(HTTPException) as caught:
                                records.get_record_screenshot(request(), 1)
                            self.assertEqual(caught.exception.status_code, 403)
                        else:
                            response = records.get_record_screenshot(request(), 1)
                            self.assertEqual(response.status_code, 200)
                            self.assertIn("no-store", response.headers["cache-control"])


class CategoryAccessTests(unittest.TestCase):
    def test_private_mutations_require_membership_or_the_actual_share_code(self):
        for module, add, delete, model in [
            (personal_categories, personal_categories.add_song_to_personal_category,
             personal_categories.delete_song_from_personal_category, personal_categories.PersonalCategorySongCreate),
            (xyx_categories, xyx_categories.add_song_to_xyx_category,
             xyx_categories.delete_song_from_xyx_category, xyx_categories.XyxCategorySongCreate),
        ]:
            for operation in ("add", "delete"):
                for public, member, code, collaboration, expected in [
                    (False, None, None, True, 403),
                    (False, None, "ABCD-EFGJ", True, 403),
                    (False, None, "ABCD-EFGH", True, 200),
                    (False, "viewer", None, True, 200),
                    (False, None, "ABCD-EFGH", False, 403),
                    (False, "editor", None, False, 200),
                    (True, None, None, True, 200),
                    (True, None, None, False, 403),
                ]:
                    with self.subTest(module=module.__name__, op=operation, public=public, member=member, code=code):
                        db = DB(public=public, member=member, contributions=collaboration, edits=collaboration)
                        with patch.object(module, "get_conn", db.connect), patch.object(module, "require_user_id", return_value=2):
                            def call():
                                if operation == "add":
                                    return add(request(), 11, model(song_id=1), access_code=code)
                                return delete(request(), 11, 1, access_code=code)
                            if expected == 403:
                                with self.assertRaises(HTTPException) as caught:
                                    call()
                                self.assertEqual(caught.exception.status_code, 403)
                                self.assertFalse(any(q.startswith(("INSERT", "DELETE")) for q in db.queries))
                            else:
                                self.assertTrue(call()["ok"])


class ProxyAndRedirectTests(unittest.TestCase):
    def test_only_trusted_peers_can_supply_one_valid_ip(self):
        self.assertEqual(ip_key(request(forwarded="198.51.100.10")), "198.51.100.10")
        self.assertEqual(ip_key(request(forwarded="203.0.113.20")), "203.0.113.20")
        self.assertEqual(ip_key(request("198.51.100.11", "203.0.113.20")), "198.51.100.11")
        self.assertEqual(ip_key(request(forwarded="198.51.100.10, 203.0.113.20")), "127.0.0.1")
        self.assertEqual(ip_key(request(forwarded="invalid")), "127.0.0.1")

    def test_production_redirects_only_to_approved_https_origins(self):
        with patch.object(auth_oauth, "COOKIE_SECURE", True):
            for value in ["http://localhost:80@outside.invalid", "https://localhost:443@outside.invalid",
                          "http://127.0.0.1:5173", "https://music.r2archive.com.evil.invalid",
                          "https://music.r2archive.com/?redirect=evil"]:
                self.assertEqual(auth_oauth._safe_return_origin(value), auth_oauth.BASE_URL)
            self.assertEqual(auth_oauth._safe_return_origin("https://xyx.r2archive.com"), "https://xyx.r2archive.com")
        with patch.object(auth_oauth, "COOKIE_SECURE", False):
            self.assertEqual(auth_oauth._safe_return_origin("http://localhost:5173"), "http://localhost:5173")
            self.assertEqual(auth_oauth._safe_return_origin("http://localhost:80@outside.invalid"), auth_oauth.BASE_URL)
            self.assertEqual(auth_oauth._safe_return_origin("http://localhost:bad"), auth_oauth.BASE_URL)


class ResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_rate_limits_are_independent_and_spoofed_ips_do_not_reset_them(self):
        from slowapi import Limiter, _rate_limit_exceeded_handler
        from slowapi.errors import RateLimitExceeded
        app = FastAPI()
        limiter = Limiter(key_func=ip_key)
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        @app.get("/limited")
        @limiter.limit("2/minute")
        def endpoint(request: Request): return {"ok": True}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 1)),
                                     base_url="http://test") as client:
            for _ in range(2):
                self.assertEqual((await client.get("/limited", headers={"X-Forwarded-For": "198.51.100.10"})).status_code, 200)
            self.assertEqual((await client.get("/limited", headers={"X-Forwarded-For": "198.51.100.10"})).status_code, 429)
            self.assertEqual((await client.get("/limited", headers={"X-Forwarded-For": "203.0.113.20"})).status_code, 200)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("198.51.100.11", 1)),
                                     base_url="http://test") as client:
            statuses = [(await client.get("/limited", headers={"X-Forwarded-For": f"203.0.113.{i}"})).status_code for i in range(3)]
            self.assertEqual(statuses, [200, 200, 429])

    async def test_cancelled_ocr_keeps_its_slot_until_the_worker_finishes(self):
        started, release = threading.Event(), threading.Event()
        def slow_ocr(content):
            started.set()
            if not release.wait(5): raise AssertionError("worker not released")
            return {"judgment_percent": 98.0}
        cap = WorkCapacity(1)
        with patch.object(parse_screenshot, "require_user_id", return_value=1), patch.object(
            parse_screenshot, "_parse_content", side_effect=slow_ocr
        ), patch.object(parse_screenshot, "_OCR_CAPACITY", cap):
            task = asyncio.create_task(inspect.unwrap(parse_screenshot.parse_screenshot)(
                request(), UploadFile(file=io.BytesIO(b"image"))))
            try:
                for _ in range(100):
                    if started.is_set(): break
                    await asyncio.sleep(.005)
                self.assertTrue(started.is_set())
                task.cancel()
                await asyncio.sleep(.02)
                with self.assertRaises(HTTPException):
                    with cap.enter(2): pass
            finally:
                release.set()
                with self.assertRaises(asyncio.CancelledError): await task
        with cap.enter(2): pass

    async def test_ocr_does_not_block_other_async_work_and_rejects_duplicate_work(self):
        started, release = threading.Event(), threading.Event()
        def slow_ocr(content):
            started.set()
            if not release.wait(5): raise AssertionError("worker not released")
            return {"judgment_percent": 98.0}
        cap = WorkCapacity(1)
        with patch.object(parse_screenshot, "require_user_id", return_value=1), patch.object(
            parse_screenshot, "_parse_content", side_effect=slow_ocr
        ), patch.object(parse_screenshot, "_OCR_CAPACITY", cap):
            endpoint = inspect.unwrap(parse_screenshot.parse_screenshot)
            task = asyncio.create_task(endpoint(request(), UploadFile(file=io.BytesIO(b"image"))))
            try:
                for _ in range(100):
                    if started.is_set(): break
                    await asyncio.sleep(.005)
                self.assertTrue(started.is_set())
                self.assertFalse(task.done())
                for _ in range(3): await asyncio.sleep(.005)
                with self.assertRaises(HTTPException) as caught:
                    await endpoint(request(), UploadFile(file=io.BytesIO(b"other")))
                self.assertEqual(caught.exception.status_code, 429)
            finally:
                release.set()
                result = await task
            self.assertEqual(result["judgment_percent"], 98.0)
        with cap.enter(1): pass

    async def test_bulk_deduplicates_urls_limits_parallelism_and_releases_capacity(self):
        class StopBeforeDB(Exception): pass
        active = peak = calls = 0
        async def verify(url, client):
            nonlocal active, peak, calls
            active += 1
            calls += 1
            peak = max(peak, active)
            await asyncio.sleep(.005)
            active -= 1
            return True, "title"
        entries = [{"song_id": i + 1, "judgment_percent": 98,
                    "youtube_url": f"https://youtu.be/{i % 10:011d}"} for i in range(2000)]
        cap = WorkCapacity(1)
        with patch.object(users, "require_user_id", return_value=1), patch.object(users, "fetch_user",
             return_value={"nickname": "tester", "default_visibility": "public"}), patch.object(
             users, "_verify_youtube_url", side_effect=verify), patch.object(
             users, "get_conn", side_effect=StopBeforeDB), patch.object(users, "_MANUAL_CAPACITY", cap):
            with self.assertRaises(StopBeforeDB):
                await inspect.unwrap(users.save_manual_records)(request(), ManualRecordsBulk(entries=entries))
        self.assertEqual(calls, 10)
        self.assertLessEqual(peak, 4)
        with cap.enter(1): pass


class RankingEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_anonymous_judgment_is_rejected_before_database_access(self):
        with patch.object(records, "get_current_user_id", return_value=None), patch.object(
            records, "get_conn", side_effect=AssertionError("DB must not be used")
        ):
            with self.assertRaises(HTTPException) as caught:
                await inspect.unwrap(records.add_record)(request(), 1, RecordCreate(nickname="forged", judgment_percent=99))
            self.assertEqual(caught.exception.status_code, 401)

    async def test_song_ranking_excludes_anonymous_unproven_and_manual_records(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript('''
          CREATE TABLE users(id INTEGER PRIMARY KEY, nickname TEXT, show_screenshot BOOLEAN);
          CREATE TABLE records(id INTEGER PRIMARY KEY, song_id INTEGER, user_id INTEGER, anon_id TEXT,
            nickname TEXT, score INTEGER, judgment_percent REAL, combo INTEGER, youtube_url TEXT,
            youtube_title TEXT, memo TEXT, visibility TEXT, created_at TEXT, screenshot_path TEXT,
            memo_public BOOLEAN, is_manual BOOLEAN, speed TEXT, is_play_video BOOLEAN);
          INSERT INTO users VALUES(1, 'verified', 1);
          INSERT INTO users VALUES(2, 'unproven', 0);
          INSERT INTO users VALUES(3, 'manual', 0);
          INSERT INTO records VALUES(1,1,NULL,'anon','forged',NULL,99,NULL,NULL,NULL,NULL,'public',
            '2026-10-24 00:00:00',NULL,0,0,'ultra',0);
          INSERT INTO records VALUES(2,1,2,NULL,'unproven',NULL,99,NULL,NULL,NULL,NULL,'public',
            '2026-10-24 00:00:00',NULL,0,0,'ultra',0);
          INSERT INTO records VALUES(3,1,3,NULL,'manual',NULL,99,NULL,'https://youtu.be/abcdefghijk',NULL,NULL,'public',
            '2026-10-24 00:00:00',NULL,0,1,'ultra',0);
          INSERT INTO records VALUES(4,1,1,NULL,'verified',NULL,98,NULL,NULL,NULL,NULL,'public',
            '2026-10-24 00:00:00','proof.png',0,0,'ultra',0);
        ''')
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params):
                self.cur = conn.execute(sql.replace('%s', '?').replace('r.user_id::text', 'CAST(r.user_id AS TEXT)'), params)
            def fetchall(self): return self.cur.fetchall()
        class Connection:
            def cursor(self): return Cursor()
        @contextmanager
        def connect(): yield Connection()
        try:
            with patch.object(records, "get_conn", connect), patch.object(records, "ensure_active_song"), patch.object(
                records, "get_current_user_id", return_value=None
            ):
                result = records.get_ranking(request(), 1)
            self.assertEqual([row.id for row in result], [4])
        finally:
            conn.close()


class AnalyticsVisitorTests(unittest.TestCase):
    def test_bootstrap_keys_use_trusted_client_ip_and_ignore_untrusted_spoofing(self):
        with patch.object(analytics, "get_current_user_id", return_value=None), patch.object(
            analytics, "_visitor_id_from_cookie", return_value=None
        ):
            key = analytics._analytics_client_key
            self.assertNotEqual(key(request(forwarded="203.0.113.1")), key(request(forwarded="203.0.113.2")))
            self.assertEqual(key(request("198.51.100.1", "203.0.113.1")), key(request("198.51.100.1", "203.0.113.2")))
            self.assertEqual(key(request(forwarded="203.0.113.1, 203.0.113.2")), key(request()))

    def test_authenticated_and_signed_visitor_keys_remain_stable_across_ips(self):
        for user, visitor, expected in [(7, None, "analytics:user:7"), (None, "signed-visitor", "analytics:visitor:signed-visitor")]:
            with self.subTest(user=user), patch.object(analytics, "get_current_user_id", return_value=user), patch.object(
                analytics, "_visitor_id_from_cookie", return_value=visitor
            ):
                for address in ("203.0.113.1", "203.0.113.2"):
                    self.assertEqual(analytics._analytics_client_key(request(forwarded=address)), expected)


class GroupFeedAccessTests(unittest.TestCase):
    def test_feed_links_agree_with_file_endpoint_for_every_access_combination(self):
        for visibility in ("private", "group", "public"):
            for show in (False, True):
                for shares_group in (False, True):
                    for viewer in (1, 2):
                        with self.subTest(visibility=visibility, show=show, shares_group=shares_group, viewer=viewer):
                            expected = viewer == 1 or (show and (visibility == "public" or (visibility == "group" and shares_group)))
                            db = DB(visibility=visibility, show=show, same_group=shares_group)
                            feed_row = ("score", datetime.now(), 1, "Owner", None, 11, "Song", 99.0,
                                        1, "image.png", "https://youtu.be/test", show, visibility, shares_group)
                            with patch.object(groups, "get_conn", db.connect), patch.object(groups, "require_user_id", return_value=viewer), patch.object(
                                groups, "_ensure_member_or_admin"
                            ), patch.object(db, "execute") as execute, patch.object(db, "fetchall", return_value=[feed_row], create=True):
                                feed = groups.get_group_feed(request(), 10)
                                self.assertEqual(execute.call_args.args[1], (10, viewer, 10, 80))
                            self.assertEqual(bool(feed[0]["screenshot_url"]), expected)
                            self.assertEqual(bool(feed[0]["youtube_url"]), expected)
                            with tempfile.TemporaryDirectory() as folder:
                                Path(folder, "image.png").write_bytes(b"test")
                                with patch.object(records, "get_conn", db.connect), patch.object(records, "get_current_user_id", return_value=viewer), patch.object(
                                    records, "_SCREENSHOTS_DIR", Path(folder)
                                ):
                                    if expected:
                                        self.assertEqual(records.get_record_screenshot(request(), 1).status_code, 200)
                                    else:
                                        with self.assertRaises(HTTPException) as caught:
                                            records.get_record_screenshot(request(), 1)
                                        self.assertEqual(caught.exception.status_code, 403)


if __name__ == "__main__": unittest.main()
