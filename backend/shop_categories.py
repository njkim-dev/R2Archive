import json
from pathlib import Path


_items = json.loads((Path(__file__).parent / 'data/shop_category_items.json').read_text(encoding='utf-8'))['items']


def member(group):
    return 'item_id IN (' + ','.join(str(int(value)) for value in _items[group]) + ')'


DEPARTMENT_SQL = "CASE WHEN category IN ('502','504','507','508') THEN 'functional' ELSE department END"
GROUP_SQL = f"""CASE
    WHEN category = '502' THEN 'theme'
    WHEN category = '503' THEN 'buff'
    WHEN category = '504' THEN 'action'
    WHEN category = '507' THEN 'couple'
    WHEN category = '508' AND {member('best_friend')} THEN 'best_friend'
    WHEN category = '508' THEN 'friend'
    WHEN category = '505' AND item_id >= 4100000 AND item_id < 4300000 THEN 'pet_supplies'
    WHEN category = '1301' THEN 'magic_ball'
    WHEN category = '506' AND {member('background')} THEN 'background'
    WHEN category = '506' AND ({member('nickname')} OR name LIKE '%%닉네임%%') THEN 'nickname'
    WHEN category = '506' AND (name LIKE '%%말풍선%%' OR name LIKE '%%확성기%%' OR name LIKE '%%색연필%%' OR name LIKE '%%알림창%%') THEN 'chat'
    WHEN category = '509' AND name LIKE '%%라이센스%%' THEN 'license'
    WHEN category = '509' AND name LIKE '%%리듬스톤%%' THEN 'rhythm_stone'
    WHEN department = 'functional' THEN 'utility'
    WHEN department = 'wearable' THEN slot
    WHEN category IN ('105','205','305','405') THEN 'accessory'
    WHEN category = '1007' THEN 'summon'
    WHEN category = '501' THEN 'character'
    WHEN category = '0' AND {member('wedding')} THEN 'wedding'
    ELSE 'other' END"""
SUBGROUP_SQL = f"""CASE
    WHEN slot = 'pet' AND {member('pet_growth')} THEN 'pet_growth'
    WHEN slot = 'pet' THEN 'pet_regular'
    WHEN category = '505' AND item_id >= 4100000 AND item_id < 4200000 THEN 'pet_dye'
    WHEN category = '505' AND item_id = 4200001 THEN 'pet_food'
    WHEN category = '505' AND item_id = 4200003 THEN 'pet_rename'
    END"""
GROUPS = ('theme', 'buff', 'action', 'couple', 'friend', 'best_friend', 'background', 'nickname', 'chat', 'pet_supplies', 'magic_ball', 'license', 'rhythm_stone', 'utility', 'accessory', 'summon', 'character', 'wedding', 'other')
SUBGROUPS = ('pet_regular', 'pet_growth', 'pet_dye', 'pet_food', 'pet_rename')
