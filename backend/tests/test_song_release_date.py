import os
import unittest
from datetime import date
from unittest.mock import MagicMock, patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-song-release-date")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import songs


class SongReleaseDateTests(unittest.TestCase):
    def test_song_detail_returns_game_release_date(self):
        app = FastAPI()
        app.include_router(songs.router)
        cur = MagicMock()
        cur.fetchone.side_effect = [
            (1, "Song", "Artist", 8, 160, 159.8, 700, False, "2:00", "", "", False, None, False, 1234, date(2024, 7, 11)),
            (10,),
            (3,),
            None,
        ]

        with patch.object(songs, "get_conn") as db:
            db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = cur
            response = TestClient(app).get("/api/songs/1")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["game_release_date"], "2024-07-11")


if __name__ == "__main__":
    unittest.main()
