import argparse
import hashlib
import json
import re
from pathlib import Path


def build(root):
    scripts = root / 'rnr_script'
    sources = {}

    def nodes(filename, tag):
        data = (scripts / filename).read_bytes()
        sources[filename] = hashlib.sha256(data).hexdigest()
        text = re.sub(r'<!--.*?-->', '', data.decode('cp949', errors='replace'), flags=re.S)
        return [dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', row))
                for row in re.findall(r'<' + tag + r'\b([^>]*)>', text)]

    def ids(filename, tag, key):
        return {int(row[key]) for row in nodes(filename, tag) if row.get(key, '').isdigit()}

    groups = {
        'best_friend': ids('ring.txt', 'Together', 'Index'),
        'pet_growth': ids('growpet.xml', 'pet', 'petindex'),
        'background': ids('slotpack.txt', 'SlotPack', 'ItemIndex') | ids('slotpack.txt', 'Dynamic', 'ItemIndex')
                      | ids('bgskin.xml', 'bgskin', 'itemcode') | ids('bgskin.xml', 'dynamic', 'itemcode'),
        'nickname': ids('namecard.xml', 'namecard', 'itemcode') | ids('bgskin.xml', 'namebg', 'itemcode'),
        'wedding': ids('wd_item.xml', 'WdItem', 'ItemCode'),
    }
    for row in nodes('shop.txt', 'Item'):
        category, name, item_id = row.get('ShopIndex'), row.get('Name', ''), int(row['Index'])
        if category == '0' and any(word in name for word in ['예식장', '웨딩홀']):
            groups['wedding'].add(item_id)
    return {'schema': 1, 'source_sha256': sources, 'items': {key: sorted(value) for key, value in groups.items()}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'backend/data/shop_category_items.json')
    args = parser.parse_args()
    result = build(args.game_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: len(ids) for key, ids in result['items'].items()}))
