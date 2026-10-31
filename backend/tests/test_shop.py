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
    def test_static_pose_updates_old_models_without_changing_item_identity_price_or_version(self):
        old, new = 'a' * 20, 'b' * 20
        original, replacement = 'c' * 64 + '.json.gz', 'd' * 64 + '.json.gz'
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, 'SHOP_DIR', Path(folder)):
            path = Path(folder)/'pose-catalog.json'
            path.write_text(json.dumps({'schema': 'shop-static-pose-v1', 'revision': new, 'models': {original: replacement}}), encoding='utf8')
            row = {'revision': old, 'id': 123, 'name': '의상', 'model': original, 'prices': [{'key': 'P7', 'amount': 100}], 'counterpart_id': 124}
            result = shop.serialize(row)
            self.assertEqual(result['version'], old)
            self.assertEqual(result['id'], '123')
            self.assertEqual(result['counterpart_id'], '124')
            self.assertEqual(result['prices'], row['prices'])
            self.assertEqual(result['model'], f'/api/shop/assets/{new}/models/{replacement}')
            self.assertEqual(shop.model_url(old, 'e'*64+'.json.gz', shop.pose_catalog()), f'/api/shop/assets/{old}/models/'+'e'*64+'.json.gz')
            path.write_text('{invalid', encoding='utf8')
            self.assertEqual(shop.serialize(row)['model'], f'/api/shop/assets/{old}/models/{original}')

    def test_static_pose_metadata_keeps_legacy_catalog_and_uses_matching_texture_revision(self):
        old, new = 'a'*20, 'b'*20
        source, target = 'c'*64+'.json.gz', 'd'*64+'.json.gz'
        cursor, context = self.database([{'department': 'wearable', 'count': 3}])
        pose = {'revision': new, 'models': {source: target}}
        with patch.object(shop, 'catalog', return_value={'revision': old, 'bases': {'male': source}}), patch.object(shop, 'get_conn', return_value=context), patch.object(shop, 'pose_catalog', return_value=pose):
            response = self.client().get('/api/shop/meta', params={'version': old})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['revision'], old)
        self.assertEqual(response.json()['texture_revision'], new)
        self.assertEqual(response.json()['bases']['male'], f'/api/shop/assets/{new}/models/{target}')
        with patch.object(shop, 'catalog', return_value={'revision': new, 'bases': {'male': target}}), patch.object(shop, 'get_conn', return_value=context), patch.object(shop, 'pose_catalog', return_value=pose):
            response = self.client().get('/api/shop/meta')
        self.assertNotIn('texture_revision', response.json())
        self.assertEqual(response.json()['bases']['male'], f'/api/shop/assets/{new}/models/{target}')

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

    def test_favorites_require_a_real_login_and_reject_deleted_accounts(self):
        client = self.client()
        requests = [('get', '/favorites'), ('post', '/favorites/200'), ('delete', '/favorites/200'), ('get', '/items?favorites_only=true')]
        with patch.object(shop, 'get_conn') as connection:
            for method, path in requests:
                self.assertEqual(getattr(client, method)('/api/shop' + path).status_code, 401)
            client.cookies.set(auth.SESSION_COOKIE, jwt.encode({'sub':'1'},auth.SESSION_SECRET,algorithm='HS256'))
            with patch.object(shop, 'fetch_user', return_value=None):
                for method, path in requests:
                    self.assertEqual(getattr(client, method)('/api/shop' + path).status_code, 401)
            connection.assert_not_called()

    def test_catalog_is_public_and_does_not_require_admin_or_login(self):
        cursor, context = self.database([{'department':'wearable','count':1}])
        with patch.object(shop, 'catalog', return_value={'revision':'a'*20,'bases':{}}), patch.object(shop,'get_conn',return_value=context), patch.object(shop,'fetch_user') as user:
            response = self.client().get('/api/shop/meta')
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()['admin_only'])
        user.assert_not_called()

    def test_only_derivative_assets_are_downloadable_and_models_decompress(self):
        client = self.client()
        version = "a" * 20
        image = "b" * 64 + ".webp"
        model = "c" * 64 + ".json.gz"
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, "SHOP_DIR", Path(folder)):
            root = Path(folder) / "assets" / version
            (root / "models").mkdir(parents=True)
            (root / "thumbnails").mkdir()
            (root / "models" / model).write_bytes(gzip.compress(json.dumps({"meshes": []}).encode()))
            (root / "thumbnails" / image).write_bytes(b"image")
            response = client.get(f"/api/shop/assets/{version}/models/{model}")
            self.assertEqual(response.json(), {"meshes": []})
            self.assertEqual(response.headers["cache-control"], "public, max-age=31536000, immutable")
            self.assertEqual(client.get(f"/api/shop/assets/{version}/thumbnails/{image}").content, b"image")
            for kind, filename in [("source", image), ("models", image), ("textures", model), ("textures", "shop.txt"), ("models", "missing.json.gz")]:
                self.assertEqual(client.get(f"/api/shop/assets/{version}/{kind}/{filename}").status_code, 404)

    def test_missing_items_cannot_be_resolved_and_direct_access_is_limited_to_visible_or_wearable_items(self):
        client = self.client()
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock()
        context.__enter__.return_value = connection
        with patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            self.assertEqual(client.get("/api/shop/items/20210882").status_code, 404)
        self.assertIn("(show OR", cursor.execute.call_args.args[0])

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
        with patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            response = client.get("/api/shop/items", params={"q": query, "sex": "male", "department": "wearable"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["total"], 0)
        for call in cursor.execute.call_args_list:
            self.assertNotIn(query, call.args[0])
            self.assertIn("show", call.args[0])
            self.assertIn(query, call.args[1])

    def test_cursor_pages_use_a_stable_tiebreaker_and_do_not_repeat_counts(self):
        version = "a" * 20
        rows = [{"revision": version, "id": 101, "name": "성형2", "_sort_order": 10}, {"revision": version, "id": 100, "name": "성형", "_sort_order": 10}]
        cursor, context = self.database(rows)
        with patch.object(shop, "catalog", return_value={"revision": version}), patch.object(shop, "get_conn", return_value=context):
            response = self.client().get("/api/shop/items", params={"cursor": "", "page_size": 1, "slot": "face"})
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["next_cursor"], "d:10:101")
            self.assertTrue(data["has_more"])
            self.assertEqual([item["id"] for item in data["items"]], ["101"])
            self.assertIn('ORDER BY sort_order DESC, item_id DESC', cursor.execute.call_args.args[0])
            self.assertNotIn("_sort_order", data["items"][0])
            cursor.reset_mock()
            cursor.fetchall.return_value = rows[1:]
            response = self.client().get("/api/shop/items", params={"cursor": data["next_cursor"], "page_size": 1, "slot": "face"})
            self.assertIsNone(response.json()["total"])
            self.assertFalse(response.json()["has_more"])
            self.assertEqual(response.json()["items"][0]["id"], "100")
            cursor.fetchone.assert_not_called()
            self.assertIn("(sort_order, item_id) < (%s, %s)", cursor.execute.call_args.args[0])
            self.assertEqual(cursor.execute.call_args.args[1][-3:], [10, 101, 2])

    def test_open_pages_can_finish_using_their_legacy_ascending_cursor(self):
        rows=[{'revision':'a'*20,'id':101,'_sort_order':10},{'revision':'a'*20,'id':102,'_sort_order':11}]
        cursor,context=self.database(rows)
        with patch.object(shop,'catalog',return_value={'revision':'a'*20}),patch.object(shop,'get_conn',return_value=context):
            response=self.client().get('/api/shop/items',params={'cursor':'10:100','page_size':1})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['next_cursor'],'10:101')
        sql=cursor.execute.call_args.args[0]
        self.assertIn('(sort_order, item_id) > (%s, %s)',sql)
        self.assertIn('ORDER BY sort_order ASC, item_id ASC',sql)

    def test_new_badge_uses_the_stored_source_attribute_and_offset_pages_use_latest_order(self):
        row={'revision':'a'*20,'id':200,'is_new':True}
        cursor,context=self.database([row])
        with patch.object(shop,'catalog',return_value={'revision':'a'*20}),patch.object(shop,'get_conn',return_value=context):
            response=self.client().get('/api/shop/items')
        self.assertTrue(response.json()['items'][0]['is_new'])
        self.assertNotIn('attributes',response.json()['items'][0])
        self.assertIn("COALESCE(attributes->>'New', '0') = '1'",cursor.execute.call_args.args[0])
        self.assertIn('ORDER BY sort_order DESC, item_id DESC',cursor.execute.call_args.args[0])

    def test_cursor_rejects_malformed_or_overflowing_values(self):
        cursor, context = self.database([])
        with patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            for value in ["1:2 OR true", "-1:2", "2147483648:1", "1:9223372036854775808", "d:2147483648:1", "d:1:9223372036854775808", "dd:1:2"]:
                self.assertEqual(self.client().get("/api/shop/items", params={"cursor": value}).status_code, 400)
        cursor.execute.assert_not_called()

    def test_paired_filter_requires_a_visible_reciprocal_opposite_sex_item(self):
        cursor, context = self.database([])
        with patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            self.assertEqual(self.client().get("/api/shop/items", params={"paired_only": "true", "sex": "male"}).status_code, 200)
        sql = cursor.execute.call_args.args[0]
        for condition in ["partner.show", shop.counterpart_sql('partner') + " = shop_items.item_id", "partner.category IN ('105','205','305','405')", "partner.name_key = shop_items.name_key", "partner.sex = 'female'", shop.reviewed_pair_sql()]:
            self.assertIn(condition, sql)

    def test_preview_filter_excludes_missing_models_and_accepts_attachment_slots(self):
        cursor, context = self.database([])
        with patch.object(shop, 'catalog', return_value={'revision': 'a' * 20}), patch.object(shop, 'get_conn', return_value=context):
            for slot in ['accessory', 'summon']:
                response = self.client().get('/api/shop/items', params={'slot': slot, 'preview_only': True, 'paired_only': True})
                self.assertEqual(response.status_code, 200)
                sql, params = cursor.execute.call_args.args
                self.assertIn('preview_available AND model IS NOT NULL', sql)
                self.assertIn('partner.preview_available', sql)
                self.assertIn(slot, params)

    def test_paired_filter_keeps_common_pets_without_requiring_a_counterpart(self):
        cursor,context=self.database([])
        with patch.object(shop,'catalog',return_value={'revision':'a'*20}),patch.object(shop,'get_conn',return_value=context):
            for preview in [False,True]:
                for sex in ['male','female']:
                    response=self.client().get('/api/shop/items',params={'slot':'pet','sex':sex,'paired_only':True,'preview_only':preview})
                    self.assertEqual(response.status_code,200)
                    sql,args=cursor.execute.call_args.args
                    self.assertIn("= 'pet' AND shop_items.sex = 'common'",sql)
                    self.assertIn('pet',args)
                    self.assertEqual('preview_available AND model IS NOT NULL' in sql,preview)

    def test_category_filters_are_bounded_and_parameterized(self):
        cursor, context = self.database([])
        with patch.object(shop, "catalog", return_value={"revision": "a" * 20}), patch.object(shop, "get_conn", return_value=context):
            response = self.client().get('/api/shop/items', params={'department': 'functional', 'group': 'pet_supplies', 'subgroup': 'pet_food', 'cursor': ''})
            self.assertEqual(response.status_code, 200)
            for call in cursor.execute.call_args_list:
                self.assertIn('pet_supplies', call.args[1])
                self.assertIn('pet_food', call.args[1])
                self.assertIn('show', call.args[0])
            cursor.reset_mock()
            for params in [{'group': "friend' OR true --"}, {'subgroup': 'unknown'}, {'group': 'x' * 33}]:
                self.assertEqual(self.client().get('/api/shop/items', params=params).status_code, 422)
            cursor.execute.assert_not_called()

    def test_serialized_categories_preserve_item_identity_and_shared_asset_urls(self):
        item = shop.serialize({'revision': 'a' * 20, 'id': 1200090, 'category': '508', 'department': 'functional', 'item_group': 'friend', 'item_subgroup': None, 'thumbnail': 'b' * 64 + '.webp'})
        self.assertEqual(item['id'], '1200090')
        self.assertEqual(item['category'], '508')
        self.assertEqual(item['group'], 'friend')
        self.assertIsNone(item['subgroup'])
        self.assertIn('/assets/' + 'a' * 20 + '/thumbnails/', item['thumbnail'])
        self.assertNotIn('item_group', item)


if __name__ == "__main__":
    unittest.main()
