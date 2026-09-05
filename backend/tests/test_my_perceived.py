import os
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-perceived")

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth import SESSION_COOKIE, SESSION_SECRET
from routers import perceived, songs


class MyPerceivedTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(songs.router)
        app.include_router(perceived.router)
        self.client = TestClient(app)
        self.db_patch = patch.object(perceived, "get_conn")
        self.db = self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.cursor = MagicMock()
        self.db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = self.cursor

    def login(self, user_id):
        token = jwt.encode({"sub": str(user_id)}, SESSION_SECRET, algorithm="HS256")
        self.client.cookies.set(SESSION_COOKIE, token)

    def test_anonymous_cannot_supply_user_or_anon_id(self):
        response = self.client.get("/api/songs/perceived/mine?user_id=7&anon_id=known-id")
        self.assertEqual(response.status_code, 401)
        self.db.assert_not_called()

    def test_invalid_session_cannot_read_votes(self):
        self.client.cookies.set(SESSION_COOKIE, "invalid")
        self.assertEqual(self.client.get("/api/songs/perceived/mine").status_code, 401)
        self.db.assert_not_called()

    def test_reads_only_session_user_in_one_query_and_never_caches(self):
        self.login(7)
        self.cursor.fetchall.return_value = [(101, Decimal("7.5")), (102, Decimal("8.0"))]
        response = self.client.get("/api/songs/perceived/mine?user_id=99")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"101": 7.5, "102": 8.0})
        self.cursor.execute.assert_called_once_with(
            "SELECT song_id, level FROM perceived_difficulty WHERE user_id = %s", (7,)
        )
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["vary"], "Cookie")

    def test_account_without_votes_returns_empty_mapping(self):
        self.login(8)
        self.cursor.fetchall.return_value = []
        response = self.client.get("/api/songs/perceived/mine")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})
        self.assertEqual(self.cursor.execute.call_args.args[1], (8,))


if __name__ == "__main__":
    unittest.main()
