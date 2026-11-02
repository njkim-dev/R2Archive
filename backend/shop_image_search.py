import hashlib
from functools import lru_cache
from io import BytesIO
import json
import os
from pathlib import Path
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError


SCHEMA = 'shop-image-search-v1'
BACKGROUND = (31, 46, 64)
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 16_000_000
SEARCH_DIR = Path(os.environ.get('SHOP_DIR', Path(__file__).resolve().parents[1] / 'shop')) / 'image-search'


def decode_image(content):
    if not content or len(content) > MAX_BYTES:
        raise ValueError('8MB 이하의 이미지를 선택해주세요.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format not in ('PNG', 'JPEG', 'WEBP'):
                    raise ValueError('PNG, JPG, WEBP 이미지를 선택해주세요.')
                if image.width * image.height > MAX_PIXELS or max(image.size) > 4096 or min(image.size) < 16:
                    raise ValueError('이미지 크기는 16~4096px, 전체 1600만 화소 이하로 선택해주세요.')
                image.load()
                rgba = ImageOps.exif_transpose(image).convert('RGBA')
        background = Image.new('RGBA', rgba.size, BACKGROUND + (255,))
        background.alpha_composite(rgba)
        return background.convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('이미지를 읽을 수 없습니다. 다른 이미지를 선택해주세요.') from exc


def image_tensor(image, preserve_full=False):
    import numpy as np
    if preserve_full:
        side = max(image.size)
        image = ImageOps.pad(image, (side, side), color=BACKGROUND)
        image = ImageOps.expand(image, border=round(side * .10), fill=BACKGROUND)
    width, height = image.size
    if width <= height:
        size = (256, int(height * 256 / width))
    else:
        size = (int(width * 256 / height), 256)
    image = image.resize(size, Image.Resampling.BICUBIC)
    x, y = (image.width - 224) // 2, (image.height - 224) // 2
    pixels = np.asarray(image.crop((x, y, x + 224, y + 224)), dtype=np.float32) / np.float32(255)
    pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    return np.ascontiguousarray(pixels.transpose(2, 0, 1)[None])


def manifest():
    path = SEARCH_DIR / 'manifest.json'
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError('Invalid image search manifest')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema') != SCHEMA or data.get('dimension') != 384 or not 1 <= data.get('count', 0) <= 100_000:
        raise ValueError('Invalid image search manifest')
    for name in ('encoder.onnx', 'features.npy', 'items.json'):
        if not (SEARCH_DIR / name).is_file() or len(data.get('sha256', {}).get(name, '')) != 64:
            raise ValueError('Incomplete image search assets')
    return data, path.stat().st_mtime_ns


def status():
    try:
        data, _ = manifest()
        return {'available': True, 'slots': ['hair', 'top'], 'sexes': ['male', 'female']}
    except (OSError, ValueError, TypeError, KeyError):
        return {'available': False, 'slots': [], 'sexes': []}


class ImageSearch:
    def __init__(self, directory, data):
        import numpy as np
        import onnxruntime as ort
        ort.disable_telemetry_events()
        directory = Path(directory)
        for name, expected in data['sha256'].items():
            if name not in ('encoder.onnx', 'features.npy', 'items.json'):
                raise ValueError('Invalid image search asset')
            with (directory / name).open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                    raise ValueError('Image search asset integrity mismatch')
        self.features = np.load(directory / 'features.npy', mmap_mode='r', allow_pickle=False)
        self.items = json.loads((directory / 'items.json').read_text(encoding='utf-8'))
        if self.features.shape != (data['count'], 384) or len(self.items) != data['count'] or self.features.dtype != np.float32:
            raise ValueError('Invalid image search index')
        if not np.isfinite(self.features).all():
            raise ValueError('Invalid image search features')
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        options.add_session_config_entry('session.intra_op.allow_spinning', '0')
        self.session = ort.InferenceSession(str(directory / 'encoder.onnx'), sess_options=options,
                                           providers=['CPUExecutionProvider'])

    def search(self, image, sex, slot, allowed, limit=12):
        import numpy as np
        candidates = [(i, r) for i, r in enumerate(self.items)
                      if r['sex'] in (sex, 'common') and r['slot'] == slot
                      and allowed.get(str(r['id'])) == r['thumbnail']]
        if not candidates:
            return []
        query = self.session.run(None, {'pixels': image_tensor(image, preserve_full=True)})[0][0]
        indices = np.array([i for i, _ in candidates])
        scores = np.einsum('ij,j->i', self.features[indices], query, optimize=False)
        order = np.argsort(-scores, kind='stable')[:limit]
        return [str(candidates[i][1]['id']) for i in order]


@lru_cache(maxsize=1)
def _load(directory, modified):
    data, current = manifest()
    if current != modified:
        raise ValueError('Image search index changed')
    return ImageSearch(directory, data)


def engine():
    data, modified = manifest()
    return _load(str(SEARCH_DIR), modified)
