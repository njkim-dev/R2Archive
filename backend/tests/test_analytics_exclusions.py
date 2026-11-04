import inspect
import os
import sqlite3
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

os.environ.setdefault('DB_PORT', '5432')
os.environ.setdefault('SESSION_SECRET', 'analytics-exclusions-test-secret')

from fastapi import Response
from starlette.requests import Request
from routers import analytics
from tests.test_domain_analytics import SqliteCursor


def request(headers=(), signed=True):
    values = [(b'host', b'r2archive.com'), *headers]
    if signed:
        visitor = '12345678-1234-4234-8234-123456789abc'
        values.append((b'cookie', (analytics.ANALYTICS_VISITOR_COOKIE + '=' + analytics._signed_visitor_value(visitor)).encode()))
    return Request({'type': 'http', 'method': 'POST', 'scheme': 'https', 'path': '/api/analytics/pageview', 'query_string': b'', 'headers': values})


def endpoints():
    return [(inspect.unwrap(analytics.create_pageview), analytics.PageviewCreate(path='/music/')),
            (inspect.unwrap(analytics.create_catalog_view), analytics.SongCatalogViewCreate(song_id=1, server='kr'))]


class AnalyticsExclusionTests(unittest.TestCase):
    def test_automation_is_ignored_before_bootstrap_and_database_access(self):
        for headers in [[(b'x-r2archive-test', b'1')], [(b'user-agent', b'Mozilla/5.0 HeadlessChrome/130')],
                        [(b'user-agent', b'Playwright/1.0')], [(b'user-agent', b'R2Archive-Codex-Test/1.0')]]:
            for signed in [False, True]:
                for endpoint, body in endpoints():
                    with self.subTest(headers=headers, signed=signed, endpoint=endpoint.__name__):
                        response = Response()
                        with patch.object(analytics, 'get_conn', side_effect=AssertionError('Automation must not access the database')):
                            self.assertEqual(endpoint(request(headers, signed), response, body), {'ok': True, 'ignored': 'automation'})
                        self.assertNotIn('set-cookie', response.headers)

    def test_admin_visits_do_not_insert_visits_or_increment_song_counts(self):
        for endpoint, body in endpoints():
            conn, cursor = MagicMock(), MagicMock()
            conn.cursor.return_value.__enter__.return_value = cursor
            cursor.fetchone.return_value = (True,)
            @contextmanager
            def connection(): yield conn
            with patch.object(analytics, 'get_conn', connection), patch.object(analytics, 'get_current_user_id', return_value=7):
                self.assertEqual(endpoint(request(), Response(), body), {'ok': True, 'ignored': 'admin'})
            self.assertEqual([call.args[0] for call in cursor.execute.call_args_list], ['SELECT is_admin FROM users WHERE id = %s'])

    def test_regular_members_still_record_pageviews_and_catalog_views(self):
        for endpoint, body in endpoints():
            conn, cursor = MagicMock(), MagicMock()
            conn.cursor.return_value.__enter__.return_value = cursor
            cursor.fetchone.side_effect = [(False,), None, (1,)]
            @contextmanager
            def connection(): yield conn
            with patch.object(analytics, 'get_conn', connection), patch.object(analytics, 'get_current_user_id', return_value=8), patch.object(analytics, '_cleanup_due', return_value=False):
                self.assertTrue(endpoint(request([(b'user-agent', b'Mozilla/5.0 Chrome/130')]), Response(), body)['ok'])
            queries = [call.args[0] for call in cursor.execute.call_args_list]
            self.assertTrue(any('INSERT INTO ' in query for query in queries))
            if endpoint.__name__ == 'create_catalog_view':
                self.assertTrue(any('catalog_view_count = catalog_view_count + 1' in query for query in queries))

    def test_existing_automated_visits_are_excluded_from_totals_referrals_and_recent(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE users(id INTEGER PRIMARY KEY, nickname TEXT)')
            db.execute('CREATE TABLE site_pageviews(id INTEGER PRIMARY KEY, created_at TEXT, path TEXT, server TEXT, device TEXT, user_id INTEGER, session_id TEXT, referrer TEXT, user_agent TEXT)')
            for index, agent in enumerate([None, 'Mozilla/5.0 Chrome/130', 'HeadlessChrome/130', 'Playwright/1.0', 'R2Archive-Codex-Test/1.0'], 1):
                db.execute('INSERT INTO site_pageviews VALUES(?,?,?,?,?,?,?,?,?)', (index, '2026-11-04', 'https://r2archive.com/music/', 'kr', 'desktop', None, str(index), 'https://r2archive.com/', agent))
            domains, transition = analytics._domain_summary(SqliteCursor(db), '2026-11-04')
            self.assertEqual(domains, [{'domain': 'music.r2archive.com', 'pageviews': 2, 'visitors': 2}])
            self.assertEqual(transition, {'visitors': 2})
            self.assertEqual([row['session_id'] for row in analytics._recent_pageviews(SqliteCursor(db))], ['2', '1'])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM site_pageviews').fetchone()[0], 5)
