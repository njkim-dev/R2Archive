import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import struct

import numpy as np

from prepare_shop import Builder, BASE_FILES, bone_worlds, md9_materials, write_json
from shop_archive import ArchiveSource
from shop_pose import read_animation, local_pose, couple_scene_pose, couple_actor_side


SCHEMA = 'shop-couple-motion-v1'
NO_MOTION = {30080, 30090, 30030, 30078, 30005, 30006, 30007}


def script(root, name):
    data = (root / 'rnr_script' / name).read_bytes()
    try:
        return data.decode('utf-8-sig')
    except UnicodeError:
        return data.decode('cp949')


def tags(root, filename, tag):
    text = re.sub(r'<!--.*?-->', '', script(root, filename), flags=re.S)
    return [dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', row)) for row in re.findall(fr'<{tag}\b([^>]*)>', text)]


def collect(game, shop, catalog):
    source = ArchiveSource(game, shop / 'couple-input')
    aliases = {}
    for line in script(game, 'animap.txt').splitlines():
        match = re.match(r'\s*(\S+\.ani)\s+(.+?)\s*$', line, re.I)
        if match:
            aliases[match[2].casefold()] = match[1]
    sounds = {row['Name'].casefold(): int(row['Id']) for row in tags(game, 'effectsound.txt', 'Sound')}
    soundpaths = {int(m[1]): m[2] for line in script(game, 'fxsound.txt').splitlines() if (m := re.match(r'\s*(\d+)\s+(\S+)', line))}
    effects = {row['Name'].casefold(): row for row in tags(game, 'effectid.txt', 'Action')}
    commands = tags(game, 'emoticon2.txt', 'Emoticon')
    records, unavailable = {}, {}
    for item in catalog['items']:
        if not item['show'] or item['category'] != '507':
            continue
        item_id = item['id']
        if item_id in NO_MOTION:
            unavailable[str(item_id)] = 'no_motion'
            continue
        for command in commands:
            if command.get('ItemCode') != str(item_id):
                continue
            name = command['Ani'].casefold()
            actors = {sex: source.resolve(aliases[name + '_' + actor]) if name + '_' + actor in aliases else None for sex, actor in [('male', 'boy'), ('female', 'girl')]}
            sound_id = sounds.get(name, int(effects.get(name, {}).get('SndBoy1', -1)))
            audio = source.resolve(soundpaths[sound_id]) if sound_id in soundpaths else None
            if audio and all(actors.values()):
                sides = {}
                for sex, actor in [('male', 'boy'), ('female', 'girl')]:
                    animation = read_animation(actors[sex])
                    variants = {}
                    for side, letter in [('left', 'l'), ('right', 'r')]:
                        alias = name + '_' + letter + '_' + actor
                        path = source.resolve(aliases[alias]) if alias in aliases else None
                        if path:
                            variants[side] = read_animation(path)
                    sides[sex] = couple_actor_side(animation, variants, 'left' if sex == 'male' else 'right')
                if len(set(sides.values())) != 2:
                    raise ValueError(f'Conflicting couple actor roles: {item_id}')
                audio_target = shop / 'couple-input' / soundpaths[sound_id]
                audio_target.parent.mkdir(parents=True, exist_ok=True)
                if audio.resolve() != audio_target.resolve():
                    shutil.copyfile(audio, audio_target)
                records[str(item_id)] = {'name': item['name'], 'actors': {sex: str(path.resolve()) for sex, path in actors.items()}, 'audio': str(audio_target.resolve()), 'actor_roles': sides}
                break
        if str(item_id) not in records:
            unavailable[str(item_id)] = 'missing_assets'
    return records, unavailable


def bindings(builder):
    result, unresolved = {}, []
    base_names = {sex: {bone['name'] for bone in model['bones']} for sex, model in builder.bases.items()}
    for key, filename in builder.cache.items():
        match = re.fullmatch(r'(model|attachment):(.+\.md9):(male|female):False', key)
        if not match:
            continue
        kind, relative, sex = match.groups()
        path = builder.resolver.resolve(relative)
        if not path:
            continue
        data, _, offset, _ = md9_materials(path)
        count = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        nodes = []
        skeleton = []
        for i in range(count):
            start = offset + i * 136
            name = data[start:start + 32].split(b'\0')[0].decode('cp949')
            parent = struct.unpack_from('<i', data, start + 108)[0]
            nodes.append((name, parent))
            skeleton.append({'name': name, 'parent': parent, 'matrix': np.frombuffer(data, dtype='<f4', count=16, offset=start + 32).reshape(4, 4).astype(float)})
        custom = {}
        worlds = None
        for index, (name, _) in enumerate(nodes):
            displayed = 'Accessory-' + name if kind == 'attachment' and name not in ['LeftHand', 'RightHand'] else name
            if displayed in base_names[sex]:
                continue
            seen = set()
            chain = []
            mesh_index = index
            while index >= 0 and index not in seen:
                seen.add(index)
                ancestor, parent = nodes[index]
                if ancestor in base_names[sex]:
                    if any(node['name'] == 'Skirt' for node in chain):
                        if worlds is None:
                            worlds = bone_worlds({'bones': skeleton}, builder.bases[sex], builder.poses[sex])
                        custom[displayed] = {'bone': ancestor, 'parent': np.round(worlds[ancestor], 7).ravel().tolist(), 'inverse': np.round(np.linalg.inv(worlds[nodes[mesh_index][0]]), 7).ravel().tolist(), 'chain': [{'name': node['name'], 'bind': np.round(node['matrix'], 7).ravel().tolist()} for node in reversed(chain)]}
                    else:
                        custom[displayed] = ancestor
                    break
                chain.append(skeleton[index])
                index = parent
            else:
                unresolved.append([filename, displayed])
                custom[displayed] = 'Waist'
        if custom:
            result[filename] = custom
    return result, unresolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--shop-root', type=Path, required=True)
    parser.add_argument('--catalog', required=True)
    parser.add_argument('--audio-info', type=Path)
    args = parser.parse_args()
    game, shop = args.game_root.resolve(), args.shop_root.resolve()
    catalog_root = shop / 'catalogs' / args.catalog
    catalog = json.loads((catalog_root / 'catalog.json').read_text(encoding='utf8'))
    records, unavailable = collect(game, shop, catalog)
    plan = {'schema': SCHEMA, 'catalog': args.catalog, 'records': records, 'unavailable': unavailable}
    write_json(shop / 'couple-input' / 'plan.json', plan)
    if not args.audio_info:
        print(json.dumps({'stage': 'collected', 'supported': len(records), 'unavailable': unavailable}))
        return
    audio_info = json.loads(args.audio_info.read_text(encoding='utf8'))
    manifest = json.loads((catalog_root / 'source-manifest.json').read_text(encoding='utf8'))
    builder = Builder(Path(manifest['snapshot_root']), shop, manifest)
    bone_bindings, unresolved = bindings(builder)
    encoded = json.dumps({'schema': SCHEMA, 'bindings': bone_bindings}, separators=(',', ':'), allow_nan=False).encode()
    generation = hashlib.sha256(SCHEMA.encode() + b':v5-original-mf-role-local-shared-clock:' + encoded)
    for item_id, record in sorted(records.items()):
        generation.update(item_id.encode())
        generation.update(json.dumps({sex: couple_scene_pose(record['actor_roles'][sex], sex) for sex in record['actors']}, sort_keys=True).encode())
        for path in [record['audio'], *record['actors'].values()]:
            generation.update(Path(path).read_bytes())
        generation.update(str(audio_info[item_id]['duration']).encode())
    for sex, base in builder.bases.items():
        generation.update(base['path'].read_bytes())
        generation.update(str(manifest['pose_times'][sex]).encode())
        for matrix in bone_worlds(base, base, builder.poses[sex]).values():
            generation.update(matrix.tobytes())
    revision = generation.hexdigest()[:20]
    assets = shop / 'assets' / revision
    def asset(kind, content, suffix):
        name = hashlib.sha256(content).hexdigest() + suffix
        target = assets / kind / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(content)
        return name
    binding_file = asset('motions', gzip.compress(encoded, mtime=0), '.json.gz')
    supported = {}
    for item_id, record in records.items():
        duration = float(audio_info[item_id]['duration'])
        if not 0 < duration <= 180:
            raise ValueError('Invalid couple audio duration')
        frames = max(2, math.ceil(duration * 30))
        payload = {'schema': SCHEMA, 'duration': duration, 'frame_count': frames, 'bases': catalog['bases'], 'actors': {}}
        animations = {sex: read_animation(Path(path)) for sex, path in record['actors'].items()}
        shared_duration = max(animation['duration'] for animation in animations.values())
        for sex, base in builder.bases.items():
            animation = animations[sex]
            scene_pose = np.array(couple_scene_pose(record['actor_roles'][sex], sex))
            names = [bone['name'] for bone in base['bones']]
            static = bone_worlds(base, base, builder.poses[sex])
            inverse = {name: np.linalg.inv(static[name]) for name in names}
            matrices = []
            for frame in range(frames):
                time = shared_duration * frame / frames
                locals_ = {bone['name']: np.array(local_pose(animation['tracks'][bone['name']], bone['matrix'], time)) for bone in base['bones'] if bone['name'] in animation['tracks']}
                worlds = bone_worlds(base, base, {'locals': locals_, 'floor_offset': builder.poses[sex]['floor_offset']})
                for name in names:
                    world = worlds[name] @ scene_pose
                    matrices.extend(np.round(inverse[name] @ world, 6).ravel().tolist())
            extras = {}
            for name, track in animation['tracks'].items():
                if name in names:
                    continue
                extra_frames = []
                for frame in range(frames):
                    extra_frames.extend(np.round(local_pose(track, np.eye(4), shared_duration * frame / frames), 6).ravel().tolist())
                extras[name] = {'frames': extra_frames, **{key: bool(track[key]) for key in ['position', 'rotation', 'scale']}}
            payload['actors'][sex] = {'bones': names, 'frames': matrices, 'extras': extras, 'side': record['actor_roles'][sex], 'source_duration': animation['duration']}
        payload['source_duration'] = shared_duration
        data = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
        audio_path = Path(record['audio'])
        supported[item_id] = {'motion': asset('motions', gzip.compress(data, compresslevel=6, mtime=0), '.json.gz'), 'audio': asset('audio', audio_path.read_bytes(), audio_path.suffix.lower()), 'duration': duration}
    output = {'schema': SCHEMA, 'revision': revision, 'base_catalog': args.catalog, 'bindings': binding_file, 'rings': supported, 'unavailable': unavailable}
    write_json(shop / 'couple-catalog.json', output)
    write_json(shop / 'couple-input' / 'binding-audit.json', {'models': len(bone_bindings), 'unresolved': unresolved})
    print(json.dumps({'stage': 'built', 'revision': revision, 'supported': len(supported), 'custom_bound_models': len(bone_bindings), 'unresolved': len(unresolved), 'bytes': sum(p.stat().st_size for p in assets.rglob('*') if p.is_file())}))


if __name__ == '__main__':
    main()
