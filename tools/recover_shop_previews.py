from argparse import ArgumentParser
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re

from prepare_couple_preview import bindings
from prepare_shop import Builder, write_json


SLOTS = {'hair', 'top', 'bottom', 'shoes', 'accessory', 'face'}
ACCESSORY_CATEGORIES = {'105', '205', '305', '405'}
OBJECT = re.compile(r'[a-f0-9]{64}\.(?:md9|dds|tga|bmp|png)')
MODEL = re.compile(r'[a-f0-9]{64}\.json\.gz')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False).encode()


def slot(item):
    return 'accessory' if str(item['category']) in ACCESSORY_CATEGORIES else item['slot']


def apply_previews(catalog, previews):
    indices = {row['id']: row for row in catalog['items']}
    if not previews or len(indices) != len(catalog['items']) or not previews.keys() <= indices.keys():
        raise ValueError('Recovery must match existing, unique catalog item IDs')
    rows = []
    for row in catalog['items']:
        entry = previews.get(row['id'])
        if not entry:
            rows.append(row)
            continue
        if (row.get('preview_available') or row.get('model') or int(row['category']) < 300
                or slot(row) not in SLOTS or entry['slot'] != slot(row) or entry['sex'] != row['sex']
                or entry['sex'] not in {'male', 'female'} or not MODEL.fullmatch(entry['model'])):
            raise ValueError(f"Invalid recovery for item {row['id']}")
        rows.append({**row, 'model': entry['model'], 'preview_available': True})
    return rows


class Sources:
    def __init__(self, folder):
        self.folder = folder.resolve()
        self.models = {}
        self.texture_names = {}
        self.verified = set()

    def checked_object(self, name):
        if not OBJECT.fullmatch(name):
            raise ValueError(f'Invalid source asset {name}')
        path = self.folder / name
        if name not in self.verified:
            if not path.resolve().is_relative_to(self.folder) or sha256(path.read_bytes()).hexdigest() != name.split('.', 1)[0]:
                raise ValueError(f'Source asset checksum mismatch {name}')
            self.verified.add(name)
        return path

    def add(self, entry):
        model = self.checked_object(entry['source'])
        self.texture_names = {name: self.checked_object(value) for name, value in entry['textures'].items()}
        leaf = sha256(canonical([entry['source'], entry['textures']])).hexdigest() + model.suffix
        self.models[leaf] = model
        return leaf

    def resolve(self, name):
        return self.models[name] if name in self.models else self.checked_object(name)

    def relative(self, path):
        return path.name

    def texture(self, model, name):
        return self.texture_names.get(name)


def build(catalog, plan, base_manifest, source, output):
    if plan['parent_revision'] != catalog['revision']:
        raise ValueError('Recovery plan targets a different shop revision')
    entries = {entry['id']: entry for entry in plan['items']}
    if len(entries) != len(plan['items']):
        raise ValueError('Recovery plan contains duplicate item IDs')
    apply_previews(catalog, {key: {**entry, 'model': '0' * 64 + '.json.gz'} for key, entry in entries.items()})
    revision = sha256(canonical({'schema': 'shop-wearable-recovery-v1', 'catalog': catalog, 'plan': plan,
                                 'converter': sha256(Path(__file__).read_bytes()).hexdigest(),
                                 'base': base_manifest['revision']})).hexdigest()[:20]
    builder = Builder(Path(base_manifest['snapshot_root']), output, {**base_manifest, 'revision': revision})
    resolver = Sources(source / 'objects')
    builder.resolver = resolver
    previews = {}
    for item_id, entry in sorted(entries.items()):
        relative = resolver.add(entry)
        builder.hashes.update({name: name.split('.', 1)[0] for name in resolver.verified})
        if entry['slot'] == 'face':
            model = builder.face(entry['source'], entry['sex'])
        else:
            model = builder.model(relative, sex=entry['sex'], attachment=entry['slot'] == 'accessory')
        previews[item_id] = {'model': model, 'slot': entry['slot'], 'sex': entry['sex']}
        if len(previews) % 100 == 0:
            print(f'Converted {len(previews)}/{len(entries)} models', flush=True)
    bound_models, unresolved = bindings(builder)
    if unresolved:
        raise ValueError(f'Unresolved custom couple bindings: {unresolved[:10]}')
    directory = output / 'catalogs' / revision
    updated = {**catalog, 'revision': revision, 'parent_revision': catalog['revision'], 'items': apply_previews(catalog, previews)}
    write_json(directory / 'catalog.json', updated)
    write_json(directory / 'recovered-inputs.json', plan)
    write_json(builder.asset_root / 'parent.json', {'schema': 'shop-assets-parent-v1', 'revision': catalog['revision']})
    write_json(directory / 'source-manifest.json', {
        'schema': 'shop-wearable-recovery-v1', 'revision': revision, 'parent_revision': catalog['revision'],
        'character_base_revision': base_manifest['revision'], 'recovered_item_ids': sorted(entries),
        'files': [{'relative_path': f'objects/{name}', 'sha256': name.split('.', 1)[0], 'size': resolver.checked_object(name).stat().st_size}
                  for name in sorted(resolver.verified)],
    })
    return {'revision': revision, 'parent_revision': catalog['revision'], 'previews': previews, 'bindings': bound_models}


def main():
    parser = ArgumentParser()
    for option in ['catalog', 'plan', 'base-manifest', 'source', 'output', 'report']:
        parser.add_argument(f'--{option}', type=Path, required=True)
    args = parser.parse_args()
    report = build(read_json(args.catalog), read_json(args.plan), read_json(args.base_manifest), args.source, args.output)
    write_json(args.report, report)
    print(f"Built {len(report['previews'])} previews for {report['revision']}", flush=True)


if __name__ == '__main__':
    main()
