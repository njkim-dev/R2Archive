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
from shop_couple import EXTENSION_SCHEMA, catalog, preview


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

    def test_extension_adds_actions_and_filters_preview_types(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(shop, 'SHOP_DIR', Path(folder)):
            base = self.manifest(folder)
            revision = 'f' * 20
            original = preview(folder, 30120)
            effect = {'model': 'e' * 64 + '.json.gz', 'animation': original['motion'].split('/')[-1]}
            extra = {
                'schema': EXTENSION_SCHEMA,
                'revision': revision,
                'motions': {'30497': base['rings']['30120']},
                'same_sex': {'30120': {
                    sex: {'revision': revision, 'motion': digit * 64 + '.json.gz'}
                    for sex, digit in [('male', '1'), ('female', '2')]
                }},
                'ornaments': {'30120': effect},
                'effects': {item_id: {**effect, 'duration': 2} for item_id in ['30852', '1200091']},
            }
            path = Path(folder) / 'couple-preview-extension.json'
            path.write_text(json.dumps(extra), encoding='utf8')
            row = {'revision': base['revision'], 'preview_available': False, 'model': None}
            action = shop.serialize({**row, 'id': 30497, 'category': '504'})
            self.assertIn(revision, action['couple_preview']['motion'])
            self.assertEqual(action['couple_preview']['bindings'], original['bindings'])
            updated = preview(folder, 30120)
            self.assertEqual(updated['motion'], original['motion'])
            self.assertNotIn('same_sex_motions', updated)
            self.assertIn(revision, updated['ornament']['model'])
            ornament = shop.serialize({**row, 'id': 30852, 'category': '507'})
            self.assertIsNone(ornament['couple_preview'])
            self.assertNotIn('effect_preview', ornament)
            self.assertFalse(ornament['preview_available'])
            friend = shop.serialize({**row, 'id': 1200091, 'category': '508'})
            self.assertEqual(friend['effect_preview']['duration'], 2)
            extra['effects']['30852']['animation'] = '../../private'
            path.write_text(json.dumps(extra), encoding='utf8')
            self.assertEqual(preview(folder, 30120), original)
            self.assertNotIn('couple_preview', shop.serialize({**row, 'id': 30497, 'category': '504'}))

    def test_optional_lobby_and_action_models_have_versioned_public_urls(self):
        with tempfile.TemporaryDirectory() as folder:
            data = self.manifest(folder)
            model = 'e' * 64 + '.json.gz'
            animation = 'f' * 64 + '.json.gz'
            data['rings']['30120'].update(ornament={'model': model, 'animation': animation, 'particles': animation}, effects=[{'model': model, 'animation': animation, 'particles': animation, 'sex': 'male'}])
            path = Path(folder) / 'couple-catalog.json'
            path.write_text(json.dumps(data), encoding='utf8')
            result = preview(folder, 30120)
            self.assertEqual(result['ornament']['model'], '/api/shop/assets/' + data['revision'] + '/models/' + model)
            self.assertEqual(result['effects'][0]['sex'], 'male')
            self.assertEqual(result['ornament']['particles'], '/api/shop/assets/' + data['revision'] + '/motions/' + animation)
            data['rings']['30120']['effects'][0]['particles'] = '../../private'
            path.write_text(json.dumps(data), encoding='utf8')
            self.assertIsNone(catalog(folder))
            data['rings']['30120']['effects'][0]['particles'] = animation
            for invalid in [None, {'model': '../../secret', 'animation': animation}, {'model': model, 'animation': '../other'}]:
                data['rings']['30120']['ornament'] = invalid
                path.write_text(json.dumps(data), encoding='utf8')
                self.assertIsNone(catalog(folder))
            data['rings']['30120'].pop('ornament')
            data['rings']['30120']['effects'][0]['sex'] = 'other'
            path.write_text(json.dumps(data), encoding='utf8')
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
