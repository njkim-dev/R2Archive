import inspect
import os
import sqlite3
import unittest
from contextlib import contextmanager
from unittest.mock import patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "domain-analytics-test-secret")
from fastapi import Response, HTTPException
from starlette.requests import Request
from routers import analytics


def request(host):
    visitor = "12345678-1234-4234-8234-123456789abc"
    cookie = analytics.ANALYTICS_VISITOR_COOKIE + "=" + analytics._signed_visitor_value(visitor)
    return Request({"type": "http", "method": "POST", "scheme": "https", "path": "/api/analytics/pageview", "query_string": b"", "headers": [(b"host", host.encode()), (b"cookie", cookie.encode()), (b"x-forwarded-host", b"attacker.example")]})


class SqliteCursor:
    def __init__(self, conn):
        self.cur = conn.cursor()

    def execute(self, query, params):
        self.cur.execute(query.replace("::int", "").replace("::text", "").replace("%s", "?").replace("%%", "%"), params)

    @property
    def description(self):
        return self.cur.description

    def fetchall(self):
        return self.cur.fetchall()

    def fetchone(self):
        return self.cur.fetchone()


class DomainAnalyticsTests(unittest.TestCase):
    def test_pageview_uses_trusted_request_host_and_strips_private_url_parts(self):
        for host in analytics.TRACKED_DOMAINS:
            self.assertEqual(analytics._pageview_path(request(host), "https://attacker.example/groups?token=secret#x"), f"https://{host}/groups")
        self.assertEqual(analytics._pageview_path(request("testserver"), "/?secret=x"), "/")
        self.assertEqual(analytics._pageview_path(request("MUSIC.R2ARCHIVE.COM:443"), "/"), "https://music.r2archive.com/")

    def test_domain_summary_remains_admin_only(self):
        with patch.object(analytics, "get_conn", side_effect=AssertionError("No DB access without admin")):
            with self.assertRaises(HTTPException) as error:
                analytics.analytics_summary(request("music.r2archive.com"))
        self.assertEqual(error.exception.status_code, 401)

    def test_two_domains_do_not_dedupe_the_same_visitor_and_path(self):
        seen = set()
        inserted = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, query, params):
                if "SELECT 1" in query and "FROM site_pageviews" in query:
                    self.found = params in seen
                elif "INSERT INTO site_pageviews" in query:
                    inserted.append(params)
                    seen.add((params[1], params[2]))
            def fetchone(self): return (1,) if self.found else None
        class Conn:
            def cursor(self): return Cursor()
            def commit(self): pass
        @contextmanager
        def connection(): yield Conn()
        endpoint = inspect.unwrap(analytics.create_pageview)
        body = analytics.PageviewCreate(path="/?private=value")
        with patch.object(analytics, "get_conn", connection), patch.object(analytics, "get_current_user_id", return_value=None), patch.object(analytics, "_cleanup_due", return_value=False):
            self.assertTrue(endpoint(request("r2archive.com"), Response(), body)["ok"])
            self.assertTrue(endpoint(request("music.r2archive.com"), Response(), body)["ok"])
            self.assertTrue(endpoint(request("music.r2archive.com"), Response(), body)["deduped"])
        self.assertEqual([row[2] for row in inserted], ["https://r2archive.com/", "https://music.r2archive.com/"])

    def test_domain_totals_legacy_bucket_and_transition_unique_visitors(self):
        with sqlite3.connect(":memory:") as db:
            db.execute("CREATE TABLE site_pageviews(path TEXT, user_id INTEGER, session_id TEXT, referrer TEXT, created_at TEXT)")
            rows = [
                ("https://r2archive.com/", None, "a", None, "2026-10-20"),
                ("https://music.r2archive.com/", None, "a", "https://r2archive.com", "2026-10-20"),
                ("https://music.r2archive.com/groups", None, "a", "https://r2archive.com/game-repair", "2026-10-20"),
                ("https://music.r2archive.com/", 1, "b", "https://r2archive.com", "2026-10-20"),
                ("https://music.r2archive.com/groups", 1, "c", "https://r2archive.com", "2026-10-20"),
                ("https://music.r2archive.com/", None, "direct", None, "2026-10-20"),
                ("https://music.r2archive.com/", None, "spoof", "https://r2archive.com.evil.example", "2026-10-20"),
                ("https://xyx.r2archive.com/", None, "a", None, "2026-10-20"),
                ("/", None, "legacy", "https://r2archive.com", "2026-10-20"),
                ("https://music.r2archive.com/", None, "old", "https://r2archive.com", "2026-10-19"),
            ]
            db.executemany("INSERT INTO site_pageviews VALUES (?, ?, ?, ?, ?)", rows)
            domains, transition = analytics._domain_summary(SqliteCursor(db), "2026-10-20")
        by_domain = {row["domain"]: row for row in domains}
        self.assertEqual(by_domain["music.r2archive.com"], {"domain": "music.r2archive.com", "pageviews": 6, "visitors": 4})
        self.assertEqual(by_domain["r2archive.com"]["visitors"], 1)
        self.assertEqual(by_domain["xyx.r2archive.com"]["visitors"], 1)
        self.assertEqual(by_domain["unknown"]["visitors"], 1)
        self.assertEqual(transition, {"visitors": 2})
