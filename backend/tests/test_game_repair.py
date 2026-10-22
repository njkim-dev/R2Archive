import io
import json
import zipfile
import tempfile
import unittest
import os
import jwt
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
os.environ.setdefault("SESSION_SECRET", "repair-availability-test-secret")
from routers import game_repair
import auth


class GameRepairTests(unittest.TestCase):
    def test_admin_can_persist_close_and_reopen_and_all_download_endpoints_enforce_it(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "snapshot").mkdir()
            (root / "snapshot" / "hv.dll").write_bytes(b"good")
            (root / "manifest.json").write_text(json.dumps({"version": "1", "snapshot": "snapshot", "files": [{"name": "hv.dll", "size": 4}]}))
            app = FastAPI()
            app.include_router(game_repair.router)
            client = TestClient(app)
            control = root / "persistent" / "status.json"
            with patch.object(game_repair, "REPAIR_DIR", root), patch.object(game_repair, "CONTROL_FILE", control):
                self.assertTrue(client.get("/api/game-repair/status").json()["enabled"])
                self.assertEqual(client.put("/api/game-repair/admin/status", json={"enabled": False}).status_code, 401)
                self.assertFalse(control.exists())
                client.cookies.set(auth.SESSION_COOKIE, jwt.encode({"sub": "1"}, auth.SESSION_SECRET, algorithm="HS256"))
                with patch.object(auth, "fetch_user", return_value={"id": 1, "is_admin": False}):
                    self.assertEqual(client.put("/api/game-repair/admin/status", json={"enabled": False}).status_code, 403)
                self.assertFalse(control.exists())
                with patch.object(auth, "fetch_user", return_value={"id": 1, "is_admin": True}):
                    self.assertEqual(client.put("/api/game-repair/admin/status", json={"enabled": "false"}).status_code, 422)
                    closed = client.put("/api/game-repair/admin/status", json={"enabled": False})
                    self.assertEqual(closed.status_code, 200)
                    self.assertFalse(closed.json()["enabled"])
                    self.assertEqual(json.loads(control.read_text())["revision"], closed.json()["revision"])
                    for url in ["/manifest", "/files/snapshot/hv.dll", "/archive/snapshot?name=hv.dll"]:
                        response = client.get("/api/game-repair" + url)
                        self.assertEqual(response.status_code, 503)
                        self.assertEqual(response.headers["cache-control"], "no-store")
                    self.assertFalse(TestClient(app).get("/api/game-repair/status").json()["enabled"])
                    opened = client.put("/api/game-repair/admin/status", json={"enabled": True})
                    self.assertTrue(opened.json()["enabled"])
                    self.assertNotEqual(opened.json()["revision"], closed.json()["revision"])
                    self.assertEqual(client.get("/api/game-repair/files/snapshot/hv.dll").content, b"good")
                    control.write_text("corrupt")
                    self.assertFalse(client.get("/api/game-repair/status").json()["enabled"])
                    self.assertEqual(client.get("/api/game-repair/manifest").status_code, 503)
                    (root / "manifest.json").unlink()
                    self.assertEqual(client.put("/api/game-repair/admin/status", json={"enabled": True}).status_code, 503)

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
                response = client.get(url, params={"name": "rnr_music1.pak"})
                self.assertEqual(response.status_code, 200)
                with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                    self.assertEqual(archive.namelist(), ["rnr_music1.pak"])
                    self.assertEqual(archive.read("rnr_music1.pak"), contents["rnr_music1.pak"])
                chunks = list(game_repair.stream_archive([(manifest["files"][1], root / snapshot / "rnr_boost_mode.pak")]))
                self.assertLessEqual(max(map(len, chunks)), 1024 * 1024)
                self.assertGreater(len(chunks), 3)
                for name in ["config.ini", "../hv.dll", "nested/hv.dll", "missing.pak"]:
                    self.assertEqual(client.get(url, params={"name": name}).status_code, 404)
                self.assertEqual(client.get(url).status_code, 422)
                self.assertEqual(client.get(url, params=[("name", "hv.dll")] * 257).status_code, 422)
                self.assertEqual(client.get("/api/game-repair/archive/old", params={"name": "hv.dll"}).status_code, 409)
                (root / snapshot / "hv.dll").write_bytes(b"short")
                self.assertEqual(client.get(url, params={"name": "hv.dll"}).status_code, 503)
