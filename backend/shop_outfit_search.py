from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import base64
import hashlib
from io import BytesIO
import json
import math
import os
from threading import Lock
import time

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

from shop_asset_store import find_asset
from shop_image_search import BACKGROUND, SEARCH_DIR, engine, image_tensor


SLOTS = ('hair', 'top', 'bottom', 'shoes')
MODEL = 'gpt-6.1-terra'
RETRIEVAL_VERSION = 'hair-palette-views-v2'
_client = httpx.Client(timeout=httpx.Timeout(65, connect=10), limits=httpx.Limits(max_connections=8, max_keepalive_connections=8))
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='shop-match')
_results = OrderedDict()
_cache_lock = Lock()
_engine_lock = Lock()


class SearchUnavailable(Exception):
    def __init__(self, message, diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics or {}


def configured():
    return bool(os.environ.get('OPENAI_API_KEY')) and (SEARCH_DIR/'outfit-manifest.json').is_file()


def image_content(image):
    buffer = BytesIO()
    image.convert('RGB').save(buffer, format='PNG')
    return {'type': 'input_image', 'image_url': 'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode(), 'detail': 'high'}


def call(prompt, images, limit):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise SearchUnavailable('이미지 검색 설정을 확인해주세요.')
    started = time.perf_counter()
    try:
        response = _client.post('https://api.openai.com/v1/responses', headers={'Authorization': 'Bearer '+key}, json={
            'model': MODEL, 'store': False, 'service_tier': 'default', 'reasoning': {'effort': 'low'},
            'max_output_tokens': limit, 'text': {'format': {'type': 'json_object'}},
            'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': prompt}]+images}]})
        if response.status_code != 200:
            raise SearchUnavailable('이미지 분석 서비스가 응답하지 않습니다. 잠시 후 다시 시도해주세요.')
        data = response.json()
        if data.get('status') != 'completed':
            raise ValueError('Incomplete analysis')
        output = ''.join(c.get('text', '') for item in data.get('output', []) for c in item.get('content', []) if c.get('type') == 'output_text')
        result = json.loads(output)
        if not isinstance(result, dict):
            raise ValueError('Invalid analysis')
        usage = data.get('usage', {})
        details = usage.get('input_tokens_details', {})
        cached, written = details.get('cached_tokens', 0), details.get('cache_write_tokens', 0)
        cost = ((usage.get('input_tokens', 0)-cached-written)+cached*.05+written*1.25+usage.get('output_tokens', 0)*5)/1_000_000
        return result, {'seconds': round(time.perf_counter()-started, 3), 'usage': usage, 'cost_estimate_usd': cost,
                        'response_id': data.get('id'), 'request_id': response.headers.get('x-request-id'),
                        'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest()}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise SearchUnavailable('이미지 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.') from None


def valid_region(part, size):
    box, polygon = part.get('bbox_xyxy'), part.get('polygon_xy')
    def coordinate(n):
        return type(n) in (int, float) and math.isfinite(n) and 0 <= n <= 1000
    if not isinstance(box, list) or len(box) != 4 or not all(coordinate(n) for n in box):
        raise ValueError('Invalid region')
    if box[0] >= box[2] or box[1] >= box[3]:
        raise ValueError('Empty region')
    if not isinstance(polygon, list) or not 3 <= len(polygon) <= 64 or any(not isinstance(p, list) or len(p) != 2 or not all(coordinate(n) for n in p) for p in polygon):
        raise ValueError('Invalid outline')
    width, height = size
    bounds = tuple(round(n*(width if i%2 == 0 else height)/1000) for i,n in enumerate(box))
    if bounds[2]-bounds[0] < 2 or bounds[3]-bounds[1] < 2:
        raise ValueError('Region too small')
    return bounds, [(round(x*width/1000), round(y*height/1000)) for x,y in polygon]


class OutfitSearch:
    def __init__(self):
        manifest = json.loads((SEARCH_DIR/'outfit-manifest.json').read_text(encoding='utf8'))
        if manifest.get('schema') != 'shop-outfit-search-v1':
            raise ValueError('Invalid outfit index')
        for name in ('outfit-features.npy', 'outfit-colors.npy', 'outfit-aspects.npy', 'outfit-items.json'):
            with (SEARCH_DIR/name).open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != manifest.get('sha256', {}).get(name):
                    raise ValueError('Outfit index integrity mismatch')
        self.revision = manifest['catalog_revision']
        self.rows = json.loads((SEARCH_DIR/'outfit-items.json').read_text(encoding='utf8'))
        self.features = np.load(SEARCH_DIR/'outfit-features.npy', mmap_mode='r', allow_pickle=False)
        self.colors = np.load(SEARCH_DIR/'outfit-colors.npy', mmap_mode='r', allow_pickle=False)
        self.aspects = np.load(SEARCH_DIR/'outfit-aspects.npy', mmap_mode='r', allow_pickle=False)
        count = manifest['count']
        if len(self.rows) != count or self.features.shape != (count, 384) or self.colors.shape != (count, 512) or self.aspects.shape != (count,):
            raise ValueError('Invalid outfit dimensions')
        self.model = engine()
        self.encoder_sha256 = json.loads((SEARCH_DIR/'manifest.json').read_text(encoding='utf8'))['sha256']['encoder.onnx']
        self.by_id = {str(r['id']): i for i,r in enumerate(self.rows)}
        self.hair_palettes = None
        if manifest.get('hair_palettes'):
            path = SEARCH_DIR/'outfit-hair-palettes.npz'
            with path.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != manifest['hair_palettes']:
                    raise ValueError('Hair palette integrity mismatch')
            with np.load(path, allow_pickle=False) as data:
                ids, palettes = data['ids'].tolist(), data['palettes']
            expected = [str(row['id']) for row in self.rows if row['slot'] == 'hair']
            if ids != expected or palettes.shape != (len(ids), 512) or not np.isfinite(palettes).all():
                raise ValueError('Invalid hair palette dimensions')
            self.hair_palettes = palettes.astype(np.float32, copy=False)
            self.hair_palette_indices = {self.by_id[item]: n for n,item in enumerate(ids)}
        self.font = ImageFont.load_default(size=15)

    @lru_cache(maxsize=512)
    def thumbnail(self, revision, filename):
        path = find_asset(SEARCH_DIR.parent, revision, 'thumbnails', filename)
        if not path:
            raise SearchUnavailable('상점 이미지 데이터를 확인해주세요.')
        with Image.open(path) as image:
            return image.convert('RGBA')

    def masked_part(self, image, info):
        box, polygon = valid_region(info, image.size)
        mask = Image.new('L', image.size, 0)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        masked = Image.new('RGBA', image.size, BACKGROUND+(0,))
        masked.paste(image.convert('RGBA'), mask=mask)
        masked = masked.crop(box)
        rgb = Image.new('RGB', masked.size, BACKGROUND)
        rgb.paste(masked, mask=masked.getchannel('A'))
        return box, masked, rgb

    def example_vector(self, image, info):
        _, _, rgb = self.masked_part(image, info)
        return self.model.session.run(None, {'pixels': image_tensor(rgb, preserve_full=True)})[0][0]

    def shortlist(self, image, info, sex, slot, allowed, examples=(), *, augment_colors=True):
        box, masked, rgb = self.masked_part(image, info)
        vector = self.model.session.run(None, {'pixels': image_tensor(rgb, preserve_full=True)})[0][0]
        indices = np.asarray([self.by_id[item_id] for item_id,row in allowed.items() if item_id in self.by_id
                              and row['slot'] == slot and row['sex'] in (sex, 'common')
                              and self.rows[self.by_id[item_id]]['thumbnail'] == row['thumbnail']], dtype=np.int64)
        indices.sort()
        matching = [row for row in examples if row['slot'] == slot and row['sex'] in (sex, 'common')
                    and row['encoder_sha256'] == self.encoder_sha256 and row['item_id'] in allowed
                    and row['item_id'] in self.by_id and allowed[row['item_id']]['thumbnail'] == row['thumbnail']
                    and allowed[row['item_id']]['sex'] in (sex, 'common') and allowed[row['item_id']]['slot'] == slot]
        learned = {}
        if matching:
            similarity = np.einsum('ij,j->i', np.stack([row['feature'] for row in matching]), vector, optimize=False)
            for row,score in zip(matching, similarity):
                index = self.by_id[row['item_id']]
                learned[index] = max(learned.get(index, -1), float(score))
        if slot in ('bottom', 'shoes') and len(indices):
            hist, aspect = color_descriptor(masked)
            color_scores = np.einsum('ij,j->i', self.colors[indices], hist, optimize=False)-.12*np.abs(np.log(np.maximum(self.aspects[indices], .01)/max(aspect, .01)))
            indices = indices[np.argsort(-color_scores, kind='stable')[:800]]
            extra = [i for i,_ in sorted(learned.items(), key=lambda pair: -pair[1])[:120]]
            indices = np.asarray(list(dict.fromkeys([*indices.tolist(), *extra])), dtype=np.int64)
        scores = np.einsum('ij,j->i', self.features[indices], vector, optimize=False)
        for n,index in enumerate(indices):
            if index in learned:
                scores[n] = max(float(scores[n]), learned[index])
        order = np.argsort(-scores, kind='stable')
        if slot == 'hair' and getattr(self, 'hair_palettes', None) is not None and len(indices):
            palette_indices = [self.hair_palette_indices[i] for i in indices]
            views = hair_palette_views(masked) if augment_colors else np.asarray([hair_palette(masked)])
            colors = np.einsum('ij,kj->ik', self.hair_palettes[palette_indices], views, optimize=False)
            order = fuse_hair_candidates(order, colors[:, 0], colors.max(axis=1) if augment_colors else None)
        else:
            order = order[:120]
        indices = indices[order]
        scored = [{'id': str(self.rows[i]['id']), 'score': round(float(score), 6)} for i,score in zip(indices,scores[order])]
        return [allowed[str(self.rows[i]['id'])] for i in indices], image.crop(box), scored

    def compare(self, slot, image_input, crop, candidates, revision):
        if not candidates:
            return {'id': None, 'alternatives': [], 'confidence': 'low', 'exact_match_supported': False}, None
        order = np.random.default_rng(20261102).permutation(len(candidates))
        display = [candidates[i] for i in order]
        references = [image_input, image_content(crop)]
        for start in range(0, len(display), 30):
            board = Image.new('RGB', (960, 900), '#e6e8ed')
            draw = ImageDraw.Draw(board)
            for n,row in enumerate(display[start:start+30]):
                tile = self.thumbnail(revision, row['thumbnail']).copy()
                tile.thumbnail((154, 150))
                x,y = n%6*160,n//6*180
                board.paste(tile, (x+(160-tile.width)//2, y+(150-tile.height)//2), tile)
                draw.text((x+4, y+155), str(row['id']), font=self.font, fill='black')
            references.append(image_content(board))
        ids = [str(r['id']) for r in candidates]
        prompt = ('Find the exact '+slot+' item worn in image 1, the original full screenshot. Image 2 is an automatic '
                  'crop generated by the API without human coordinates. Remaining images show shuffled shop catalogue '
                  'thumbnails labelled ONLY with item IDs. Match appearance and geometry, allowing frontal versus '
                  'three-quarter views. Ignore other outfit pieces and mannequin faces. For shoes compare socks, '
                  'bands, toe, sole and wheels. Similar color alone is insufficient. No correct item ID is supplied. '
                  'Return compact JSON with selected_id (one listed string ID or null if none matches), alternative_ids '
                  '(up to 3 strings), confidence (high/medium/low), exact_match_supported (boolean). '
                  'Do not output explanations. Candidates: '+json.dumps(ids))
        result, usage = call(prompt, references, 1100)
        selected = result.get('selected_id')
        selected = str(selected) if selected is not None else None
        if selected is not None and selected not in ids:
            raise SearchUnavailable('이미지 검색 결과를 확인하지 못했습니다. 다시 시도해주세요.')
        alternatives = result.get('alternative_ids', [])
        if not isinstance(alternatives, list):
            alternatives = []
        return {'id': selected, 'alternatives': list(dict.fromkeys(str(i) for i in alternatives if str(i) in ids and str(i) != selected))[:3],
                'confidence': result.get('confidence') if result.get('confidence') in ('high', 'medium', 'low') else 'low',
                'exact_match_supported': selected is not None and result.get('confidence') == 'high' and result.get('exact_match_supported') is True}, usage

    def search(self, image, allowed, revision, slots=SLOTS, sex_hint=None, examples=()):
        started = time.perf_counter()
        if revision != self.revision:
            raise SearchUnavailable('현재 상점 버전의 이미지 검색 데이터를 준비 중입니다.')
        original = image_content(image)
        prompt = ('Analyze this whole video game screenshot and locate these wearable parts: '+', '.join(slots)+'. '
                  'hair means hairstyle; top means shirt/jacket upper part; bottom means pants/shorts/skirt; '
                  'shoes means skates INCLUDING socks belonging to that item. No regions or correct IDs supplied. '
                  'Return compact JSON with sex (male or female), and parts containing exactly these keys: '+', '.join(slots)+'. '
                  'Each part contains bbox_xyxy (4 integers normalized 0..1000 relative to the WHOLE image), '
                  'polygon_xy (8..24 [x,y] outline points in the same coordinates). For hair include ALL visible '
                  'lengths and braids but exclude face/neck where possible. For top exclude hands, gloves, props, '
                  'arms and skirt. For bottom exclude legs and props. For shoes include both shoes and socks, '
                  'exclude floor. Preserve item silhouettes. Do not output descriptions, item names or IDs.')
        if sex_hint:
            prompt += ' The user has specified the character sex as '+sex_hint+'.'
        localized, usage = call(prompt, [original], 1900)
        sex = sex_hint or localized.get('sex')
        if sex not in ('male', 'female') or not isinstance(localized.get('parts'), dict):
            raise SearchUnavailable('캐릭터를 인식하지 못했습니다. 다른 이미지를 사용해주세요.')
        try:
            futures = {}
            for slot in slots:
                valid_region(localized['parts'][slot], image.size)
            preparation = time.perf_counter()
            shortlists = {}
            scored = {}
            for slot in slots:
                candidates, crop, scored[slot] = self.shortlist(image, localized['parts'][slot], sex, slot, allowed, examples)
                shortlists[slot] = [str(r['id']) for r in candidates]
                futures[slot] = _pool.submit(self.compare, slot, original, crop, candidates, revision)
            prepared = time.perf_counter()-preparation
            parts, calls = {}, [usage]
            errors = []
            for slot,future in futures.items():
                try:
                    parts[slot], measured = future.result()
                    if measured:
                        calls.append(measured)
                except Exception as exc:
                    errors.append(exc)
            if errors:
                raise SearchUnavailable('일부 부위의 검색을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.',
                                        {'localization': localized['parts'], 'shortlists': shortlists, 'scored_candidates': scored, 'calls': calls})
        except (ValueError, KeyError, TypeError):
            for future in futures.values():
                future.cancel()
            raise SearchUnavailable('부위를 인식하지 못했습니다. 다른 이미지를 사용해주세요.', {'localization': localized.get('parts'), 'calls': [usage]}) from None
        return {'sex': sex, 'parts': parts, 'model': MODEL,
                'timing': {'total_seconds': round(time.perf_counter()-started, 3), 'candidate_seconds': round(prepared, 3)},
                'calls': calls, 'cost_estimate_usd': sum(c['cost_estimate_usd'] for c in calls), 'shortlists': shortlists,
                'scored_candidates': scored, 'localization': localized['parts'], 'encoder_sha256': self.encoder_sha256,
                'approved_example_count': len(examples), 'retrieval_version': RETRIEVAL_VERSION,
                'hair_palette_ready': self.hair_palettes is not None,
                'hair_palette_views': 5 if 'hair' in slots and self.hair_palettes is not None else 0}


@lru_cache(maxsize=1)
def _load(modified):
    return OutfitSearch()


def outfit_engine():
    with _engine_lock:
        return _load((SEARCH_DIR/'outfit-manifest.json').stat().st_mtime_ns)


def cached_search(content, image, allowed, revision, slots, sex_hint=None):
    from shop_image_history import training_snapshot
    generation, examples = training_snapshot()
    visibility = hashlib.sha256(json.dumps(sorted((key,row['thumbnail'],row.get('slot'),row.get('sex')) for key,row in allowed.items())).encode()).hexdigest()
    key = (RETRIEVAL_VERSION, hashlib.sha256(content).hexdigest(), revision, tuple(slots), sex_hint, visibility, generation)
    with _cache_lock:
        cached = _results.get(key)
        if cached and time.monotonic()-cached[0] < 900:
            _results.move_to_end(key)
            return {**cached[1], 'cached': True}
    result = outfit_engine().search(image, allowed, revision, slots, sex_hint, examples)
    result['dataset_generation'] = generation
    with _cache_lock:
        _results[key] = (time.monotonic(), result)
        while len(_results) > 32:
            _results.popitem(last=False)
    return {**result, 'cached': False}


def hair_palette(image):
    pixels = np.asarray(image.convert('RGBA').resize((128, 128), Image.Resampling.BOX))
    bins = pixels[:, :, :3].astype(np.int32)//32
    bins = bins[:, :, 0]*64+bins[:, :, 1]*8+bins[:, :, 2]
    hist = np.bincount(bins[pixels[:, :, 3] > 100], minlength=512).astype(np.float32)
    return hist/max(float(np.linalg.norm(hist)), 1e-9)


def hair_palette_views(image):
    source = image.convert('RGBA').resize((128, 128), Image.Resampling.BOX)
    return np.stack([hair_palette(source),
                     hair_palette(ImageEnhance.Brightness(source).enhance(.8)),
                     hair_palette(ImageEnhance.Brightness(source).enhance(1.25)),
                     hair_palette(ImageEnhance.Color(source).enhance(.65)),
                     hair_palette(ImageEnhance.Color(source).enhance(1.5))])


def fuse_hair_candidates(shape_order, colors, alternate_colors=None):
    shape_rank = np.empty(len(shape_order), dtype=np.float32)
    color_rank = np.empty(len(shape_order), dtype=np.float32)
    shape_rank[shape_order] = np.arange(len(shape_order))+1
    color_rank[np.argsort(-colors, kind='stable')] = np.arange(len(shape_order))+1
    fusion = np.argsort(-(1/(60+shape_rank)+1/(60+color_rank)), kind='stable')
    # Keep the strongest visual/approved matches even when lighting changes hair color.
    baseline = list(dict.fromkeys([*shape_order[:40].tolist(), *fusion.tolist()]))[:120]
    if alternate_colors is None:
        return np.asarray(baseline, dtype=np.int64)
    color_rank[np.argsort(-alternate_colors, kind='stable')] = np.arange(len(shape_order))+1
    alternate = np.argsort(-(1/(60+shape_rank)+1/(60+color_rank)), kind='stable')
    # Reserve 90% for existing matches; use the remaining slots for lighting variants.
    return np.asarray(list(dict.fromkeys([*baseline[:108], *alternate.tolist(), *baseline]))[:120], dtype=np.int64)


def color_descriptor(image):
    pixels = np.asarray(image.convert('RGBA'))
    mask = pixels[:, :, 3] > 100
    rgb = pixels[:, :, :3].astype(np.float32)
    skin = (rgb[:, :, 0] > 145) & (rgb[:, :, 0] > rgb[:, :, 1]*1.06) & (rgb[:, :, 1] > rgb[:, :, 2]*1.12)
    garment = mask & ~skin
    if garment.sum() < 20:
        garment = mask
    bins = np.minimum((rgb[garment]/32).astype(np.int32), 7)
    hist = np.bincount(bins[:, 0]*64+bins[:, 1]*8+bins[:, 2], minlength=512).astype(np.float32)
    hist /= max(float(np.linalg.norm(hist)), 1e-9)
    ys, xs = np.where(garment)
    aspect = (xs.max()-xs.min()+1)/(ys.max()-ys.min()+1) if len(xs) else 1
    return hist, float(aspect)
