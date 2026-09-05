import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-ai-artists")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_artists import is_ai_artist, load_ai_artists, normalize_artist_name
from routers import songs, xyx_songs


class AiArtistTests(unittest.TestCase):
    def test_names_are_normalized_but_not_fuzzy_matched(self):
        self.assertEqual(normalize_artist_name("  High Note  "), "high note")
        self.assertEqual(normalize_artist_name("\uff36\uff21\uff2c\uff2f\uff26\uff25"), "valofe")
        self.assertTrue(is_ai_artist("VALOFE", {"valofe"}))
        self.assertFalse(is_ai_artist("VALOFE Remix", {"valofe"}))
        self.assertFalse(is_ai_artist(None, {"valofe"}))

    def test_table_changes_are_read_again_without_a_process_restart(self):
        cur = MagicMock()
        cur.fetchall.side_effect = [[("VALOFE",)], [("New Artist",)], []]
        self.assertEqual(load_ai_artists(cur), {"valofe"})
        self.assertEqual(load_ai_artists(cur), {"new artist"})
        self.assertEqual(load_ai_artists(cur), set())
        self.assertEqual(cur.execute.call_count, 3)
        cur.execute.assert_called_with("SELECT artist_name FROM ai_artists")

    def test_all_four_list_endpoints_use_one_table_read_per_request(self):
        for module, prefix in [(songs, "/api"), (xyx_songs, "/api/xyx")]:
            for suffix in ["/songs", "/songs/removed"]:
                with self.subTest(path=prefix + suffix):
                    app = FastAPI()
                    app.include_router(module.router)
                    client = TestClient(app)
                    cur = MagicMock()
                    registered = ["VALOFE", "New Artist"]
                    artists = [" valofe ", "New Artist", "MAZO"]
                    if module is songs:
                        rows = [(i, f"Song {i}", artist, 8, 160, None, 700, False,
                                 "2:00", "", "", False, i, None, "", [], [], None)
                                for i, artist in enumerate(artists, 1)]
                    else:
                        rows = [(i, f"Song {i}", "", artist, 8, 160, 700, None,
                                 "2:00", "", "", False, i, None, [], [], None)
                                for i, artist in enumerate(artists, 1)]

                    def execute(query, params=None):
                        if query == "SELECT artist_name FROM ai_artists":
                            cur.fetchall.return_value = [(name,) for name in registered]
                        elif "SELECT s.id, s.name" in query:
                            cur.fetchall.return_value = rows
                        else:
                            cur.fetchall.return_value = []

                    cur.execute.side_effect = execute
                    with patch.object(module, "get_conn") as db, patch.object(module, "require_admin"):
                        db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = cur
                        for names, expected in [
                            (["VALOFE", "New Artist"], [True, True, False]),
                            (["MAZO"], [False, False, True]),
                            ([], [False, False, False]),
                        ]:
                            registered[:] = names
                            cur.execute.reset_mock()
                            response = client.get(prefix + suffix)
                            self.assertEqual(response.status_code, 200, response.text)
                            self.assertEqual([item["is_ai"] for item in response.json()], expected)
                            reads = [call for call in cur.execute.call_args_list
                                     if call.args[0] == "SELECT artist_name FROM ai_artists"]
                            self.assertEqual(len(reads), 1)

    def test_removed_list_still_requires_authentication(self):
        for module, path in [(songs, "/api/songs/removed"), (xyx_songs, "/api/xyx/songs/removed")]:
            with self.subTest(path=path):
                app = FastAPI()
                app.include_router(module.router)
                with patch.object(module, "get_conn") as db:
                    response = TestClient(app).get(path)
                    self.assertIn(response.status_code, (401, 403))
                    db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
