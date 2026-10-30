from __future__ import annotations

import argparse
import collections
import concurrent.futures
import csv
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import threading
import unicodedata

import numpy as np
from PIL import Image


SCHEMA = 'shop-assets-v3-attachments'
SCRIPT_FILES = ['rnr_script/shop.txt', 'rnr_script/shop.bin', 'rnr_script/item.csv',
                'rnr_script/pet.xml', 'rnr_script/growpet.xml', 'rnr_script/face.txt',
                'rnr_script/config/face_tbface.json', 'rnr_script/roomfx.txt']
BASE_FILES = {'male': 'rnr_char/boy/boi.md9', 'female': 'rnr_char/girl/girl.md9'}
SLOTS = {1: 'hair', 2: 'top', 3: 'bottom', 4: 'shoes', 6: 'face'}
PRICE_LABELS = {'P': '단품', 'PN': '단품', 'PH': '기타 가격', 'PI': '무기한'}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f'.{threading.get_ident()}.tmp')
    temporary.write_bytes(data)
    os.replace(temporary, path)


def write_json(path, value):
    atomic_bytes(path, json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8'))


def read_text(path):
    return path.read_bytes().decode('cp949')


def attributes(text):
    return dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', text))


class Resolver:
    def __init__(self, root):
        self.root = root.resolve()
        self.paths = {}
        for directory in ['rnr_char', 'rnr_item', 'rnr_item_mip', 'rnr_script', 'rnr_room_fx']:
            base = self.root / directory
            if base.exists():
                for path in base.rglob('*'):
                    if path.is_file():
                        self.paths[path.relative_to(self.root).as_posix().casefold()] = path

    def resolve(self, relative):
        if not relative:
            return None
        value = str(relative).replace('\\', '/').strip()
        if value.startswith('/') or '..' in value.split('/') or ':' in value:
            return None
        return self.paths.get(value.casefold())

    def relative(self, path):
        return path.relative_to(self.root).as_posix()

    def texture(self, model, name):
        relative = (model.parent / name).relative_to(self.root).as_posix()
        for candidate in [relative, *[str(Path(relative).with_suffix(ext)).replace('\\', '/')
                                      for ext in ['.dds', '.tga', '.bmp']]]:
            found = self.resolve(candidate)
            if found:
                return found
        return None


def md9_materials(path):
    data = path.read_bytes()
    modern = struct.unpack_from('<I', data)[0] == 0xffffffff
    offset = 4 if modern else 0
    count = struct.unpack_from('<I', data, offset)[0]
    if not 0 < count < 200:
        raise ValueError('unsupported material count')
    offset += 4
    materials = []
    for _ in range(count):
        if offset + (116 if modern else 100) > len(data):
            raise ValueError('truncated material')
        materials.append(data[offset + 68:offset + 100].split(b'\0')[0].decode('cp949'))
        offset += 116 if modern else 100
    return data, modern, offset, materials


def parse_md9(path, resolver):
    data, modern, offset, names = md9_materials(path)
    materials = []
    for name in names:
        texture = resolver.texture(path, name)
        materials.append(texture)
    count = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    if not 0 < count < 400 or offset + count * 136 + 8 > len(data):
        raise ValueError('unsupported bone table')
    bones = []
    for i in range(count):
        start = offset + i * 136
        name = data[start:start + 32].split(b'\0')[0].decode('cp949')
        matrix = np.frombuffer(data, dtype='<f4', count=16, offset=start + 32).reshape(4, 4).astype(float)
        nv, nf, material, parent = struct.unpack_from('<4i', data, start + 96)
        if not (0 <= nv <= 65536 and 0 <= nf <= 200000 and 0 <= material < len(materials)
                and -1 <= parent < count and parent != i and np.isfinite(matrix).all()):
            raise ValueError('invalid bone geometry or parent')
        bones.append({'name': name, 'matrix': matrix, 'nv': nv, 'nf': nf,
                      'material': material, 'parent': parent})
    if len({b['name'] for b in bones}) != len(bones):
        raise ValueError('duplicate bone names')
    for bone in bones:
        if bone['nf'] and materials[bone['material']] is None:
            raise ValueError('missing texture: ' + names[bone['material']])
    offset += count * 136 + 8
    vertex_count = sum(b['nv'] for b in bones)
    if vertex_count > 250000 or offset + vertex_count * 32 + sum(b['nf'] for b in bones) * 6 > len(data):
        raise ValueError('truncated geometry')
    vertices = np.frombuffer(data, dtype='<f4', count=vertex_count * 8, offset=offset).reshape(vertex_count, 8).copy()
    if not np.isfinite(vertices).all() or (vertices.size and np.max(np.abs(vertices)) > 10000000):
        raise ValueError('invalid vertex values')
    offset += vertex_count * 32
    start = 0
    for bone in bones:
        nv, nf = bone['nv'], bone['nf']
        bone['vertices'] = vertices[start:start + nv]
        start += nv
        faces = np.frombuffer(data, dtype='<u2', count=nf * 3, offset=offset).reshape(nf, 3).copy()
        if faces.size and faces.max() >= nv:
            raise ValueError('face index out of bounds')
        offset += nf * 6
        bone['indices'] = faces
    return {'bones': bones, 'materials': materials, 'path': path, 'modern': modern}


def posed_meshes(model, base=None):
    model_bones = {b['name']: b for b in model['bones']}
    base_bones = {b['name']: b for b in base['bones']} if base else {}
    all_bones = {**base_bones, **model_bones}
    worlds = {}

    def world(name, active):
        if name in worlds:
            return worlds[name]
        if name in active:
            raise ValueError('cyclic bone hierarchy')
        active = active | {name}
        bone = all_bones[name]
        local = bone['matrix'].copy()
        if base and name in ['LeftArm1', 'RightArm1']:
            angle = math.radians(-72 if name == 'LeftArm1' else 72)
            c, s = math.cos(angle), math.sin(angle)
            local[:3, :3] = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]]) @ local[:3, :3]
        if base and name in base_bones:
            bb = base_bones[name]
            parent = base['bones'][bb['parent']]['name'] if bb['parent'] >= 0 else None
        elif name in model_bones:
            parent = model['bones'][bone['parent']]['name'] if bone['parent'] >= 0 else None
        else:
            parent = base['bones'][bone['parent']]['name'] if bone['parent'] >= 0 else None
        worlds[name] = local @ world(parent, active) if parent else local
        return worlds[name]

    meshes = []
    for bone in model['bones']:
        if not bone['nf']:
            continue
        matrix = world(bone['name'], set())
        vertices = bone['vertices'].astype(float)
        vertices[:, :3] = vertices[:, :3] @ matrix[:3, :3] + matrix[3, :3]
        vertices[:, 3:6] = vertices[:, 3:6] @ matrix[:3, :3]
        if not np.isfinite(vertices).all():
            raise ValueError('invalid transformed vertices')
        meshes.append({'name': bone['name'], 'vertices': vertices, 'indices': bone['indices'],
                       'texture_path': model['materials'][bone['material']]})
    if not meshes:
        raise ValueError('empty mesh')
    if base:
        positions = np.concatenate([m['vertices'][:, :3] for m in meshes])
        if np.abs(positions).max() > 1000:
            raise ValueError('model exceeds character preview bounds')
    return meshes


def indexed_tga(data):
    ident, cmap, kind = data[:3]
    first, length, bits = struct.unpack_from('<HHB', data, 3)
    width, height = struct.unpack_from('<HH', data, 12)
    depth, descriptor = data[16:18]
    if cmap != 1 or kind not in [1, 9] or depth not in [8, 16] or bits not in [15, 16, 24, 32]:
        raise ValueError('unsupported indexed TGA')
    offset = 18 + ident
    step = (bits + 7) // 8
    raw = data[offset:offset + length * step]
    offset += length * step
    if bits in [24, 32]:
        source = np.frombuffer(raw, dtype='u1').reshape(length, step)
        palette = np.full((length, 4), 255, dtype='u1')
        palette[:, :3] = source[:, [2, 1, 0]]
        if bits == 32:
            palette[:, 3] = source[:, 3]
    else:
        values = np.frombuffer(raw, dtype='<u2')
        palette = np.column_stack([((values >> 10) & 31) * 255 // 31,
                                   ((values >> 5) & 31) * 255 // 31, (values & 31) * 255 // 31,
                                   np.where(values & 32768, 255, 0) if bits == 16 else np.full(length, 255)]).astype('u1')
    count = width * height
    if not 0 < count <= 16000000:
        raise ValueError('invalid indexed TGA dimensions')
    index_step = depth // 8
    if kind == 1:
        indices = np.frombuffer(data, dtype='u1' if depth == 8 else '<u2', count=count, offset=offset)
    else:
        unpacked = bytearray()
        while len(unpacked) < count * index_step:
            packet = data[offset]
            offset += 1
            n = (packet & 127) + 1
            if packet & 128:
                unpacked.extend(data[offset:offset + index_step] * n)
                offset += index_step
            else:
                unpacked.extend(data[offset:offset + n * index_step])
                offset += n * index_step
        indices = np.frombuffer(unpacked, dtype='u1' if depth == 8 else '<u2', count=count)
    indices = indices.astype('i4') - first
    if indices.min() < 0 or indices.max() >= length:
        raise ValueError('indexed TGA palette index out of range')
    pixels = palette[indices].reshape(height, width, 4)
    if not descriptor & 32:
        pixels = pixels[::-1]
    if descriptor & 16:
        pixels = pixels[:, ::-1]
    return Image.fromarray(pixels.copy())


def load_image(path):
    try:
        with Image.open(path) as source:
            image = source.convert('RGBA')
    except (ValueError, OSError):
        if path.suffix.lower() != '.tga':
            raise
        image = indexed_tga(path.read_bytes())
    if path.suffix.lower() == '.bmp':
        pixels = np.asarray(image).copy()
        mask = np.all(pixels[:, :, :3] == [255, 0, 255], axis=2)
        if mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any():
            h, w = mask.shape
            queue = collections.deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
                                      + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
            while queue:
                x, y = queue.popleft()
                if not (0 <= x < w and 0 <= y < h) or not mask[y, x]:
                    continue
                mask[y, x] = False
                pixels[y, x, 3] = 0
                queue.extend([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)])
            image = Image.fromarray(pixels)
    return image


def classify(row, model):
    category = int(row.get('ShopIndex', '0'))
    family, part = divmod(category, 100)
    suffix = Path(model).stem[-1:].upper()
    sex = 'male' if suffix in ['B', 'M'] else 'female' if suffix in ['G', 'F'] else 'common'
    if family in [1, 2, 3, 4] and part in SLOTS:
        if suffix not in ['B', 'M', 'G', 'F']:
            sex = 'male' if family in [1, 3] else 'female'
        return 'wearable', SLOTS[part], sex
    index = int(row['Index'])
    if category == 505 and (600000 <= index < 700000 or 4000000 <= index < 4100000):
        return 'wearable', 'pet', 'common'
    if category in [503, 506, 509, 601, 1301, 2211, 6701] or 4100000 <= index < 4300000:
        return 'functional', None, 'common'
    return 'other', None, sex


def name_key(name):
    value = unicodedata.normalize('NFKC', name).strip()
    value = re.sub(r'\s*\((?:남|여|M|F)\)\s*$', '', value, flags=re.I)
    return re.sub(r'\s+', ' ', value).casefold()


def face_textures(root, resolver):
    mapping = {}
    for tag in re.findall(r'<Face\b([^>]*)>', read_text(root / 'rnr_script/face.txt')):
        row = attributes(tag)
        if not {'ItemEffect', 'Index'} <= row.keys():
            continue
        key = (row['ItemEffect'], row.get('CharType', '0'))
        if key in mapping and mapping[key] != row['Index']:
            raise ValueError('ambiguous face effect mapping')
        mapping[key] = row['Index']
    definitions = json.loads(read_text(root / 'rnr_script/config/face_tbface.json'))
    result = {}
    for key, index in mapping.items():
        definition = definitions.get(index, {})
        directory = str(definition.get('resPath', index.zfill(2)))
        normal = definition.get('normalText', 'nor')
        result[key] = resolver.resolve(f'rnr_char/face/{directory}/{normal}.dds')
    return result


def load_catalog(root, resolver):
    rows = [attributes(line) for line in read_text(root / SCRIPT_FILES[0]).splitlines() if line.strip()]
    if any(not {'Index', 'Name', 'Show'} <= row.keys() for row in rows):
        raise ValueError('invalid shop row')
    binary = (root / SCRIPT_FILES[1]).read_bytes()
    binary_models = {}
    offset = 4
    for _ in range(struct.unpack_from('<I', binary)[0]):
        strings = []
        for _ in range(3):
            length = binary[offset]
            offset += 1
            strings.append(binary[offset:offset + length].decode('cp949'))
            offset += length
        index = struct.unpack_from('<I', binary, offset + 8)[0]
        binary_models[index] = strings
        offset += 77
    if offset != len(binary) or {int(row['Index']) for row in rows} != set(binary_models):
        raise ValueError('shop.bin and shop.txt item IDs differ')
    effects = list(csv.reader(io.StringIO(read_text(root / SCRIPT_FILES[2]))))
    pets = {row['Id']: row for row in [attributes(tag) for tag in re.findall(r'<Pet\b([^>]*)>', read_text(root / SCRIPT_FILES[3]))] if 'Id' in row}
    faces = face_textures(root, resolver)
    summons = collections.defaultdict(set)
    for tag in re.findall(r'<Fx\b([^>]*)>', re.sub(r'<!--.*?-->', '', read_text(root / 'rnr_script/roomfx.txt'), flags=re.S)):
        effect = attributes(tag)
        for index in re.findall(r'(?<!\d)(\d{6,12})(?!\d)', effect.get('File', '')):
            summons[int(index)].add(effect['File'])
    items = []
    for position, row in enumerate(rows):
        index = int(row['Index'])
        image_path, model_path, _ = binary_models[index]
        if 600000 <= index < 700000:
            model_path = pets.get(str(index - 600000), {}).get('Model', model_path)
        department, slot, sex = classify(row, model_path)
        preview_slot = 'accessory' if int(row.get('ShopIndex', '0')) in [105, 205, 305, 405] else 'summon' if row.get('ShopIndex') == '1007' else slot
        if preview_slot == 'accessory':
            sex = 'male' if int(row['ShopIndex']) in [105, 305] else 'female'
        if preview_slot == 'summon':
            candidates = summons.get(index, set())
            model_path = next(iter(candidates)) if len(candidates) == 1 else ''
        thumbnail = resolver.resolve(image_path)
        if not thumbnail:
            thumbnail = resolver.resolve(f'rnr_item/{index}.tga') or resolver.resolve(f'rnr_item/{index}.bmp')
        if slot == 'face':
            model = faces.get((row.get('ItemEffect', '0'), '1' if int(row.get('ShopIndex', '0')) < 300 else '0'))
        else:
            model = resolver.resolve(model_path) if preview_slot else None
            if preview_slot == 'accessory' and int(row.get('ShopIndex', '0')) < 300:
                model = None
        description = row.get('Text', '').replace('\\n', '\n').strip()
        effect_value = row.get('ItemEffect', '0')
        effect_id = int(effect_value) if effect_value.isdecimal() else 0
        effect = '\n'.join(effects[effect_id - 1]).strip() if 0 < effect_id <= len(effects) else ''
        if effect:
            description = (description + '\n\n' + effect).strip()
        prices = []
        currency = 'cash' if row.get('Cash') == '1' else 'coin' if row.get('Cash') == '0' else 'unknown'
        for key, amount in row.items():
            if re.fullmatch(r'P(?:\d+|I|N|H)?', key) and amount.isdecimal():
                prices.append({'key': key, 'label': PRICE_LABELS.get(key, key[1:] + '일'),
                               'amount': int(amount), 'currency': currency})
        items.append({'id': index, 'name': row['Name'].strip(), 'name_key': name_key(row['Name']),
                      'category': row.get('ShopIndex', '0'), 'department': department, 'slot': slot,
                      'sex': sex, 'show': row['Show'] == '1', 'description': description,
                      'prices': prices, 'thumbnail': None, 'model': None, 'preview_available': False,
                      'counterpart_id': None, 'attributes': row, 'sort': position,
                      '_thumbnail_source': resolver.relative(thumbnail) if thumbnail else None,
                      '_model_source': resolver.relative(model) if model else None, '_preview_slot': preview_slot})
    groups = collections.defaultdict(lambda: {'male': [], 'female': []})
    for item in items:
        if item['show'] and item['_preview_slot'] in [*SLOTS.values(), 'accessory'] and item['sex'] in ['male', 'female']:
            family = 'adult' if int(item['category']) < 300 else 'standard'
            groups[(family, item['_preview_slot'], item['name_key'])][item['sex']].append(item)
    ambiguous = 0
    for group in groups.values():
        if len(group['male']) == len(group['female']) == 1:
            male, female = group['male'][0], group['female'][0]
            male['counterpart_id'], female['counterpart_id'] = female['id'], male['id']
        elif group['male'] and group['female']:
            ambiguous += 1
    return items, ambiguous


def plan(source, output):
    resolver = Resolver(source)
    items, ambiguous = load_catalog(source, resolver)
    required = {resolver.resolve(path) for path in SCRIPT_FILES + list(BASE_FILES.values())}
    if None in required:
        raise ValueError('required script or base model missing')
    errors = []
    models = set()
    for item in items:
        if not item['show']:
            continue
        if item['_thumbnail_source']:
            required.add(resolver.resolve(item['_thumbnail_source']))
        if item['_model_source']:
            if item['slot'] == 'face':
                required.add(resolver.resolve(item['_model_source']))
            else:
                models.add(resolver.resolve(item['_model_source']))
    models.update(resolver.resolve(path) for path in BASE_FILES.values())
    for model in models:
        required.add(model)
        try:
            _, _, _, materials = md9_materials(model)
            for name in materials:
                texture = resolver.texture(model, name)
                if texture:
                    required.add(texture)
                else:
                    errors.append({'path': resolver.relative(model), 'error': 'missing texture: ' + name})
        except (ValueError, struct.error, UnicodeError, OSError) as error:
            errors.append({'path': resolver.relative(model), 'error': str(error)})
    ordered = sorted(required, key=lambda path: resolver.relative(path))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        hashes = list(executor.map(sha256, ordered))
    files = [{'relative_path': resolver.relative(path), 'sha256': digest, 'size': path.stat().st_size}
             for path, digest in zip(ordered, hashes)]
    revision = hashlib.sha256((SCHEMA + json.dumps(files, separators=(',', ':'))).encode()).hexdigest()[:20]
    manifest = {'schema': SCHEMA, 'revision': revision, 'source_root': str(source.resolve()),
                'snapshot_root': str((output / 'source' / revision).resolve()), 'files': files,
                'bytes': sum(file['size'] for file in files)}
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'source-manifest.json').exists():
        previous = json.loads((output / 'source-manifest.json').read_text(encoding='utf-8'))
        archived = output / 'catalogs' / previous['revision'] / 'source-manifest.json'
        if not archived.exists():
            write_json(archived, previous)
    write_json(output / 'catalogs' / revision / 'source-manifest.json', manifest)
    write_json(output / 'source-manifest.json', manifest)
    write_json(output / 'catalogs' / revision / 'plan.json', {'revision': revision, 'items': items,
                'ambiguous_pair_groups': ambiguous, 'source_errors': errors})
    print(json.dumps({'stage': 'planned', 'revision': revision, 'items': len(items),
                      'visible': sum(item['show'] for item in items), 'files': len(files),
                      'bytes': manifest['bytes'], 'source_errors': len(errors)}, ensure_ascii=False), flush=True)
    return manifest


class Builder:
    def __init__(self, source, output, manifest, reuse_revision=None):
        self.source, self.output, self.manifest = source, output, manifest
        self.resolver = Resolver(source)
        self.revision = manifest['revision']
        self.asset_root = output / 'assets' / self.revision
        self.cache_path = output / 'catalogs' / self.revision / 'resource-cache.json'
        if reuse_revision and not self.cache_path.exists():
            self.reuse(reuse_revision)
        self.cache = json.loads(self.cache_path.read_text(encoding='utf-8')) if self.cache_path.exists() else {}
        self.lock = threading.RLock()
        self.hashes = {file['relative_path'].casefold(): file['sha256'] for file in manifest['files']}
        self.errors = []
        self.bases = {sex: parse_md9(self.resolver.resolve(path), self.resolver) for sex, path in BASE_FILES.items()}

    def reuse(self, revision):
        if not re.fullmatch(r'[a-f0-9]{20}', revision) or revision == self.revision:
            raise ValueError('invalid source revision for reuse')
        old_catalog = self.output / 'catalogs' / revision
        previous = json.loads((old_catalog / 'source-manifest.json').read_text(encoding='utf-8'))
        current_hashes = {f['relative_path']: f['sha256'] for f in self.manifest['files']}
        unchanged_models = all(f['sha256'] == current_hashes.get(f['relative_path']) for f in previous['files']
                               if not f['relative_path'].startswith('rnr_script/'))
        cache = json.loads((old_catalog / 'resource-cache.json').read_text(encoding='utf-8'))
        if not unchanged_models:
            cache = {key: value for key, value in cache.items() if not key.startswith(('model:', 'face:'))}
        count = 0
        for path in (self.output / 'assets' / revision).rglob('*'):
            if not path.is_file() or not re.fullmatch(r'[a-f0-9]{64}\.(?:webp|json\.gz)', path.name):
                continue
            target = self.asset_root / path.relative_to(self.output / 'assets' / revision)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                try:
                    os.link(path, target)
                except OSError:
                    shutil.copyfile(path, target)
                count += 1
        write_json(self.cache_path, cache)
        print(json.dumps({'stage': 'reused', 'revision': self.revision, 'files': count,
                          'model_cache_reused': unchanged_models}), flush=True)

    def asset(self, folder, data, suffix):
        name = hashlib.sha256(data).hexdigest() + suffix
        path = self.asset_root / folder / name
        with self.lock:
            if not path.exists():
                atomic_bytes(path, data)
        return name

    def image(self, relative, folder):
        path = self.resolver.resolve(relative)
        if not path:
            raise ValueError('source image missing')
        digest = self.hashes.get(relative.casefold())
        if not digest:
            raise ValueError('source image not in copied manifest')
        key = folder + ':' + digest
        with self.lock:
            cached = self.cache.get(key)
        if cached and (self.asset_root / folder / cached).exists():
            return cached
        image = load_image(path)
        if folder == 'thumbnails':
            image.thumbnail((256, 256))
        stream = io.BytesIO()
        image.save(stream, format='WEBP', lossless=True, method=3)
        name = self.asset(folder, stream.getvalue(), '.webp')
        with self.lock:
            self.cache[key] = name
        return name

    def model(self, relative, sex=None, pet=False, attachment=False, summon=False):
        key = ('summon:' if summon else 'attachment:' if attachment else 'model:') + relative.casefold() + ':' + str(sex) + ':' + str(pet)
        with self.lock:
            cached = self.cache.get(key)
        if cached and (self.asset_root / 'models' / cached).exists():
            return cached
        path = self.resolver.resolve(relative)
        model = parse_md9(path, self.resolver)
        base = self.bases.get(sex)
        if base and not attachment:
            base_names = {bone['name'] for bone in base['bones']}
            if any(bone['parent'] == -1 and bone['name'] not in base_names for bone in model['bones']):
                raise ValueError('unmapped attachment root')
        meshes = posed_meshes(model, base)
        if attachment:
            for mesh in meshes:
                if mesh['name'] not in ['LeftHand', 'RightHand']:
                    mesh['name'] = 'Accessory-' + mesh['name']
        if summon:
            positions = np.concatenate([mesh['vertices'][:, :3] for mesh in meshes])
            if np.abs(positions).max() > 1000:
                raise ValueError('summon exceeds character preview bounds')
            for mesh in meshes:
                mesh['name'] = 'Summon-' + mesh['name']
        if pet:
            positions = np.concatenate([m['vertices'][:, :3] for m in meshes])
            center = (positions.min(0) + positions.max(0)) / 2
            floor = positions[:, 1].min()
            for mesh in meshes:
                mesh['name'] = 'Pet-' + mesh['name']
                mesh['vertices'][:, 0] += -92 - center[0]
                mesh['vertices'][:, 1] += 15 - floor
                mesh['vertices'][:, 2] += 5 - center[2]
        name = self.encode_meshes(meshes)
        with self.lock:
            self.cache[key] = name
        return name

    def face(self, relative, sex):
        key = 'face:' + relative.casefold() + ':' + sex
        with self.lock:
            cached = self.cache.get(key)
        if cached and (self.asset_root / 'models' / cached).exists():
            return cached
        base = self.bases[sex]
        meshes = [mesh for mesh in posed_meshes(base, base) if mesh['name'] == 'Face']
        if len(meshes) != 1:
            raise ValueError('base face mesh is missing or ambiguous')
        meshes[0]['texture_path'] = self.resolver.resolve(relative)
        name = self.encode_meshes(meshes)
        with self.lock:
            self.cache[key] = name
        return name

    def encode_meshes(self, meshes):
        serial = []
        for mesh in meshes:
            vertices = mesh['vertices']
            vertices[:, :3] = np.round(vertices[:, :3], 3)
            vertices[:, 3:6] = np.round(vertices[:, 3:6], 4)
            vertices[:, 6:8] = np.round(vertices[:, 6:8], 5)
            texture = self.image(self.resolver.relative(mesh['texture_path']), 'textures')
            serial.append({'name': mesh['name'], 'vertices': vertices.ravel().tolist(),
                           'indices': mesh['indices'].ravel().tolist(), 'texture': texture})
        raw = json.dumps({'meshes': serial}, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
        return self.asset('models', gzip.compress(raw, compresslevel=6, mtime=0), '.json.gz')

    def item(self, original):
        item = dict(original)
        preview_slot = item.pop('_preview_slot', item['slot'])
        if item['show']:
            if item['_thumbnail_source']:
                try:
                    item['thumbnail'] = self.image(item['_thumbnail_source'], 'thumbnails')
                except Exception as error:
                    self.error(item, 'thumbnail', error)
            else:
                self.error(item, 'thumbnail', ValueError('missing thumbnail'))
            if preview_slot and item['_model_source']:
                try:
                    if preview_slot != 'pet' and int(item['category']) < 300:
                        raise ValueError('adult character base is not available')
                    item['model'] = self.face(item['_model_source'], item['sex']) if item['slot'] == 'face' else self.model(
                        item['_model_source'], sex=item['sex'] if preview_slot not in ['pet', 'summon'] else None,
                        pet=preview_slot == 'pet', attachment=preview_slot == 'accessory', summon=preview_slot == 'summon')
                    item['preview_available'] = True
                except Exception as error:
                    self.error(item, 'model', error)
            elif preview_slot:
                self.error(item, 'model', ValueError('missing model'))
        item.pop('_thumbnail_source', None)
        item.pop('_model_source', None)
        return item

    def error(self, item, kind, error):
        with self.lock:
            self.errors.append({'id': item['id'], 'name': item['name'], 'kind': kind,
                                'error': str(error)[:300]})

    def build(self, workers):
        plan_path = self.output / 'catalogs' / self.revision / 'plan.json'
        planned = json.loads(plan_path.read_text(encoding='utf-8'))
        base_assets = {sex: self.model(path, sex=sex) for sex, path in BASE_FILES.items()}
        items = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            for number, item in enumerate(executor.map(self.item, planned['items']), 1):
                items.append(item)
                if number % 500 == 0:
                    with self.lock:
                        write_json(self.cache_path, self.cache)
                    print(json.dumps({'stage': 'building', 'items': number, 'errors': len(self.errors)}), flush=True)
        visible = [item for item in items if item['show']]
        report = {'items': len(items), 'visible': len(visible),
                  'thumbnails': sum(bool(item['thumbnail']) for item in visible),
                  'models': sum(bool(item['model']) for item in visible),
                  'departments': dict(collections.Counter(item['department'] for item in visible)),
                  'counterpart_pairs': sum(item['counterpart_id'] is not None for item in visible) // 2,
                  'ambiguous_pair_groups': planned['ambiguous_pair_groups'],
                  'errors': self.errors, 'source_errors': planned['source_errors']}
        result = {'revision': self.revision, 'bases': base_assets, 'items': items, 'report': report}
        write_json(self.cache_path, self.cache)
        write_json(self.output / 'catalogs' / self.revision / 'catalog.json', result)
        write_json(self.output / 'catalogs' / self.revision / 'report.json', report)
        files = []
        for path in sorted(self.asset_root.rglob('*')):
            if path.is_file() and re.fullmatch(r'[a-f0-9]{64}\.(?:webp|json\.gz)', path.name):
                files.append({'relative_path': path.relative_to(self.output).as_posix(),
                              'sha256': path.name[:64], 'size': path.stat().st_size})
        for filename in ['catalog.json', 'report.json']:
            path = self.output / 'catalogs' / self.revision / filename
            files.append({'relative_path': path.relative_to(self.output).as_posix(),
                          'sha256': sha256(path), 'size': path.stat().st_size})
        write_json(self.output / 'asset-manifest.json', {'revision': self.revision, 'files': files,
                   'bytes': sum(file['size'] for file in files)})
        print(json.dumps({**{k: v for k, v in report.items() if k not in ['errors', 'source_errors']},
                          'revision': self.revision, 'stage': 'complete', 'errors': len(self.errors)}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--build-from-source', action='store_true')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--reuse-revision')
    args = parser.parse_args()
    if not (args.plan or args.build):
        parser.error('select --plan or --build')
    manifest = plan(args.source, args.output) if args.plan else json.loads((args.output / 'source-manifest.json').read_text(encoding='utf-8'))
    if args.build:
        source = args.source if args.build_from_source else Path(manifest['snapshot_root'])
        Builder(source, args.output, manifest, args.reuse_revision).build(max(1, min(args.workers, 16)))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
