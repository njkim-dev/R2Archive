import io
import json
import zipfile
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

    def test_archive_selection_validation_streaming_and_zip64(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            snapshot = "10659-test"
            (root / snapshot).mkdir()
            contents = {"hv.dll": b"reference", "rnr_boost_mode.pak": b"pak" * 1024 * 1024, "rnr_music1.pak": b"music", "config.ini": b"private"}
            for name, data in contents.items():
                (root / snapshot / name).write_bytes(data)
            manifest = {"version": "10659", "snapshot": snapshot, "files": [{"name": name, "size": len(data)} for name, data in contents.items()]}
            (root / "manifest.json").write_text(json.dumps(manifest))
            app = FastAPI()
            app.include_router(game_repair.router)
            client = TestClient(app)
            with patch.object(game_repair, "REPAIR_DIR", root):
                url = "/api/game-repair/archive/" + snapshot
                with patch.object(zipfile, "ZIP64_LIMIT", 64):
                    response = client.get(url, params=[("name", "rnr_boost_mode.pak"), ("name", "hv.dll"), ("name", "hv.dll")])
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["content-type"], "application/zip")
                self.assertIn("attachment", response.headers["content-disposition"])
                with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                    self.assertEqual(archive.namelist(), ["rnr_boost_mode.pak", "hv.dll"])
                    self.assertIsNone(archive.testzip())
                    for name in archive.namelist():
                        self.assertEqual(archive.read(name), contents[name])
                chunks = list(game_repair.stream_archive([(manifest["files"][1], root / snapshot / "rnr_boost_mode.pak")]))
                self.assertLessEqual(max(map(len, chunks)), 1024 * 1024)
                self.assertGreater(len(chunks), 3)
                for name in ["rnr_music1.pak", "config.ini", "../hv.dll", "nested/hv.dll", "missing.pak"]:
                    self.assertEqual(client.get(url, params={"name": name}).status_code, 404)
                self.assertEqual(client.get(url).status_code, 422)
                self.assertEqual(client.get(url, params=[("name", "hv.dll")] * 257).status_code, 422)
                self.assertEqual(client.get("/api/game-repair/archive/old", params={"name": "hv.dll"}).status_code, 409)
                (root / snapshot / "hv.dll").write_bytes(b"short")
                self.assertEqual(client.get(url, params={"name": "hv.dll"}).status_code, 503)
