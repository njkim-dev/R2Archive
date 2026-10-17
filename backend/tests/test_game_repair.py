import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import game_repair


class GameRepairTests(unittest.TestCase):
    def test_only_current_allowlisted_snapshot_files_are_downloadable(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "10659-test").mkdir()
            (root / "10659-test" / "hv.dll").write_bytes(b"reference")
            (root / "10659-test" / "config.ini").write_text("private")
            manifest = {"version": "10659", "snapshot": "10659-test", "files": [{"name": "hv.dll", "size": 9}]}
            (root / "manifest.json").write_text(json.dumps(manifest))
            app = FastAPI()
            app.include_router(game_repair.router)
            with patch.object(game_repair, "REPAIR_DIR", root):
                client = TestClient(app)
                self.assertEqual(client.get("/api/game-repair/manifest").json(), manifest)
                self.assertEqual(client.get("/api/game-repair/files/10659-test/hv.dll").content, b"reference")
                self.assertEqual(client.get("/api/game-repair/files/old/hv.dll").status_code, 409)
                self.assertEqual(client.get("/api/game-repair/files/10659-test/config.ini").status_code, 404)
                (root / "10659-test" / "hv.dll").write_bytes(b"short")
                self.assertEqual(client.get("/api/game-repair/files/10659-test/hv.dll").status_code, 503)

    def test_unprepared_reference_returns_unavailable(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(game_repair, "REPAIR_DIR", Path(folder)):
            app = FastAPI()
            app.include_router(game_repair.router)
            self.assertEqual(TestClient(app).get("/api/game-repair/manifest").status_code, 503)
