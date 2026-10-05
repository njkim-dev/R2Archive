import os
import inspect
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import BackgroundTasks

from discord_notifications import (
    build_feedback_item_notification,
    build_song_feedback_notification,
    send_discord_notification,
)
from routers import feedback, feedback_items


class _Response:
    def __init__(self):
        self.checked = False

    def raise_for_status(self):
        self.checked = True


class _Client:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url, json):
        self.calls.append((url, json))
        return self.response


class _Cursor:
    def __init__(self, rows):
        self.rows = iter(rows)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, *_args):
        return None

    def fetchone(self):
        return next(self.rows)


class _Connection:
    def __init__(self, rows):
        self.cursor_instance = _Cursor(rows)
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True


class DiscordNotificationTests(unittest.IsolatedAsyncioTestCase):
    def test_both_feedback_endpoints_schedule_notifications(self):
        song_connection = _Connection([("Song", "Artist", 8.5), (101,)])
        song_tasks = BackgroundTasks()
        song_endpoint = inspect.unwrap(feedback.submit_feedback)
        with (
            patch.object(feedback, "get_conn", return_value=song_connection),
            patch.object(feedback, "ensure_active_song"),
        ):
            result = song_endpoint(
                request=None,
                song_id=56,
                body=feedback.FeedbackCreate(
                    anon_id="anonymous-user",
                    type="bpm",
                    body="BPM이 달라요",
                ),
                background_tasks=song_tasks,
            )

        self.assertEqual(result, {"ok": True})
        self.assertTrue(song_connection.committed)
        self.assertEqual(len(song_tasks.tasks), 1)
        self.assertIs(song_tasks.tasks[0].func, send_discord_notification)

        item_connection = _Connection([(202, datetime.now(timezone.utc))])
        item_tasks = BackgroundTasks()
        item_endpoint = inspect.unwrap(feedback_items.create_feedback)
        with (
            patch.object(feedback_items, "get_conn", return_value=item_connection),
            patch.object(feedback_items, "require_user_id", return_value=7),
            patch.object(feedback_items, "fetch_user", return_value={"nickname": "tester"}),
        ):
            result = item_endpoint(
                request=None,
                body=feedback_items.FeedbackCreate(
                    tab="feature",
                    type="search",
                    title="검색 개선",
                    body="검색 옵션을 추가해주세요",
                ),
                background_tasks=item_tasks,
            )

        self.assertEqual(result["id"], 202)
        self.assertTrue(item_connection.committed)
        self.assertEqual(len(item_tasks.tasks), 1)
        self.assertIs(item_tasks.tasks[0].func, send_discord_notification)

    def test_feedback_item_message_disables_mentions(self):
        payload = build_feedback_item_notification(
            feedback_id=12,
            tab="bug",
            type_="ui",
            title="화면 오류",
            body="@everyone 확인해주세요",
            severity="high",
            author="tester",
            song_title="Test Song",
        )

        self.assertEqual(payload["allowed_mentions"], {"parse": []})
        self.assertIn("버그 신고 #12", payload["embeds"][0]["title"])
        self.assertEqual(payload["embeds"][0]["description"], "@everyone 확인해주세요")

    def test_song_feedback_message_links_to_catalog(self):
        payload = build_song_feedback_notification(
            feedback_id=34,
            song_id=56,
            song_name="Song",
            artist="Artist",
            level=8.5,
            type_="bpm",
            body="BPM이 달라요",
        )

        embed = payload["embeds"][0]
        self.assertEqual(embed["url"], "https://music.r2archive.com/#song=56")
        self.assertEqual(embed["fields"][1]["value"], "Lv 8.5")
        self.assertEqual(embed["fields"][2]["value"], "BPM 정보")

    async def test_sender_posts_to_configured_discord_webhook(self):
        response = _Response()
        client = _Client(response)
        payload = {"content": "test"}
        with (
            patch.dict(os.environ, {"DISCORD_WEB_HOOK": "https://discord.com/api/webhooks/1/token"}),
            patch("discord_notifications.httpx.AsyncClient", return_value=client),
        ):
            await send_discord_notification(payload)

        self.assertEqual(client.calls, [("https://discord.com/api/webhooks/1/token", payload)])
        self.assertTrue(response.checked)

    async def test_sender_ignores_non_discord_urls(self):
        response = _Response()
        client = _Client(response)
        with (
            patch.dict(os.environ, {"DISCORD_WEB_HOOK": "https://example.com/api/webhooks/1/token"}),
            patch("discord_notifications.httpx.AsyncClient", return_value=client),
        ):
            await send_discord_notification({"content": "test"})

        self.assertEqual(client.calls, [])


if __name__ == "__main__":
    unittest.main()
