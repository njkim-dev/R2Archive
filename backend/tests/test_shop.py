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
    def database(self, rows):
        cursor = MagicMock()
        cursor.fetchone.return_value = {"count": len(rows)}
        cursor.fetchall.return_value = rows
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock()
        context.__enter__.return_value = connection
        return cursor, context

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

    def test_cursor_pages_use_a_stable_tiebreaker_and_do_not_repeat_counts(self):
        version = "a" * 20
        rows = [{"revision": version, "id": 100, "name": "성형", "_sort_order": 10}, {"revision": version, "id": 101, "name": "성형2", "_sort_order": 10}]
        cursor, context = self.database(rows)
        with patch.object(shop, "require_admin"), patch.object(shop, "catalog", return_value={"revision": version}), patch.object(shop, "get_conn", return_value=context):
            response = self.client().get("/api/shop/items", params={"cursor": "", "page_size": 1, "slot": "face"})
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["next_cursor"], "10:100")
            self.assertTrue(data["has_more"])
            self.assertEqual([item["id"] for item in data["items"]], ["100"])
            self.assertNotIn("_sort_order", data["items"][0])
            cursor.reset_mock()
            cursor.fetchall.return_value = rows[1:]
            response = self.client().get("/api/shop/items", params={"cursor": data["next_cursor"], "page_size": 1, "slot": "face"})
            self.assertIsNone(response.json()["total"])
            self.assertFalse(response.json()["has_more"])
            self.assertEqual(response.json()["items"][0]["id"], "101")
            cursor.fetchone.assert_not_called()
            self.assertIn("(sort_order, item_id) > (%s, %s)", cursor.execute.call_args.args[0])
            self.assertEqual(cursor.execute.call_args.args[1][-3:], [10, 100, 2])

    def test_cursor_rejects_malformed_or_overflowing_values(self):
        cursor, context = self.database([])
        with patch.object(shop, "require_admin"), patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            for value in ["1:2 OR true", "-1:2", "2147483648:1", "1:9223372036854775808"]:
                self.assertEqual(self.client().get("/api/shop/items", params={"cursor": value}).status_code, 400)
        cursor.execute.assert_not_called()

    def test_paired_filter_requires_a_visible_reciprocal_opposite_sex_item(self):
        cursor, context = self.database([])
        with patch.object(shop, "require_admin"), patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            self.assertEqual(self.client().get("/api/shop/items", params={"paired_only": "true", "sex": "male"}).status_code, 200)
        sql = cursor.execute.call_args.args[0]
        for condition in ["partner.show", "partner.counterpart_id = shop_items.item_id", "partner.slot = shop_items.slot", "partner.name_key = shop_items.name_key", "partner.sex = 'female'"]:
            self.assertIn(condition, sql)


if __name__ == "__main__":
    unittest.main()
