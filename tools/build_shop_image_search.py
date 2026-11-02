import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from shop_image_search import BACKGROUND, SCHEMA, image_tensor


MODEL = 'facebook/dinov2-small'
REVISION = 'ed25f3a31f01632728cabb09d1542f84ab7b0056'


def export_model(path):
    import torch
    import torch.nn.functional as functional
    from transformers import AutoModel

    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.model = AutoModel.from_pretrained(MODEL, revision=REVISION, use_safetensors=True).eval()

        def forward(self, pixels):
            return functional.normalize(self.model(pixels).last_hidden_state[:, 0], dim=-1)

    torch.set_num_threads(4)
    model = Encoder().eval()
    with torch.inference_mode():
        torch.onnx.export(model, torch.zeros((1, 3, 224, 224)), str(path), dynamo=False,
                          input_names=['pixels'], output_names=['features'], opset_version=17,
                          dynamic_axes={'pixels': {0: 'batch'}, 'features': {0: 'batch'}})


def main():
    parser = argparse.ArgumentParser(description='Build local CPU image-search assets. Does not access or modify a database.')
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reuse-index', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    encoder = args.output / 'encoder.onnx'
    if not encoder.exists():
        export_model(encoder)
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 6
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(encoder), sess_options=options, providers=['CPUExecutionProvider'])
    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))
    rows = [{k: row[k] for k in ('id', 'thumbnail', 'sex', 'slot')} for row in catalog['items']
            if row.get('slot') in ('hair', 'top') and row.get('sex') in ('male', 'female', 'common') and row.get('thumbnail')]
    paths = {}
    for path in args.assets.glob('*/thumbnails/*.webp'):
        paths.setdefault(path.name, path)
    if any(row['thumbnail'] not in paths for row in rows):
        raise ValueError('Catalog images are missing')
    vectors = {}
    if args.reuse_index:
        old = np.load(args.reuse_index, allow_pickle=False)
        vectors = dict(zip(old['thumbnails'].tolist(), old['cls']))

    def tensor(name):
        with Image.open(paths[name]) as source:
            rgba = source.convert('RGBA')
            rgb = Image.new('RGBA', rgba.size, BACKGROUND + (255,))
            rgb.alpha_composite(rgba)
            return image_tensor(rgb.convert('RGB'))

    if vectors:
        sample = next(row['thumbnail'] for row in rows if row['thumbnail'] in vectors)
        actual = session.run(None, {'pixels': tensor(sample)})[0][0]
        if np.dot(actual, vectors[sample]) < .9999:
            raise ValueError('Reused index uses different image preprocessing or model')
    names = sorted({row['thumbnail'] for row in rows} - vectors.keys())
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=4) as executor:
        for offset in range(0, len(names), 32):
            batch = names[offset:offset + 32]
            inputs = np.concatenate(list(executor.map(tensor, batch)))
            features = session.run(None, {'pixels': inputs})[0]
            vectors.update(zip(batch, features))
            if offset == 0 or (offset // 32 + 1) % 10 == 0:
                print(json.dumps({'encoded': min(offset + 32, len(names)), 'total': len(names),
                                  'seconds': round(time.monotonic() - start, 2)}), flush=True)
    features = np.stack([vectors[row['thumbnail']] for row in rows]).astype(np.float32)
    np.save(args.output / 'features.npy', features, allow_pickle=False)
    (args.output / 'items.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    manifest = {'schema': SCHEMA, 'model': MODEL, 'model_revision': REVISION,
                'catalog_revision': catalog['revision'], 'dimension': 384, 'count': len(rows),
                'sha256': {name: hashlib.sha256((args.output / name).read_bytes()).hexdigest()
                           for name in ('encoder.onnx', 'features.npy', 'items.json')}}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'ready': True, 'count': len(rows), 'output': str(args.output)}), flush=True)


if __name__ == '__main__':
    main()
