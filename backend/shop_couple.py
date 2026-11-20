from functools import lru_cache
import json
from pathlib import Path
import re


SCHEMA = 'shop-couple-motion-v1'
EXTENSION_SCHEMA = 'shop-couple-preview-extension-v1'
REVISION = re.compile(r'^[a-f0-9]{20}$')
MOTION = re.compile(r'^[a-f0-9]{64}\.json\.gz$')
AUDIO = re.compile(r'^[a-f0-9]{64}\.(?:mp3|ogg)$')
ITEM_ID = re.compile(r'^\d{1,12}$')
SEXES = {'male', 'female'}


def _duration(value):
    return type(value) in (int, float) and 0 < value <= 180


def _effect(effect):
    return isinstance(effect, dict) and MOTION.fullmatch(effect.get('model', '')) and MOTION.fullmatch(effect.get('animation', '')) and (
        'particles' not in effect or MOTION.fullmatch(effect['particles'])
    )


def _motion(item):
    if not isinstance(item, dict) or not MOTION.fullmatch(item.get('motion', '')) or not AUDIO.fullmatch(item.get('audio', '')) or not _duration(item.get('duration')):
        return False
    effects = item.get('effects', [])
    return isinstance(effects, list) and len(effects) <= 8 and all(
        _effect(effect) and effect.get('sex') in SEXES for effect in effects
    ) and ('ornament' not in item or _effect(item['ornament']))


def _items(entries, predicate):
    return isinstance(entries, dict) and len(entries) <= 1000 and all(
        ITEM_ID.fullmatch(item_id) and predicate(entry) for item_id, entry in entries.items()
    )


@lru_cache(maxsize=1)
def _load(path, modified, size):
    if size > 1024 * 1024:
        return None
    data = json.loads(Path(path).read_text(encoding='utf8'))
    if data.get('schema') != SCHEMA or not REVISION.fullmatch(data.get('revision', '')) or not MOTION.fullmatch(data.get('bindings', '')):
        return None
    return data if _items(data.get('rings'), _motion) else None


@lru_cache(maxsize=1)
def _load_extension(path, modified, size):
    if size > 1024 * 1024:
        return None
    data = json.loads(Path(path).read_text(encoding='utf8'))
    if data.get('schema') != EXTENSION_SCHEMA or not REVISION.fullmatch(data.get('revision', '')):
        return None
    sections = {
        'motions': _motion,
        'ornaments': _effect,
        'effects': lambda entry: _effect(entry) and _duration(entry.get('duration')),
    }
    return data if all(_items(data.get(key, {}), predicate) for key, predicate in sections.items()) else None


def _read(path, loader):
    try:
        stat = path.stat()
        return loader(str(path), stat.st_mtime_ns, stat.st_size)
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def catalog(shop_dir):
    return _read(Path(shop_dir) / 'couple-catalog.json', _load)


def extension(shop_dir):
    return _read(Path(shop_dir) / 'couple-preview-extension.json', _load_extension)


def _effect_urls(revision, effect):
    prefix = f'/api/shop/assets/{revision}'
    result = {'model': f"{prefix}/models/{effect['model']}", 'animation': f"{prefix}/motions/{effect['animation']}"}
    if 'particles' in effect:
        result['particles'] = f"{prefix}/motions/{effect['particles']}"
    return result


def preview(shop_dir, item_id):
    data = catalog(shop_dir)
    if not data:
        return None
    item_id = str(item_id)
    extra = extension(shop_dir) or {}
    item = data['rings'].get(item_id)
    revision = data['revision']
    if not item and (item := extra.get('motions', {}).get(item_id)):
        revision = extra['revision']
    if not item:
        return None
    prefix = f'/api/shop/assets/{revision}'
    result = {'motion': f"{prefix}/motions/{item['motion']}", 'bindings': f"/api/shop/assets/{data['revision']}/motions/{data['bindings']}", 'audio': f"{prefix}/audio/{item['audio']}", 'duration': item['duration']}
    ornament = extra.get('ornaments', {}).get(item_id)
    if ornament:
        result['ornament'] = _effect_urls(extra['revision'], ornament)
    elif 'ornament' in item:
        result['ornament'] = _effect_urls(revision, item['ornament'])
    if item.get('effects'):
        result['effects'] = [{**_effect_urls(revision, effect), 'sex': effect['sex']} for effect in item['effects']]
    return result


def effect_preview(shop_dir, item_id):
    data = extension(shop_dir)
    effect = data.get('effects', {}).get(str(item_id)) if data else None
    if effect:
        return {**_effect_urls(data['revision'], effect), 'duration': effect['duration']}
    return None


def effect_item_ids(shop_dir):
    data = extension(shop_dir)
    return [int(item_id) for item_id in data.get('effects', {})] if data else []
