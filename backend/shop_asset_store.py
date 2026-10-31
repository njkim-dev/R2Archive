from functools import lru_cache
import json
from pathlib import Path
import re


REVISION = re.compile(r'^[a-f0-9]{12,64}$')


@lru_cache(maxsize=128)
def _parent(path, modified, size):
    if size > 256:
        return None
    data = json.loads(Path(path).read_text(encoding='utf8'))
    revision = data.get('revision') if isinstance(data, dict) and data.get('schema') == 'shop-assets-parent-v1' else None
    return revision if isinstance(revision, str) and REVISION.fullmatch(revision) else None


def find_asset(shop_dir, revision, kind, filename):
    root = (Path(shop_dir) / 'assets').resolve()
    visited = set()
    for _ in range(8):
        if not REVISION.fullmatch(revision) or revision in visited:
            return None
        visited.add(revision)
        folder = root / revision
        target = folder / kind / filename
        if not target.resolve().is_relative_to(root):
            return None
        if target.is_file():
            return target
        manifest = folder / 'parent.json'
        try:
            if not manifest.resolve().is_relative_to(root):
                return None
            stat = manifest.stat()
            revision = _parent(str(manifest), stat.st_mtime_ns, stat.st_size)
        except (OSError, ValueError, TypeError, AttributeError):
            return None
        if not revision:
            return None
    return None
