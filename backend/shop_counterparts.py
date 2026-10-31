import json
import re
from functools import lru_cache
from pathlib import Path


def load_reviewed_pairs(path=None):
    path = path or Path(__file__).resolve().parent / 'data' / 'shop_counterparts.json'
    data = json.loads(Path(path).read_text(encoding='utf8'))
    if data.get('schema') != 'shop-reviewed-counterparts-v1':
        raise ValueError('Invalid reviewed shop counterparts schema')
    pairs = data.get('pairs')
    if not isinstance(pairs, list) or len(pairs) > 5000:
        raise ValueError('Invalid reviewed shop counterparts list')
    seen = set()
    for pair in pairs:
        if pair.get('slot') not in {'hair', 'face', 'top', 'bottom', 'shoes', 'accessory'} or pair.get('family') not in {'standard', 'adult'}:
            raise ValueError('Invalid reviewed shop counterpart type')
        for sex in ('male', 'female'):
            item_id, category = pair.get(sex), pair.get(f'{sex}_category')
            if type(item_id) is not int or not 0 < item_id <= 9223372036854775807 or item_id in seen:
                raise ValueError('Invalid or duplicate reviewed shop counterpart ID')
            if not isinstance(category, str) or not re.fullmatch(r'\d{1,6}', category):
                raise ValueError('Invalid reviewed shop counterpart category')
            family = 'adult' if int(category) < 300 else 'standard'
            if family != pair['family']:
                raise ValueError('Reviewed shop counterpart crosses character families')
            base = (100 if sex == 'male' else 200) if family == 'adult' else (300 if sex == 'male' else 400)
            part = {'hair': 1, 'top': 2, 'bottom': 3, 'shoes': 4, 'accessory': 5, 'face': 6}[pair['slot']]
            if int(category) != base + part:
                raise ValueError('Reviewed shop counterpart crosses slots or sexes')
            seen.add(item_id)
    return pairs


REVIEWED_PAIRS = load_reviewed_pairs()


@lru_cache(maxsize=16)
def reviewed_counterpart_sql(alias='shop_items'):
    if not re.fullmatch(r'[a-z_]+', alias):
        raise ValueError('Invalid shop table alias')
    lookup = {}
    for pair in REVIEWED_PAIRS:
        for sex, other in (('male', 'female'), ('female', 'male')):
            lookup[f"{pair[f'{sex}_category']}:{sex}:{pair[sex]}"] = pair[other]
    if not lookup:
        return 'NULL::bigint'
    mapping = json.dumps(lookup, separators=(',', ':'))
    key = f"({alias}.category || ':' || {alias}.sex || ':' || {alias}.item_id::text)"
    return f"('{mapping}'::jsonb ->> {key})::bigint"


def counterpart_sql(alias='shop_items'):
    return f'COALESCE({alias}.counterpart_id, {reviewed_counterpart_sql(alias)})'


def reviewed_pair_sql(alias='shop_items', partner='partner'):
    return f'({reviewed_counterpart_sql(alias)} = {partner}.item_id AND {reviewed_counterpart_sql(partner)} = {alias}.item_id)'
