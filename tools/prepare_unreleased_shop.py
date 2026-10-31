import argparse
import collections
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

from prepare_shop import Builder, Resolver, load_catalog, md9_materials, sha256, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--shop-root', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    game, shop, out = args.game_root.resolve(), args.shop_root.resolve(), args.output.resolve()
    manifest = json.loads((shop / 'catalogs' / args.revision / 'source-manifest.json').read_text(encoding='utf8'))
    manifest.update(source_root=str(game), pose_root=str(shop / 'pose-input'))
    resolver = Resolver(game, shop / 'pose-input')
    items, _ = load_catalog(game, resolver)
    items = [i for i in items if not i['show'] and (i['department'] == 'wearable' or i['category'] in ['105','205','305','405','1007'])]
    required = set()
    for item in items:
        item['department'] = 'wearable'
        for key in ['_thumbnail_source', '_model_source']:
            path = resolver.resolve(item[key])
            if path:
                required.add(path)
        model = resolver.resolve(item['_model_source'])
        if model and model.suffix.lower() == '.md9':
            try:
                for name in md9_materials(model)[3]:
                    texture = resolver.texture(model, name)
                    if texture:
                        required.add(texture)
            except (ValueError, OSError):
                pass
    additions = {resolver.relative(p): {'relative_path': resolver.relative(p), 'sha256': sha256(p), 'size': p.stat().st_size} for p in required}
    manifest['files'] = list({**{f['relative_path']: f for f in manifest['files']}, **additions}.values())
    manifest['revision'] = args.revision
    builder = Builder(game, out, manifest)
    groups = collections.defaultdict(lambda: {'male': [], 'female': []})
    for item in items:
        if item['sex'] in ['male', 'female'] and item['_preview_slot']:
            groups[(item['name_key'], item['_preview_slot'], int(item['category']) < 300)][item['sex']].append(item)
    for sexes in groups.values():
        if len(sexes['male']) == len(sexes['female']) == 1:
            male, female = sexes['male'][0], sexes['female'][0]
            male['counterpart_id'], female['counterpart_id'] = female['id'], male['id']

    def convert(item):
        result = builder.item({**item, 'show': True})
        result['show'] = False
        return result

    converted = []
    print(json.dumps({'stage': 'planned', 'items': len(items), 'source_files': len(additions)}), flush=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        for item in executor.map(convert, items):
            converted.append(item)
            if len(converted) % 500 == 0:
                print(json.dumps({'stage': 'building', 'items': len(converted), 'models': sum(bool(i['model']) for i in converted)}), flush=True)
    assets = [{'relative_path': p.relative_to(out).as_posix(), 'sha256': sha256(p), 'size': p.stat().st_size} for p in builder.asset_root.rglob('*') if p.is_file()]
    report = {'revision': args.revision, 'items': converted, 'assets': assets, 'source_files': list(additions.values()), 'errors': builder.errors}
    write_json(out / 'unreleased-catalog.json', report)
    print(json.dumps({'stage': 'complete', 'items': len(items), 'models': sum(bool(i['model']) for i in converted), 'assets': len(assets), 'bytes': sum(f['size'] for f in assets), 'errors': len(builder.errors)}), flush=True)


if __name__ == '__main__':
    main()
