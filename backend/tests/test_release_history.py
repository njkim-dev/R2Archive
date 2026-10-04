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
    def test_release_history_groups_songs_by_date(self):
        app = FastAPI()
        app.include_router(release_history.router)
        cur = MagicMock()
        cur.fetchall.return_value = [
            (date(2026, 9, 30), "https://example.com/notice", "Song A", "Artist A", "rnr_image/img_music/a.bmp", [3, 4.5, 8]),
            (date(2026, 9, 30), "https://example.com/notice", "Song B", "Artist B", "rnr_image/img_music/b.bmp", [6]),
            (date(2026, 9, 17), None, "Song C", "Artist C", None, [7.5]),
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
                    "notice_url": "https://example.com/notice",
                    "songs": [
                        {"name": "Song A", "artist": "Artist A", "image": "rnr_image/img_music/a.bmp", "levels": [3.0, 4.5, 8.0]},
                        {"name": "Song B", "artist": "Artist B", "image": "rnr_image/img_music/b.bmp", "levels": [6.0]},
                    ],
                },
                {
                    "release_date": "2026-09-17",
                    "notice_url": None,
                    "songs": [{"name": "Song C", "artist": "Artist C", "image": None, "levels": [7.5]}],
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
