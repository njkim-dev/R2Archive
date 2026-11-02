from io import BytesIO
import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault('SESSION_SECRET', 'image-search-test-session-secret-at-least-32-characters')
import numpy as np
import auth
import jwt
import time
from PIL import Image, ImageDraw
from fastapi import FastAPI
from fastapi.testclient import TestClient

import shop_image_search as core
from routers import shop_image_search as api


def png(size=(64, 64)):
    stream = BytesIO()
    Image.new('RGB', size, 'white').save(stream, format='PNG')
    return stream.getvalue()


class ImageSearchTests(unittest.TestCase):
    def test_upload_validation_rejects_invalid_oversized_and_extreme_dimensions(self):
        for content in [b'not an image', b'x' * (core.MAX_BYTES + 1), png((8, 64)), png((4097, 16))]:
            with self.assertRaises(ValueError):
                core.decode_image(content)
        image = core.decode_image(png())
        self.assertEqual(image.size, (64, 64))
        self.assertEqual(image.mode, 'RGB')

    def test_full_image_padding_preserves_edge_decoration(self):
        image = Image.new('RGB', (100, 200), 'black')
        ImageDraw.Draw(image).rectangle((35, 0, 65, 20), fill='red')
        cropped = core.image_tensor(image)
        preserved = core.image_tensor(image, preserve_full=True)
        self.assertEqual(preserved.shape, (1, 3, 224, 224))
        self.assertEqual(preserved.dtype, np.float32)
        self.assertTrue(np.isfinite(preserved).all())
        self.assertGreater(float(preserved[0, 0].max()), float(cropped[0, 0].max()) + 1)

    def test_search_excludes_stale_thumbnails_wrong_sex_and_wrong_slots(self):
        model = core.ImageSearch.__new__(core.ImageSearch)
        model.items = [
            {'id': '1', 'thumbnail': 'old', 'sex': 'male', 'slot': 'hair'},
            {'id': '2', 'thumbnail': 'current', 'sex': 'male', 'slot': 'hair'},
            {'id': '3', 'thumbnail': 'female', 'sex': 'female', 'slot': 'hair'},
            {'id': '4', 'thumbnail': 'shirt', 'sex': 'male', 'slot': 'top'},
        ]
        model.features = np.zeros((4, 384), dtype=np.float32)
        model.features[:, 0] = [1, .8, 1, 1]
        model.session = MagicMock()
        vector = np.zeros((1, 384), dtype=np.float32); vector[0, 0] = 1
        model.session.run.return_value = [vector]
        result = model.search(Image.new('RGB', (64, 64)), 'male', 'hair',
                              {'1': 'changed', '2': 'current', '3': 'female', '4': 'shirt'})
        self.assertEqual(result, ['2'])
        model.session.run.assert_called_once()

    def client(self, admin=True):
        app = FastAPI(); app.include_router(api.router)
        if admin:
            app.dependency_overrides[api.favorite_user] = lambda: 1
        return TestClient(app)

    def test_both_routes_require_login_and_accept_members(self):
        client = self.client(admin=False)
        with patch.object(auth, 'fetch_user', return_value={'id': 2, 'is_admin': False}) as user, \
             patch.object(core, 'engine') as engine, patch.object(core, 'status') as status, \
             patch.object(api, 'get_conn') as db:
            for token, expected in [(None, 401), ('invalid', 401)]:
                cookies = {auth.SESSION_COOKIE: token} if token else {}
                response = client.get('/api/shop/image-search/status', cookies=cookies)
                self.assertEqual(response.status_code, expected)
                response = client.post('/api/shop/image-search', cookies=cookies, data={'sex': 'male', 'slot': 'top'},
                                       files={'image': ('a.png', png(), 'image/png')})
                self.assertEqual(response.status_code, expected)
            engine.assert_not_called(); status.assert_not_called(); db.assert_not_called()
        token = jwt.encode({'sub': '1', 'exp': int(time.time()) + 60}, auth.SESSION_SECRET, algorithm='HS256')
        with patch('routers.shop.fetch_user', return_value={'id': 1, 'is_admin': False}), \
             patch.object(core, 'status', return_value={'available': True}), \
             patch.object(api, 'find', return_value={'items': [], 'version': 'a'*20}) as find:
            client.cookies.set(auth.SESSION_COOKIE, token)
            response = client.get('/api/shop/image-search/status')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['cache-control'], 'no-store')
            response = client.post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'},
                                   files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 200)
            find.assert_called_once()

    def test_invalid_filters_and_images_do_not_start_model_or_query_database(self):
        with patch.object(core, 'engine') as engine, patch.object(api, 'get_conn') as db:
            client = self.client()
            response = client.post('/api/shop/image-search', data={'sex': 'other', 'slot': 'top'}, files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 422)
            response = client.post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'}, files={'image': ('a.png', b'bad', 'image/png')})
            self.assertEqual(response.status_code, 422)
            engine.assert_not_called(); db.assert_not_called()

    def test_busy_worker_rejects_instead_of_queuing(self):
        with api.capacity.enter('existing-user'), api.capacity.enter('second-user'), patch.object(core, 'engine') as engine:
            response = self.client().post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'}, files={'image': ('a.png', png(), 'image/png')})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['retry-after'], '5')
        engine.assert_not_called()

    def test_automatic_search_routes_all_parts_and_requires_explicit_sex(self):
        with patch.object(api, 'find_outfit', return_value={'groups': [], 'items': []}) as automatic, patch.object(api, 'find') as cpu:
            response = self.client().post('/api/shop/image-search', data={'mode': 'terra', 'sex': 'female', 'slot': 'all', 'include_unreleased': 'false'},
                                          files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(automatic.call_args.args[1:3], ('female', 'all'))
            self.assertTrue(automatic.call_args.args[4])
            self.assertEqual(automatic.call_args.args[5], 1)
            cpu.assert_not_called()
        with patch.object(api, 'find_outfit') as automatic:
            response = self.client(admin=False).post('/api/shop/image-search', data={'mode': 'terra', 'sex': 'auto', 'slot': 'all'},
                                                     files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 401)
            automatic.assert_not_called()
        with patch.object(api, 'find_outfit') as automatic:
            response = self.client().post('/api/shop/image-search', data={'mode': 'terra', 'sex': 'auto', 'slot': 'all'}, files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 422)
            automatic.assert_not_called()

    def test_automatic_results_preserve_database_visibility(self):
        cursor = MagicMock(); cursor.fetchall.return_value = [{'id': '1', 'thumbnail': 'one', 'slot': 'top', 'sex': 'female'}]
        connection = MagicMock(); connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock(); context.__enter__.return_value = connection
        result = {'sex': 'female', 'parts': {'top': {'id': '1', 'alternatives': ['999'], 'confidence': 'high', 'exact_match_supported': True}},
                  'timing': {'total_seconds': 2}, 'cached': False}
        with patch.object(api.outfit, 'configured', return_value=True), patch.object(api, 'get_conn', return_value=context), \
             patch.object(api, 'catalog', return_value={'revision': 'a'*20}), patch.object(api, 'serialize', side_effect=lambda row: row), \
             patch.object(api.outfit, 'cached_search', return_value=result) as search:
            actual = api.find_outfit(png(), 'auto', 'all', None, False)
        self.assertEqual([item['id'] for item in actual['items']], ['1'])
        self.assertIn('AND (show)', cursor.execute.call_args_list[0].args[0])
        self.assertEqual(set(search.call_args.args[2]), {'1'})

    def test_unavailable_model_returns_recoverable_error(self):
        with patch.object(core, 'engine', side_effect=FileNotFoundError):
            response = self.client().post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'}, files={'image': ('a.png', png(), 'image/png')})
        self.assertEqual(response.status_code, 503)

    def test_database_visibility_and_rank_order_are_preserved(self):
        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            [{'item_id': 1, 'thumbnail': 'one'}, {'item_id': 2, 'thumbnail': 'two'}],
            [{'id': 1, 'name': 'one'}, {'id': 2, 'name': 'two'}],
        ]
        connection = MagicMock(); connection.cursor.return_value.__enter__.return_value = cursor
        context = MagicMock(); context.__enter__.return_value = connection
        model = MagicMock(); model.search.return_value = ['2', '1']
        with patch.object(core, 'engine', return_value=model), patch.object(api, 'get_conn', return_value=context), \
             patch.object(api, 'catalog', return_value={'revision': 'a'*20}), patch.object(api, 'serialize', side_effect=lambda row: row):
            result = api.find(png(), 'male', 'top', None, False)
        self.assertEqual([r['id'] for r in result['items']], [2, 1])
        self.assertIn('AND show', cursor.execute.call_args_list[0].args[0])
        self.assertEqual(model.search.call_args.args[3], {'1': 'one', '2': 'two'})


if __name__ == '__main__':
    unittest.main()
