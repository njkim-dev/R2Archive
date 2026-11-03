import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from shop_image_search import image_tensor
from shop_outfit_search import color_descriptor, hair_palette, SLOTS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--shop', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--reuse', type=Path)
    args = parser.parse_args()
    directory = args.shop / 'image-search'
    catalog = json.loads(args.catalog.read_text(encoding='utf8'))
    rows = [{k: row[k] for k in ('id', 'thumbnail', 'sex', 'slot')} for row in catalog['items']
            if row.get('department') == 'wearable' and row.get('slot') in SLOTS and row.get('thumbnail')]
    paths = {p.name: p for p in (args.shop/'assets').glob('*/thumbnails/*.webp')}
    if any(r['thumbnail'] not in paths for r in rows):
        raise ValueError('Missing catalogue thumbnails')
    old_rows = json.loads((directory/'items.json').read_text(encoding='utf8'))
    old = np.load(directory/'features.npy', allow_pickle=False)
    vectors = {r['thumbnail']: old[i] for i,r in enumerate(old_rows)}
    if args.reuse:
        cached = np.load(args.reuse, allow_pickle=False)
        vectors.update(zip(cached['thumbnails'].tolist(), cached['features']))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 6
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(directory/'encoder.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    names = sorted({r['thumbnail'] for r in rows} - vectors.keys())
    def tensor(name):
        with Image.open(paths[name]) as image:
            return image_tensor(image.convert('RGB'))
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for offset in range(0, len(names), 16):
            batch = names[offset:offset+16]
            features = session.run(None, {'pixels': np.concatenate(list(pool.map(tensor, batch)))})[0]
            vectors.update(zip(batch, features))
            if offset % 320 == 0:
                print(json.dumps({'encoded': offset+len(batch), 'total': len(names), 'seconds': round(time.perf_counter()-started, 1)}), flush=True)
    def color(name):
        with Image.open(paths[name]) as image:
            return color_descriptor(image)
    unique = sorted({r['thumbnail'] for r in rows})
    with ThreadPoolExecutor(max_workers=4) as pool:
        descriptors = dict(zip(unique, pool.map(color, unique)))
    np.save(directory/'outfit-features.npy', np.stack([vectors[r['thumbnail']] for r in rows]).astype(np.float32), allow_pickle=False)
    np.save(directory/'outfit-colors.npy', np.stack([descriptors[r['thumbnail']][0] for r in rows]), allow_pickle=False)
    np.save(directory/'outfit-aspects.npy', np.asarray([descriptors[r['thumbnail']][1] for r in rows], dtype=np.float32), allow_pickle=False)
    (directory/'outfit-items.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf8')
    hair_rows = [row for row in rows if row['slot'] == 'hair']
    def palette(row):
        with Image.open(paths[row['thumbnail']]) as image:
            return hair_palette(image)
    with ThreadPoolExecutor(max_workers=4) as pool:
        palettes = np.stack(list(pool.map(palette, hair_rows)))
    np.savez_compressed(directory/'outfit-hair-palettes.npz', ids=np.asarray([str(row['id']) for row in hair_rows]), palettes=palettes)
    names = ['outfit-features.npy', 'outfit-colors.npy', 'outfit-aspects.npy', 'outfit-items.json']
    manifest = {'schema': 'shop-outfit-search-v1', 'catalog_revision': catalog['revision'], 'count': len(rows),
                'hair_palettes': hashlib.sha256((directory/'outfit-hair-palettes.npz').read_bytes()).hexdigest(),
                'sha256': {name: hashlib.sha256((directory/name).read_bytes()).hexdigest() for name in names}}
    (directory/'outfit-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
    print(json.dumps({'ready': True, 'count': len(rows), 'seconds': round(time.perf_counter()-started, 2)}), flush=True)


if __name__ == '__main__':
    main()
