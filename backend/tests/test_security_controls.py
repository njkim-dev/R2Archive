import inspect
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-security-controls")

from fastapi import Response
from starlette.requests import Request

from record_policy import SCREENSHOT_RECORD_ELIGIBLE_SQL
from routers import analytics, auth_oauth
from security_middleware import _has_session_cookie, _trusted_request_source


def make_request(cookie: str | None = None, host: str = "music.r2archive.com") -> Request:
    headers = [(b"host", host.encode("ascii")), (b"user-agent", b"security-test")]
    if cookie:
        headers.append((b"cookie", cookie.encode("ascii")))
    return Request({
        "type": "http",
        "method": "POST",
        "scheme": "https",
        "path": "/api/analytics/pageview",
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": (host, 443),
    })


class AnalyticsSecurityTests(unittest.TestCase):
    def test_bootstrap_ignores_client_session_and_does_not_open_db(self):
        body = analytics.PageviewCreate.model_validate({
            "session_id": "attacker-controlled",
            "path": "/groups?a=1#song=3",
        })
        response = Response()
        endpoint = inspect.unwrap(analytics.create_pageview)

        with patch.object(analytics, "get_conn", side_effect=AssertionError("DB must not be used")):
            result = endpoint(make_request(), response, body)

        self.assertEqual(result, {"ok": True, "bootstrap": True})
        self.assertNotIn("session_id", body.model_fields_set)
        cookie_header = response.headers["set-cookie"]
        cookie_value = cookie_header.split(";", 1)[0]
        request = make_request(cookie_value)
        visitor_id = analytics._visitor_id_from_cookie(request)
        self.assertIsNotNone(visitor_id)
        self.assertEqual(len(visitor_id), 36)

    def test_catalog_view_bootstrap_does_not_open_db(self):
        body = analytics.SongCatalogViewCreate.model_validate({
            "song_id": 123,
            "server": "kr",
        })
        response = Response()
        endpoint = inspect.unwrap(analytics.create_catalog_view)

        with patch.object(analytics, "get_conn", side_effect=AssertionError("DB must not be used")):
            result = endpoint(make_request(), response, body)

        self.assertEqual(result, {"ok": True, "bootstrap": True})
        cookie_header = response.headers["set-cookie"]
        cookie_value = cookie_header.split(";", 1)[0]
        request = make_request(cookie_value)
        self.assertIsNotNone(analytics._visitor_id_from_cookie(request))

    def test_visitor_cookie_rejects_tampering(self):
        visitor_id = "12345678-1234-4234-8234-123456789abc"
        value = analytics._signed_visitor_value(visitor_id)
        valid = make_request(f"{analytics.ANALYTICS_VISITOR_COOKIE}={value}")
        replacement = "0" if value[-1] != "0" else "1"
        tampered = make_request(f"{analytics.ANALYTICS_VISITOR_COOKIE}={value[:-1]}{replacement}")
        self.assertEqual(analytics._visitor_id_from_cookie(valid), visitor_id)
        self.assertIsNone(analytics._visitor_id_from_cookie(tampered))

    def test_path_discards_query_fragment_and_origin(self):
        self.assertEqual(analytics._clean_path("/groups?a=1#song=3"), "/groups")
        self.assertEqual(
            analytics._clean_path("https://music.r2archive.com/groups/1?tab=rank#x"),
            "/groups/1",
        )
        self.assertEqual(
            analytics._clean_referrer("https://Example.com:443/path?token=secret#x"),
            "https://example.com/path",
        )
        self.assertEqual(
            analytics._clean_referrer("https://Example.com:443/?token=secret#x"),
            "https://example.com",
        )


class RecordPolicySecurityTests(unittest.TestCase):
    def test_group_leaderboard_policy_requires_owned_evidence(self):
        screenshot_only = " ".join(SCREENSHOT_RECORD_ELIGIBLE_SQL.split())
        self.assertIn("NOT r.is_manual", screenshot_only)
        self.assertIn("r.user_id IS NOT NULL", screenshot_only)
        self.assertIn("r.screenshot_path IS NOT NULL", screenshot_only)


class OAuthCookieSecurityTests(unittest.TestCase):
    def test_oauth_temporary_cookies_are_host_only(self):
        request = make_request()
        cases = (
            (auth_oauth.STATE_COOKIE, lambda response: auth_oauth._set_state_cookie(response, "state-value", request)),
            (auth_oauth.REMEMBER_COOKIE, lambda response: auth_oauth._set_remember_cookie(response, True, request)),
            (auth_oauth.RETURN_COOKIE, lambda response: auth_oauth._set_return_cookie(response, request)),
        )

        for cookie_name, setter in cases:
            with self.subTest(cookie=cookie_name):
                response = Response()
                setter(response)
                headers = [
                    value.decode("latin-1")
                    for name, value in response.raw_headers
                    if name.lower() == b"set-cookie"
                ]
                active = [
                    header for header in headers
                    if header.startswith(f"{cookie_name}=") and "Max-Age=0" not in header
                ]
                legacy_delete = [
                    header for header in headers
                    if header.startswith(f"{cookie_name}=")
                    and "Max-Age=0" in header
                    and "domain=.r2archive.com" in header.lower()
                ]

                self.assertEqual(len(active), 1)
                self.assertNotIn("domain=", active[0].lower())
                self.assertIn("httponly", active[0].lower())
                self.assertIn("secure", active[0].lower())
                self.assertEqual(len(legacy_delete), 1)

    def test_secondary_host_login_is_centralized_before_state_cookie(self):
        response = auth_oauth._central_login_redirect(
            "google",
            make_request(host="xyx.r2archive.com"),
            remember=True,
        )

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.headers["location"],
            "https://music.r2archive.com/api/auth/google/login?remember=1&return_origin=https%3A%2F%2Fxyx.r2archive.com",
        )
        self.assertNotIn("set-cookie", response.headers)


class CSRFSecurityTests(unittest.TestCase):
    def test_cookie_authenticated_request_requires_trusted_origin(self):
        self.assertTrue(_has_session_cookie("r2b_session=token; other=value"))
        self.assertTrue(_trusted_request_source("https://music.r2archive.com", None))
        self.assertTrue(_trusted_request_source(None, "https://xyx.r2archive.com/page"))
        self.assertFalse(_trusted_request_source("https://attacker.example", None))
        self.assertFalse(_trusted_request_source("https://evil.r2archive.com", None))
        self.assertFalse(_trusted_request_source(None, None))

    def test_anonymous_cookie_header_does_not_trigger_session_csrf_path(self):
        self.assertFalse(_has_session_cookie("visitor_id=value"))



if __name__ == "__main__":
    unittest.main()
