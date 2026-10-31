import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

import numpy as np

from prepare_couple_preview import script, tags
from prepare_shop import load_image, parse_md9, write_json
from shop_archive import ArchiveSource
from shop_pose import couple_scene_pose, local_pose, read_animation


SCHEMA = 'shop-couple-effect-v1'


def effect_worlds(model, animation, time):
    worlds = {}

    def world(index):
        if index in worlds:
            return worlds[index]
        bone = model['bones'][index]
        track = animation['tracks'].get(bone['name'])
        matrix = np.array(local_pose(track, bone['matrix'], time)) if track else bone['matrix']
        worlds[index] = matrix @ world(bone['parent']) if bone['parent'] >= 0 else matrix
        return worlds[index]

    for index in range(len(model['bones'])):
        world(index)
    return worlds


def effect_time(tick, duration, loop):
    return tick % duration if loop and duration else min(tick, duration)


class EffectSource:
    def __init__(self, game, snapshot):
        self.game, self.snapshot = game.resolve(), snapshot.resolve()
        self.archive = ArchiveSource(game, snapshot)
        self.files = {}

    def resolve(self, relative):
        path = self.archive.resolve(relative)
        if path:
            self.files[relative.replace('\\', '/').casefold()] = path
        return path

    def relative(self, path):
        for root in [self.game, self.snapshot]:
            if path.is_relative_to(root):
                return path.relative_to(root).as_posix()
        raise ValueError('Effect resource outside source roots')

    def texture(self, model, name):
        relative = str(Path(self.relative(model)).parent / name).replace('\\', '/')
        return next((path for extension in [Path(relative).suffix, '.dds', '.tga', '.bmp']
                     if (path := self.resolve(str(Path(relative).with_suffix(extension)).replace('\\', '/')))), None)


def build(game, shop, base_path):
    base = json.loads(base_path.read_text(encoding='utf8'))
    source = EffectSource(game, shop / 'couple-effect-input')
    rings = {row['Index']: row for row in tags(game, 'ring.txt', 'Couple')}
    effects = {row['Id']: row for row in tags(game, 'roomfx.txt', 'Fx')}
    actions = {row['Name'].casefold(): row for row in tags(game, 'effectid.txt', 'Action')}
    commands = {row.get('ItemCode'): row for row in tags(game, 'emoticon2.txt', 'Emoticon')}
    aliases = {match[2].casefold(): match[1] for line in script(game, 'animap.txt').splitlines()
               if (match := re.match(r'\s*(\S+\.ani)\s+(.+?)\s*$', line, re.I))}
    for filename in ['ring.txt', 'roomfx.txt', 'effectid.txt', 'emoticon2.txt', 'animap.txt']:
        source.resolve('rnr_script/' + filename)
    records, audit = {}, {}

    def resource(effect):
        path = source.resolve(effect.get('File', ''))
        if not path or path.suffix.lower() != '.md9':
            raise ValueError('Missing model')
        animation_path = source.resolve(aliases.get(effect.get('Ani', '').casefold(), str(Path(effect['File']).with_suffix('.ani'))))
        if not animation_path:
            raise ValueError('Missing model animation')
        model = parse_md9(path, source, allow_duplicate_names=True, allow_missing_textures=True)
        animation = read_animation(animation_path, allow_duplicate_names=True)
        omitted = [bone['name'] for bone in model['bones'] if bone['nf'] and model['materials'][bone['material']] is None]
        return {'model': model, 'animation': animation, 'loop': effect.get('Loop') == '1', 'omitted': omitted,
                'source': source.relative(path), 'animation_source': source.relative(animation_path)}

    for item_id, item in base['rings'].items():
        entry, notes = {'effects': []}, {}
        try:
            entry['ornament'] = resource(effects[rings[item_id]['RoomFx']])
            notes['ornament'] = entry['ornament']['source']
            notes['omitted_untextured_meshes'] = entry['ornament']['omitted']
        except (KeyError, ValueError) as error:
            notes['ornament_error'] = str(error)
        # 대기실 장식을 모션 소품으로 잘못 배치하지 않는다. 소품은 Action의 명시적인 연결만 사용한다.
        action = actions.get(commands.get(item_id, {}).get('Ani', '').casefold(), {})
        seen = set()
        for key in ['boy1', 'girl1']:
            effect = effects.get(action.get(key), {})
            if not effect or effect.get('File', '').casefold() in seen:
                continue
            seen.add(effect['File'].casefold())
            try:
                entry['effects'].append({**resource(effect), 'sex': 'male' if key.startswith('boy') else 'female'})
            except ValueError as error:
                notes.setdefault('effect_errors', []).append(str(error))
        notes['action_models'] = [effect['source'] for effect in entry['effects']]
        records[item_id], audit[item_id] = entry, notes
    generation = hashlib.sha256(SCHEMA.encode() + b':v2-full-lobby-cycle-action-shared-ticks:' + base_path.read_bytes())
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
        name = hashlib.sha256(content).hexdigest() + suffix
        target = assets / kind / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(content)
        return name

    def encoded(kind, data):
        return asset(kind, gzip.compress(json.dumps(data, separators=(',', ':'), allow_nan=False).encode(), compresslevel=6, mtime=0), '.json.gz')

    output = {**base, 'revision': revision, 'effects_schema': SCHEMA, 'rings': {}}
    for item_id, item in base['rings'].items():
        clip = json.loads(gzip.decompress((assets / 'motions' / item['motion']).read_bytes()))
        record = records[item_id]
        result = {**item, 'effects': []}
        for kind, effect in [('ornament', record.get('ornament')), *[('effect', effect) for effect in record['effects']]]:
            if not effect:
                continue
            model, animation = effect['model'], effect['animation']
            meshes, selected = [], []
            for index, bone in enumerate(model['bones']):
                texture = model['materials'][bone['material']]
                if not bone['nf'] or texture is None:
                    continue
                image = load_image(texture)
                pixels = np.asarray(image)
                blend = bool(np.any((pixels[:, :, 3] > 0) & (pixels[:, :, 3] < 255)))
                stream = io.BytesIO(); image.save(stream, format='WEBP', lossless=True, method=3)
                name = asset('textures', stream.getvalue(), '.webp')
                meshes.append({'name': bone['name'], 'vertices': np.round(bone['vertices'], 5).ravel().tolist(),
                               'indices': bone['indices'].ravel().tolist(), 'texture': name, 'blend': blend})
                selected.append(index)
            if not meshes:
                raise ValueError(f'Empty effect model: {item_id}')
            model_file = encoded('models', {'meshes': meshes, 'texture_revision': revision})
            frame_count = max(2, min(5400, round(clip['frame_count'] * animation['duration'] / clip['source_duration']))) if kind == 'ornament' else clip['frame_count']
            frames = [[] for _ in selected]
            bounds = np.array([[np.inf] * 3, [-np.inf] * 3])
            pose = np.array(couple_scene_pose(clip['actors'][effect['sex']]['side'], effect['sex'])) if kind == 'effect' else np.eye(4)
            for frame in range(frame_count):
                time = animation['duration'] * frame / frame_count if kind == 'ornament' else effect_time(clip['source_duration'] * frame / frame_count, animation['duration'], effect['loop'])
                worlds = effect_worlds(model, animation, time)
                for number, index in enumerate(selected):
                    matrix = worlds[index] @ pose
                    frames[number].extend(np.round(matrix, 6).ravel().tolist())
                    vertices = model['bones'][index]['vertices'][:, :3]
                    points = vertices @ matrix[:3, :3] + matrix[3, :3]
                    bounds[0] = np.minimum(bounds[0], points.min(0)); bounds[1] = np.maximum(bounds[1], points.max(0))
            animated = encoded('motions', {'schema': SCHEMA, 'frame_count': frame_count, 'source_duration': animation['duration'], 'relative_duration': animation['duration'] / clip['source_duration'],
                                           'loop': effect['loop'], 'bounds': np.round(bounds, 5).tolist(),
                                           'meshes': [{'name': mesh['name'], 'frames': values} for mesh, values in zip(meshes, frames)]})
            descriptor = {'model': model_file, 'animation': animated}
            if kind == 'ornament':
                result['ornament'] = descriptor
            else:
                result['effects'].append({**descriptor, 'sex': effect['sex']})
        output['rings'][item_id] = result
        print(json.dumps({'item': item_id, 'ornament': 'ornament' in result, 'effects': len(result['effects'])}), flush=True)
    write_json(shop / 'couple-effects-catalog.json', output)
    write_json(shop / 'couple-effect-input/audit.json', audit)
    files = [{'relative_path': relative, 'source': str(path.resolve()), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for relative, path in sorted(source.files.items())]
    write_json(shop / 'couple-effect-input/source-manifest.json', {'revision': revision, 'files': files})
    if os.name == 'nt':
        copy_script = shop / 'couple-effect-input/copy-source.ps1'
        copy_script.write_text(r'''
        param([string]$snapshot)
        $ErrorActionPreference='Stop'
        $manifest=Get-Content -LiteralPath (Join-Path $snapshot 'source-manifest.json') -Raw | ConvertFrom-Json
        foreach($file in $manifest.files){
          $target=Join-Path $snapshot $file.relative_path
          New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
          if([IO.Path]::GetFullPath($file.source) -ne [IO.Path]::GetFullPath($target)){cp -LiteralPath $file.source -Destination $target -Force}
          if((Get-FileHash -LiteralPath $target).Hash.ToLower() -ne $file.sha256){throw 'Source snapshot hash mismatch'}
        }
        ''', encoding='utf8')
        subprocess.run([shutil.which('pwsh') or 'powershell', '-NoProfile', '-File', str(copy_script.resolve()), str((shop / 'couple-effect-input').resolve())], check=True)
    else:
        for file in files:
            target = shop / 'couple-effect-input' / file['relative_path']
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.resolve() != Path(file['source']):
                shutil.copyfile(file['source'], target)
    print(json.dumps({'revision': revision, 'ornaments': sum('ornament' in row for row in output['rings'].values()),
                      'action_effects': sum(len(row['effects']) for row in output['rings'].values())}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--shop-root', type=Path, required=True)
    parser.add_argument('--base-catalog', type=Path, required=True)
    args = parser.parse_args()
    build(args.game_root, args.shop_root, args.base_catalog)
