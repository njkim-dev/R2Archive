import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil

import numpy as np

from prepare_couple_effects import effect_time, effect_worlds
from prepare_shop import Resolver, load_image, parse_md9, write_json
from shop_archive import ArchiveSource
from shop_particles import read_aif, read_pfx
from shop_pose import couple_scene_pose, read_animation


SCHEMA = 'shop-particles-v1'


class ParticleSource:
    def __init__(self, game, snapshot):
        self.game, self.snapshot = game.resolve(), snapshot.resolve()
        self.archive = ArchiveSource(game, snapshot)
        self.files = {}

    def resolve(self, relative):
        relative = relative.replace('\\', '/')
        path = self.archive.resolve(relative)
        if path:
            self.files[relative.casefold()] = path
        return path

    def texture(self, file, model, legacy=False):
        name = file.replace('\\', '/').rsplit('/', 1)[-1]
        model_folder = str(Path(model).parent).replace('\\', '/')
        for folder in ([model_folder, 'rnr_effect/tex', 'rnr_effect'] if legacy else ['rnr_effect/tex', 'rnr_effect', model_folder]):
            for extension in [Path(name).suffix, '.tga', '.dds', '.bmp']:
                path = self.resolve(str(Path(folder) / Path(name).with_suffix(extension)).replace('\\', '/'))
                if path:
                    return path
        raise ValueError('Missing particle texture: ' + name)


def build(game, shop, base_path):
    base = json.loads(base_path.read_text(encoding='utf8'))
    audit = json.loads((shop / 'couple-effect-input/audit.json').read_text(encoding='utf8'))
    models = Resolver(shop / 'couple-effect-input')
    source = ParticleSource(game, shop / 'particle-input')
    groups, notes = {}, {}
    for item_id, item in base['rings'].items():
        groups[item_id], notes[item_id] = [], []
        specs = [('ornament', item['ornament'], audit[item_id]['ornament'])] if item.get('ornament') and audit[item_id].get('ornament') else []
        specs += [('effect', effect, path) for effect, path in zip(item.get('effects', []), audit[item_id].get('action_models', []))]
        for kind, descriptor, model_path in specs:
            attachment = source.resolve(str(Path(model_path).with_suffix('.aif')).replace('\\', '/')) or source.resolve('rnr_effect/' + Path(model_path).with_suffix('.aif').name)
            entries = read_aif(attachment) if attachment else [{'file': Path(model_path).with_suffix('.pfx').name, 'animation': '', 'bone': '', 'start': 0, 'end': 0, 'position': [0, 0, 0], 'rotation': [0, 0, 0], 'flags': []}]
            emitters = []
            for entry in entries:
                filename = entry['file'].replace('\\', '/').rsplit('/', 1)[-1]
                path = source.resolve('rnr_effect/' + filename) or source.resolve(str(Path(model_path).parent / filename).replace('\\', '/'))
                if not path:
                    if attachment:
                        notes[item_id].append({'missing_particle': filename})
                    continue
                for number, layer in enumerate(read_pfx(path)):
                    texture = source.texture(layer['texture'], model_path, layer['format'] == 'xml')
                    seed = int.from_bytes(hashlib.sha256((item_id + model_path + filename + str(number) + entry['bone']).encode()).digest()[:4], 'little')
                    emitters.append({**layer, 'attachment': entry, 'texture_path': texture, 'seed': seed, 'source_file': filename})
            if emitters:
                groups[item_id].append({'kind': kind, 'descriptor': descriptor, 'model_source': model_path, 'emitters': emitters})
    generation = hashlib.sha256(SCHEMA.encode() + b':v1-full-stage-source-linked-preview:' + base_path.read_bytes())
    for relative, path in sorted(source.files.items()):
        generation.update(relative.encode()); generation.update(path.read_bytes())
    revision = generation.hexdigest()[:20]
    assets = shop / 'assets' / revision
    for path in (shop / 'assets' / base['revision']).rglob('*'):
        if path.is_file():
            target = assets / path.relative_to(shop / 'assets' / base['revision'])
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copyfile(path, target)

    def asset(kind, content, suffix):
        filename = hashlib.sha256(content).hexdigest() + suffix
        path = assets / kind / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(content)
        return filename

    output = json.loads(json.dumps(base))
    output.update(revision=revision, particles_schema=SCHEMA)
    statistics = {}
    for item_id, item in output['rings'].items():
        clip = json.loads(gzip.decompress((assets / 'motions' / item['motion']).read_bytes()))
        statistics[item_id] = {'emitters': 0, 'systems': 0}
        for group in groups[item_id]:
            descriptor = group['descriptor']
            animated = json.loads(gzip.decompress((assets / 'motions' / descriptor['animation']).read_bytes()))
            model = parse_md9(models.resolve(group['model_source']), models, allow_duplicate_names=True, allow_missing_textures=True)
            animation_path = models.resolve(str(Path(group['model_source']).with_suffix('.ani')).replace('\\', '/'))
            if not animation_path:
                raise ValueError('Missing particle anchor animation')
            animation = read_animation(animation_path, allow_duplicate_names=True)
            names = {bone['name'].strip().casefold(): index for index, bone in enumerate(model['bones'])}
            anchors, emitters = {}, []
            for emitter in group['emitters']:
                hook = emitter['attachment']
                key = hook['bone'].strip().casefold()
                if key in ['', 'none']:
                    key = ''
                elif key not in names:
                    notes[item_id].append({'missing_bone': hook['bone'], 'particle': emitter['source_file']})
                    continue
                anchors.setdefault(key, [])
                image = load_image(emitter['texture_path'])
                stream = io.BytesIO(); image.save(stream, format='WEBP', lossless=True, method=3)
                texture = asset('textures', stream.getvalue(), '.webp')
                emitters.append({**{key: value for key, value in emitter.items() if key not in ['texture_path', 'texture', 'attachment']}, 'texture': texture,
                                 'anchor': key, 'start_tick': hook['start'], 'end_tick': hook['end'], 'attachment_position': hook['position'],
                                 'attachment_rotation': hook['rotation'], 'attachment_flags': hook['flags']})
            if not emitters:
                continue
            pose = np.array(couple_scene_pose(clip['actors'][descriptor['sex']]['side'], descriptor['sex'])) if group['kind'] == 'effect' else np.eye(4)
            for frame in range(animated['frame_count']):
                tick = animation['duration'] * frame / animated['frame_count'] if group['kind'] == 'ornament' else effect_time(clip['source_duration'] * frame / animated['frame_count'], animation['duration'], animated['loop'])
                worlds = effect_worlds(model, animation, tick)
                for name, values in anchors.items():
                    matrix = (worlds[names[name]] if name else np.eye(4)) @ pose
                    values.extend(np.round(matrix, 6).ravel().tolist())
            payload = {'schema': SCHEMA, 'texture_revision': revision, 'frame_count': animated['frame_count'], 'source_duration': animated['source_duration'],
                       'anchors': anchors, 'emitters': emitters,
                       'reconstruction': 'Source textures, transforms, sprite rectangles, color and size keys. Binary timing follows animation ticks; engine emission/orbit flags approximated with deterministic preview pools.'}
            raw = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
            filename = asset('motions', gzip.compress(raw, compresslevel=6, mtime=0), '.json.gz')
            if group['kind'] == 'ornament':
                item['ornament']['particles'] = filename
            else:
                for effect in item['effects']:
                    if effect['model'] == descriptor['model'] and effect['animation'] == descriptor['animation']:
                        effect['particles'] = filename
            statistics[item_id]['emitters'] += len(emitters)
            statistics[item_id]['systems'] += 1
        print(json.dumps({'item': item_id, **statistics[item_id]}), flush=True)
    write_json(shop / 'couple-particles-catalog.json', output)
    write_json(shop / 'particle-input/audit.json', {'revision': revision, 'items': statistics, 'notes': notes})
    files = []
    for relative, path in sorted(source.files.items()):
        target = shop / 'particle-input' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.resolve() != path.resolve():
            shutil.copyfile(path, target)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('Particle source snapshot hash mismatch')
        files.append({'relative_path': relative, 'sha256': digest})
    write_json(shop / 'particle-input/source-manifest.json', {'revision': revision, 'base_revision': base['revision'], 'files': files})
    print(json.dumps({'revision': revision, 'rings_with_particles': sum(row['emitters'] > 0 for row in statistics.values()), 'emitters': sum(row['emitters'] for row in statistics.values())}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--shop-root', type=Path, required=True)
    parser.add_argument('--base-catalog', type=Path, required=True)
    args = parser.parse_args()
    build(args.game_root, args.shop_root, args.base_catalog)
