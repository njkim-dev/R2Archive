import os
import unittest
from datetime import date
from unittest.mock import MagicMock, patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-release-history")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import release_history


class ReleaseHistoryTests(unittest.TestCase):
    def test_release_and_delete_events_are_grouped_by_date(self):
        app = FastAPI()
        app.include_router(release_history.router)
        cur = MagicMock()
        notice_urls = ["https://example.com/delete", "https://example.com/release"]
        cur.fetchall.return_value = [
            (
                date(2026, 9, 30), notice_urls, "Song A", "Artist A",
                "rnr_image/img_music/a.bmp", "https://youtube.com/watch?v=aaaaaaaaaaa",
                False, [{"id": 10, "level": 3}, {"id": 11, "level": 4.5}, {"id": 12, "level": 8}],
            ),
            (
                date(2026, 9, 30), notice_urls, "Song B", "Artist B",
                "rnr_image/img_music/b.bmp", None, False, [{"id": 20, "level": 6}],
            ),
            (
                date(2026, 9, 30), notice_urls, "Old Song", "Artist D",
                None, "https://youtube.com/watch?v=ddddddddddd", True, [{"id": 40, "level": 5.5}],
            ),
            (
                date(2026, 9, 17), [], "Song C", "Artist C",
                None, None, False, [{"id": 30, "level": 7.5}],
            ),
        ]

        with patch.object(release_history, "get_conn") as db:
            db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = cur
            response = TestClient(app).get("/api/release-history")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            [
                {
                    "release_date": "2026-09-30",
                    "notice_url": "https://example.com/delete",
                    "notice_urls": notice_urls,
                    "songs": [
                        {
                            "name": "Song A", "artist": "Artist A",
                            "image": "rnr_image/img_music/a.bmp",
                            "youtube_url": "https://youtube.com/watch?v=aaaaaaaaaaa",
                            "is_deleted": False, "levels": [3.0, 4.5, 8.0],
                            "variants": [
                                {"id": 10, "level": 3.0},
                                {"id": 11, "level": 4.5},
                                {"id": 12, "level": 8.0},
                            ],
                        },
                        {
                            "name": "Song B", "artist": "Artist B",
                            "image": "rnr_image/img_music/b.bmp", "youtube_url": None,
                            "is_deleted": False, "levels": [6.0],
                            "variants": [{"id": 20, "level": 6.0}],
                        },
                        {
                            "name": "Old Song", "artist": "Artist D", "image": None,
                            "youtube_url": "https://youtube.com/watch?v=ddddddddddd",
                            "is_deleted": True, "levels": [5.5],
                            "variants": [{"id": 40, "level": 5.5}],
                        },
                    ],
                },
                {
                    "release_date": "2026-09-17", "notice_url": None, "notice_urls": [],
                    "songs": [
                        {
                            "name": "Song C", "artist": "Artist C", "image": None,
                            "youtube_url": None, "is_deleted": False, "levels": [7.5],
                            "variants": [{"id": 30, "level": 7.5}],
                        }
                    ],
                },
            ],
        )
        executed_sql = cur.execute.call_args.args[0]
        self.assertIn("SELECT delete_date AS event_date", executed_sql)
        self.assertIn("SELECT game_delete_date AS event_date", executed_sql)
        self.assertIn("JOIN notices n ON n.event_date = e.event_date", executed_sql)
        self.assertNotIn("LEFT JOIN notices", executed_sql)


if __name__ == "__main__":
    unittest.main()
