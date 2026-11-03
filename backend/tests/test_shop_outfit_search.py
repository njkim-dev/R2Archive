import os
import unittest
from unittest.mock import MagicMock, patch

import httpx
import numpy as np
from PIL import Image

import shop_outfit_search as search


class OutfitTests(unittest.TestCase):
    def test_palette_preserves_blonde_hair_and_ignores_transparent_background(self):
        hair = Image.new('RGBA', (32, 32), (210, 180, 140, 255))
        padded = Image.new('RGBA', (64, 64), (255, 0, 0, 0)); padded.paste(hair, (16, 16))
        np.testing.assert_allclose(search.hair_palette(hair), search.hair_palette(padded), atol=.02)
        self.assertAlmostEqual(float(np.linalg.norm(search.hair_palette(hair))), 1, places=5)
        self.assertFalse(search.hair_palette(Image.new('RGBA', (32,32))).any())

    def test_hair_fusion_rescues_color_match_without_dropping_strong_shape_matches(self):
        order = np.arange(400)
        colors = np.zeros(400); colors[300] = 1
        selected = search.fuse_hair_candidates(order, colors)
        self.assertEqual(len(selected), 120)
        self.assertEqual(len(set(selected)), 120)
        self.assertEqual(selected[:40].tolist(), list(range(40)))
        self.assertIn(300, selected)
        self.assertEqual(search.fuse_hair_candidates(np.arange(2), np.zeros(2)).tolist(), [0,1])

    def test_lighting_views_preserve_alpha_and_recover_brightness_changes(self):
        image = Image.new('RGBA', (256,256), (160,120,80,255))
        views = search.hair_palette_views(image)
        self.assertEqual(views.shape, (5,512))
        np.testing.assert_array_equal(views[0],search.hair_palette(image))
        darker = Image.new('RGBA',(32,32),(128,96,64,255))
        np.testing.assert_array_equal(views[1],search.hair_palette(darker))
        self.assertTrue(np.isfinite(views).all())
        np.testing.assert_allclose(np.linalg.norm(views,axis=1),1,atol=1e-6)
        self.assertFalse(search.hair_palette_views(Image.new('RGBA',(64,64))).any())

    def test_augmented_fusion_preserves_ninety_percent_of_baseline_candidates_and_rescues_lighting_match(self):
        shape = np.arange(400);colors = np.zeros(400);alternate = colors.copy();alternate[300] = 1
        baseline = search.fuse_hair_candidates(shape,colors)
        improved = search.fuse_hair_candidates(shape,colors,alternate)
        np.testing.assert_array_equal(improved[:108],baseline[:108])
        self.assertNotIn(300,baseline);self.assertIn(300,improved)
        self.assertEqual(len(improved),120);self.assertEqual(len(set(improved)),120)
        for count in [0,1,2,60,120]:
            result = search.fuse_hair_candidates(np.arange(count),np.zeros(count),np.zeros(count))
            self.assertEqual(sorted(result.tolist()),list(range(count)))

    def test_null_or_uncertain_comparison_cannot_be_marked_exact(self):
        model = search.OutfitSearch.__new__(search.OutfitSearch)
        model.thumbnail = MagicMock(return_value=Image.new('RGBA', (32,32)))
        model.font = search.ImageFont.load_default()
        for selected, confidence in [(None, 'high'), ('1', 'medium'), ('1', 'invalid')]:
            answer = {'selected_id': selected, 'confidence': confidence, 'exact_match_supported': True}
            with patch.object(search, 'call', return_value=(answer, {})):
                result, _ = model.compare('hair', {}, Image.new('RGB',(32,32)), [{'id':'1','thumbnail':'a'}], 'v')
            self.assertFalse(result['exact_match_supported'])

    def test_standard_tier_no_storage_and_usage_accounting(self):
        payload = {'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': '{"ok":true}'}]}],
                   'usage': {'input_tokens': 100, 'output_tokens': 10, 'input_tokens_details': {'cached_tokens': 20, 'cache_write_tokens': 30}}}
        response = httpx.Response(200, json=payload)
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'private-test-key'}), patch.object(search._client, 'post', return_value=response) as post:
            result, measured = search.call('test', [], 100)
        self.assertTrue(result['ok'])
        self.assertEqual(post.call_args.kwargs['json']['service_tier'], 'default')
        self.assertFalse(post.call_args.kwargs['json']['store'])
        self.assertAlmostEqual(measured['cost_estimate_usd'], .0001385)

    def test_failed_upstream_does_not_leak_provider_body_or_retry(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'private-test-key'}), \
             patch.object(search._client, 'post', return_value=httpx.Response(401, json={'error': 'private-test-key'})) as post:
            with self.assertRaises(search.SearchUnavailable) as failure:
                search.call('test', [], 100)
        self.assertNotIn('private-test-key', str(failure.exception))
        post.assert_called_once()

    def test_invalid_geometry_is_rejected_before_cropping(self):
        for box, points in [([0, 0, 0, 1000], [[0, 0]]*3), ([0, 0, 1001, 1000], [[0, 0]]*3),
                            ([0, 0, 1000, 1000], [[float('nan'), 0]]*3)]:
            with self.assertRaises(ValueError):
                search.valid_region({'bbox_xyxy': box, 'polygon_xy': points}, (100, 200))

    def test_memory_cache_respects_visible_catalogue_and_never_retains_upload(self):
        search._results.clear()
        model = MagicMock()
        model.search.return_value = {'parts': {}}
        image = Image.new('RGB', (32, 64))
        with patch.object(search, 'outfit_engine', return_value=model), patch('shop_image_history.training_snapshot', return_value=(0, [])):
            first = search.cached_search(b'uploaded-image', image, {'1': {'thumbnail': 'a'}}, 'version', ('hair',))
            second = search.cached_search(b'uploaded-image', image, {'1': {'thumbnail': 'a'}}, 'version', ('hair',))
            third = search.cached_search(b'uploaded-image', image, {'2': {'thumbnail': 'b'}}, 'version', ('hair',))
        self.assertFalse(first['cached']); self.assertTrue(second['cached']); self.assertFalse(third['cached'])
        self.assertEqual(model.search.call_count, 2)
        self.assertNotIn('uploaded-image', repr(search._results))
        search._results.clear()

    def test_reranker_cannot_return_item_outside_visible_candidates(self):
        model = search.OutfitSearch.__new__(search.OutfitSearch)
        model.thumbnail = MagicMock(return_value=Image.new('RGBA', (32, 32)))
        model.font = search.ImageFont.load_default()
        with patch.object(search, 'call', return_value=({'selected_id': '999', 'alternative_ids': []}, {})):
            with self.assertRaises(search.SearchUnavailable):
                model.compare('hair', {}, Image.new('RGB', (32, 32)), [{'id': '1', 'thumbnail': 'a'}], 'version')


if __name__ == '__main__':
    unittest.main()
