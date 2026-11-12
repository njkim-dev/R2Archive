import copy
import json
import tempfile
import unittest
from pathlib import Path

from shop_counterparts import REVIEWED_PAIRS, counterpart_sql, load_reviewed_pairs, reviewed_counterpart_sql, reviewed_pair_sql


class ShopCounterpartTests(unittest.TestCase):
    def test_november_release_keeps_differently_named_imperial_outfit_pairs_visible(self):
        lookup={row['male']:row for row in REVIEWED_PAIRS}
        for male,female,slot in [(30210530,30220790,'hair'),(30310695,30320801,'top'),(30410134,30420378,'bottom'),(30510030,30520164,'shoes')]:
            pair=lookup[male]
            self.assertEqual((pair['female'],pair['slot'],pair['family']),(female,slot,'standard'))
            self.assertIn('흑요황정',pair['previous_male_name']);self.assertIn('흑요황정',pair['previous_female_name'])
            self.assertIn(str(male),reviewed_pair_sql());self.assertIn(str(female),reviewed_pair_sql())

    def test_requested_faces_are_reciprocal_reviewed_pairs(self):
        lookup = {p['male']: p for p in REVIEWED_PAIRS}
        self.assertEqual(lookup[1010034]['female'], 1020035)
        self.assertEqual(lookup[1010042]['female'], 1020043)
        self.assertEqual(lookup[1010034]['slot'], 'face')
        self.assertEqual(lookup[1010042]['family'], 'standard')
        self.assertNotEqual(lookup[1010034]['male_name'], lookup[1010034]['female_name'])

    def test_unconfirmed_similar_themes_are_not_enabled(self):
        ids = {p[sex] for p in REVIEWED_PAIRS for sex in ('male', 'female')}
        self.assertTrue(ids.isdisjoint({1010032, 1020033, 11010682, 11020683, 210124, 220134, 310143, 320156, 310009, 320009, 320010}))

    def test_manifest_rejects_duplicate_ids_and_incompatible_pairs(self):
        base = {'schema': 'shop-reviewed-counterparts-v1', 'pairs': [copy.deepcopy(REVIEWED_PAIRS[0])]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'pairs.json'
            for kind in ('duplicate', 'slot', 'sex', 'family', 'id', 'schema'):
                data = copy.deepcopy(base)
                if kind == 'duplicate':
                    data['pairs'].append(copy.deepcopy(data['pairs'][0]))
                elif kind == 'slot':
                    data['pairs'][0]['slot'] = 'pet'
                elif kind == 'sex':
                    data['pairs'][0]['male_category'] = data['pairs'][0]['female_category']
                elif kind == 'family':
                    data['pairs'][0]['family'] = 'adult' if data['pairs'][0]['family'] == 'standard' else 'standard'
                elif kind == 'id':
                    data['pairs'][0]['male'] = '1010034 OR true'
                else:
                    data['schema'] = 'invalid'
                path.write_text(json.dumps(data), encoding='utf8')
                with self.subTest(kind=kind), self.assertRaises(ValueError):
                    load_reviewed_pairs(path)

    def test_reviewed_mapping_is_typed_reciprocal_and_preserves_existing_pairs(self):
        sql = reviewed_counterpart_sql('partner')
        self.assertIn("partner.category || ':' || partner.sex || ':' || partner.item_id::text", sql)
        self.assertIn('"306:male:1010034":1020035', sql)
        self.assertIn('"406:female:1020035":1010034', sql)
        self.assertTrue(counterpart_sql().startswith('COALESCE(shop_items.counterpart_id,'))
        pair_sql = reviewed_pair_sql()
        self.assertIn('= partner.item_id', pair_sql)
        self.assertIn('= shop_items.item_id', pair_sql)
        with self.assertRaises(ValueError):
            reviewed_counterpart_sql('partner; DROP TABLE shop_items')


if __name__ == '__main__':
    unittest.main()
