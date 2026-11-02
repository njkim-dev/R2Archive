import os
import unittest
from unittest.mock import MagicMock, patch

import httpx
from PIL import Image

import shop_outfit_search as search


class OutfitTests(unittest.TestCase):
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
        with patch.object(search, 'outfit_engine', return_value=model):
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
