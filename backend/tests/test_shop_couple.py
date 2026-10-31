import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
os.environ.setdefault('SESSION_SECRET', 'couple-preview-test-session-secret-at-least-32-characters')
from routers import shop
from shop_couple import catalog, preview


class CouplePreviewTests(unittest.TestCase):
    def manifest(self, folder):
        motion = 'a' * 64 + '.json.gz'
        audio = 'b' * 64 + '.mp3'
        data = {'schema': 'shop-couple-motion-v1', 'revision': 'c' * 20, 'bindings': 'd' * 64 + '.json.gz', 'rings': {'30120': {'motion': motion, 'audio': audio, 'duration': 7.1}}}
        (Path(folder) / 'couple-catalog.json').write_text(json.dumps(data), encoding='utf8')
        return data

    def test_reviewed_ring_capability_does_not_change_wearable_fields_or_prices(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, 'SHOP_DIR', Path(folder)):
            data = self.manifest(folder)
            row = {'revision': 'e' * 20, 'id': 30120, 'category': '507', 'name': '하트 주얼링', 'model': None, 'preview_available': False, 'prices': [{'amount': 11000}]}
            result = shop.serialize(row)
            self.assertFalse(result['preview_available'])
            self.assertIsNone(result['model'])
            self.assertEqual(result['version'], row['revision'])
            self.assertEqual(result['prices'], row['prices'])
            self.assertIn('/motions/', result['couple_preview']['motion'])
            self.assertIn('/audio/', result['couple_preview']['audio'])
            for item_id in [30080, 30090, 30030, 30078, 30005, 30006, 30007, 30845, 30850, 30840, 30852]:
                self.assertIsNone(shop.serialize({**row, 'id': item_id})['couple_preview'])
            self.assertNotIn('couple_preview', shop.serialize({**row, 'category': '302'}))

    def test_manifest_validation_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(preview(folder, 30120))
            data = self.manifest(folder)
            self.assertIsNotNone(preview(folder, 30120))
            data['rings']['30120']['audio'] = '../../secret.mp3'
            (Path(folder) / 'couple-catalog.json').write_text(json.dumps(data), encoding='utf8')
            self.assertIsNone(catalog(folder))

    def test_hashed_motion_and_audio_assets_are_public_and_audio_supports_ranges(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, 'SHOP_DIR', Path(folder)):
            data = self.manifest(folder)
            root = Path(folder) / 'assets' / data['revision']
            for kind in ['motions', 'audio']:
                (root / kind).mkdir(parents=True)
            motion = data['rings']['30120']['motion']
            audio = data['rings']['30120']['audio']
            (root / 'motions' / motion).write_bytes(gzip.compress(b'{"actors":{}}'))
            (root / 'audio' / audio).write_bytes(b'0123456789abcdef')
            app = FastAPI(); app.include_router(shop.router)
            client = TestClient(app)
            prefix = '/api/shop/assets/' + data['revision']
            self.assertEqual(client.get(prefix + '/motions/' + motion).json(), {'actors': {}})
            response = client.get(prefix + '/audio/' + audio, headers={'Range': 'bytes=2-5'})
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response.content, b'2345')
            self.assertEqual(response.headers['content-type'], 'audio/mpeg')
            self.assertEqual(response.headers['cache-control'], 'public, max-age=31536000, immutable')
            for kind, name in [('models', audio), ('textures', audio), ('audio', motion), ('motions', audio), ('audio', '../../secret.mp3')]:
                self.assertEqual(client.get(prefix + '/' + kind + '/' + name).status_code, 404)


if __name__ == '__main__':
    unittest.main()
