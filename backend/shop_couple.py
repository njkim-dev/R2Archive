from functools import lru_cache
import json
from pathlib import Path
import re


SCHEMA = 'shop-couple-motion-v1'
REVISION = re.compile(r'^[a-f0-9]{20}$')
MOTION = re.compile(r'^[a-f0-9]{64}\.json\.gz$')
AUDIO = re.compile(r'^[a-f0-9]{64}\.(?:mp3|ogg)$')


@lru_cache(maxsize=1)
def _load(path, modified, size):
    if size > 1024 * 1024:
        return None
    data = json.loads(Path(path).read_text(encoding='utf8'))
    if data.get('schema') != SCHEMA or not REVISION.fullmatch(data.get('revision', '')) or not MOTION.fullmatch(data.get('bindings', '')):
        return None
    rings = data.get('rings')
    if not isinstance(rings, dict) or len(rings) > 1000:
        return None
    for item_id, item in rings.items():
        if not re.fullmatch(r'\d{1,12}', item_id) or not isinstance(item, dict) or not MOTION.fullmatch(item.get('motion', '')) or not AUDIO.fullmatch(item.get('audio', '')):
            return None
        if not isinstance(item.get('duration'), (int, float)) or not 0 < item['duration'] <= 180:
            return None
    return data


def catalog(shop_dir):
    path = Path(shop_dir) / 'couple-catalog.json'
    try:
        stat = path.stat()
        return _load(str(path), stat.st_mtime_ns, stat.st_size)
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def preview(shop_dir, item_id):
    data = catalog(shop_dir)
    item = data['rings'].get(str(item_id)) if data else None
    if not item:
        return None
    prefix = f"/api/shop/assets/{data['revision']}"
    return {'motion': f"{prefix}/motions/{item['motion']}", 'bindings': f"{prefix}/motions/{data['bindings']}", 'audio': f"{prefix}/audio/{item['audio']}", 'duration': item['duration']}
