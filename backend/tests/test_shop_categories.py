import sqlite3
import unittest

from shop_categories import DEPARTMENT_SQL, GROUP_SQL, SUBGROUP_SQL


class ShopCategoryTests(unittest.TestCase):
    def classify(self, item_id, category, name='', department='other', slot=None):
        with sqlite3.connect(':memory:') as conn:
            conn.execute('CREATE TABLE shop_items(item_id INTEGER,category TEXT,name TEXT,department TEXT,slot TEXT)')
            conn.execute('INSERT INTO shop_items VALUES(?,?,?,?,?)', (item_id, category, name, department, slot))
            return conn.execute(f'SELECT {DEPARTMENT_SQL},{GROUP_SQL},{SUBGROUP_SQL} FROM shop_items').fetchone()

    def test_identical_ring_names_are_distinguished_by_game_category(self):
        self.assertEqual(self.classify(30090, '507', '자수정 나비링'), ('functional', 'couple', None))
        self.assertEqual(self.classify(1200090, '508', '자수정 나비링'), ('functional', 'friend', None))
        self.assertEqual(self.classify(1200129, '508', '우정의 키'), ('functional', 'best_friend', None))

    def test_themes_and_actions_move_to_functional_without_changing_raw_category(self):
        for item_id, category, group in [(11000537, '502', 'theme'), (30111, '504', 'action')]:
            self.assertEqual(self.classify(item_id, category)[:2], ('functional', group))

    def test_pet_types_and_supplies_are_separate(self):
        for item_id, subgroup in [(4000004, 'pet_growth'), (600084, 'pet_regular')]:
            self.assertEqual(self.classify(item_id, '505', department='wearable', slot='pet'), ('wearable', 'pet', subgroup))
        for item_id, subgroup in [(4100002, 'pet_dye'), (4200001, 'pet_food'), (4200003, 'pet_rename')]:
            self.assertEqual(self.classify(item_id, '505', department='functional'), ('functional', 'pet_supplies', subgroup))

    def test_auxiliary_scripts_identify_backgrounds_and_nickname_cards(self):
        self.assertEqual(self.classify(1000027, '506', '토끼 슬롯팩', 'functional')[:2], ('functional', 'background'))
        self.assertEqual(self.classify(1000408, '506', '핑크 엔젤 닉네임팩', 'functional')[:2], ('functional', 'nickname'))
        self.assertEqual(self.classify(2, '506', '큰 확성기', 'functional')[:2], ('functional', 'chat'))

    def test_keyword_rules_do_not_capture_clothing_and_unknown_items_stay_visible(self):
        self.assertEqual(self.classify(999, '301', '테마 닉네임 머리', 'wearable', 'hair'), ('wearable', 'hair', None))
        self.assertEqual(self.classify(999, '0', '알 수 없는 아이템'), ('other', 'other', None))
        self.assertEqual(self.classify(999, '509', '새로운 소모품', 'functional'), ('functional', 'utility', None))

    def test_ornaments_summons_characters_and_wedding_are_independent(self):
        for item_id, category, group in [(910707, '305', 'accessory'), (1000558, '1007', 'summon'), (140022, '501', 'character'), (11000421, '0', 'wedding')]:
            self.assertEqual(self.classify(item_id, category), ('other', group, None))


if __name__ == '__main__':
    unittest.main()
