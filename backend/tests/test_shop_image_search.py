from io import BytesIO
import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault('SESSION_SECRET', 'image-search-test-session-secret-at-least-32-characters')
import numpy as np
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

    def client(self):
        app = FastAPI(); app.include_router(api.router)
        return TestClient(app)

    def test_invalid_filters_and_images_do_not_start_model_or_query_database(self):
        with patch.object(core, 'engine') as engine, patch.object(api, 'get_conn') as db:
            client = self.client()
            response = client.post('/api/shop/image-search', data={'sex': 'other', 'slot': 'top'}, files={'image': ('a.png', png(), 'image/png')})
            self.assertEqual(response.status_code, 422)
            response = client.post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'}, files={'image': ('a.png', b'bad', 'image/png')})
            self.assertEqual(response.status_code, 422)
            engine.assert_not_called(); db.assert_not_called()

    def test_busy_worker_rejects_instead_of_queuing(self):
        with api.capacity.enter('existing-user'), patch.object(core, 'engine') as engine:
            response = self.client().post('/api/shop/image-search', data={'sex': 'male', 'slot': 'top'}, files={'image': ('a.png', png(), 'image/png')})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['retry-after'], '5')
        engine.assert_not_called()

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
