import unittest
from unittest.mock import MagicMock, patch

import shop_image_estimate as estimates


class ImageEstimateTests(unittest.TestCase):
    def setUp(self):
        estimates._cache.clear()

    def test_small_samples_use_slot_specific_fallback_and_ignore_invalid_times(self):
        self.assertEqual(estimates.summarize([None, 0, -1, float('nan'), float('inf'), 200, 3], 'all'),
                         {'min_seconds': 20, 'max_seconds': 50, 'basis': 'initial'})
        self.assertEqual(estimates.summarize([12] * 4, 'hair')['max_seconds'], 30)

    def test_quantiles_allow_for_real_variation_and_enforce_bounds(self):
        self.assertEqual(estimates.summarize([20, 25, 30, 35, 40], 'all'),
                         {'min_seconds': 20, 'max_seconds': 51, 'basis': 'recent'})
        self.assertEqual(estimates.summarize([140] * 80, 'hair')['max_seconds'], 145)

    def test_recent_samples_exclude_cache_and_old_pipeline_and_are_cached(self):
        db = MagicMock()
        cur = db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchall.return_value = [(12,)] * 8
        with patch.object(estimates, 'get_conn', db), patch.object(estimates, 'monotonic', return_value=10):
            first = estimates.estimate('hair', 'model', 'pipeline')
            second = estimates.estimate('hair', 'model', 'pipeline')
        self.assertEqual(first, second)
        db.assert_called_once()
        sql, args = cur.execute.call_args.args
        self.assertIn("diagnostics->>'cached' IS DISTINCT FROM 'true'", sql)
        self.assertIn("interval '7 days'", sql)
        self.assertIn('LIMIT 80', sql)
        self.assertEqual(args, ('hair', 'model', 'pipeline'))

    def test_database_failure_falls_back_without_breaking_search(self):
        with patch.object(estimates, 'get_conn', side_effect=RuntimeError('offline')):
            self.assertEqual(estimates.estimate('top', 'model', 'pipeline')['basis'], 'initial')
