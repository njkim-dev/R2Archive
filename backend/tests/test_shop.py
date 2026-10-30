import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("SESSION_SECRET", "shop-test-session-secret-at-least-32-characters")
import auth
from routers import shop


class ShopTests(unittest.TestCase):
    def client(self):
        app = FastAPI()
        app.include_router(shop.router)
        return TestClient(app)

    def test_every_data_and_asset_endpoint_requires_real_admin(self):
        client = self.client()
        paths = ["/meta", "/items", "/items/1000208", "/assets/" + "a" * 20 + "/thumbnails/" + "b" * 64 + ".webp"]
        with patch.object(shop, "get_conn") as connection:
            for path in paths:
                self.assertEqual(client.get("/api/shop" + path).status_code, 401)
            client.cookies.set(auth.SESSION_COOKIE, jwt.encode({"sub": "1"}, auth.SESSION_SECRET, algorithm="HS256"))
            with patch.object(auth, "fetch_user", return_value={"id": 1, "is_admin": False}):
                for path in paths:
                    self.assertEqual(client.get("/api/shop" + path).status_code, 403)
            connection.assert_not_called()

    def test_only_derivative_assets_are_downloadable_and_models_decompress(self):
        client = self.client()
        version = "a" * 20
        image = "b" * 64 + ".webp"
        model = "c" * 64 + ".json.gz"
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, "SHOP_DIR", Path(folder)), patch.object(shop, "require_admin", return_value={"id": 1}):
            root = Path(folder) / "assets" / version
            (root / "models").mkdir(parents=True)
            (root / "thumbnails").mkdir()
            (root / "models" / model).write_bytes(gzip.compress(json.dumps({"meshes": []}).encode()))
            (root / "thumbnails" / image).write_bytes(b"image")
            response = client.get(f"/api/shop/assets/{version}/models/{model}")
            self.assertEqual(response.json(), {"meshes": []})
            self.assertEqual(response.headers["cache-control"], "private, no-store")
            self.assertEqual(client.get(f"/api/shop/assets/{version}/thumbnails/{image}").content, b"image")
            for kind, filename in [("source", image), ("models", image), ("textures", model), ("textures", "shop.txt"), ("models", "missing.json.gz")]:
                self.assertEqual(client.get(f"/api/shop/assets/{version}/{kind}/{filename}").status_code, 404)

    def test_hidden_items_cannot_be_resolved_by_direct_url(self):
        client = self.client()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock()
        context.__enter__.return_value = connection
        with patch.object(shop, "require_admin"), patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            self.assertEqual(client.get("/api/shop/items/20210882").status_code, 404)
        self.assertIn("AND show", cursor.execute.call_args.args[0])

    def test_search_is_parameterized_and_visible_only(self):
        client = self.client()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"count": 0}
        cursor.fetchall.return_value = []
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock()
        context.__enter__.return_value = connection
        query = "%' OR true --"
        with patch.object(shop, "require_admin"), patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            response = client.get("/api/shop/items", params={"q": query, "sex": "male", "department": "wearable"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["total"], 0)
        for call in cursor.execute.call_args_list:
            self.assertNotIn(query, call.args[0])
            self.assertIn("show", call.args[0])
            self.assertIn(query, call.args[1])


if __name__ == "__main__":
    unittest.main()
