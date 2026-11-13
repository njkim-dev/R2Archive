from contextlib import contextmanager
from datetime import datetime
from hashlib import sha256
from io import BytesIO
import json
import logging
import os
import secrets
import string
from pathlib import Path
from threading import Lock
import uuid

import numpy as np
from fastapi import HTTPException
from PIL import Image
from psycopg2.extras import Json, RealDictCursor

from database import get_conn
import shop_image_guest as guest


DIRECTORY = Path(os.environ.get('SHOP_IMAGE_HISTORY_DIR', Path(__file__).resolve().parents[1]/'record_screenshots'/'image-search-history'))
PIPELINE_VERSION = 'terra-outfit-robust-v3'
_training_lock = Lock()
_training = {'generation': None, 'rows': []}
logger = logging.getLogger(__name__)


@contextmanager
def transaction(write=False):
    with get_conn() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if write:
                    cur.execute('SELECT current_database() AS db,current_user AS role')
                    target = cur.fetchone()
                    if not target or target['db'] != 'r2music' or target['role'] != 'r2archive':
                        raise RuntimeError('Image history writes require the r2music application database')
                yield cur
            conn.commit()
        except BaseException:
            conn.rollback()
            raise


def file_path(image_key):
    import re
    if not re.fullmatch(r'[a-f0-9]{32}\.(?:png|jpg|webp)', image_key):
        raise ValueError('Invalid history image key')
    return DIRECTORY/image_key


def guest_used(cur, guest_id):
    cur.execute("SELECT count(*) AS used FROM shop_image_search_history WHERE user_id IS NULL AND diagnostics->>'guest_id'=%s AND status IN ('running','completed')", (guest_id,))
    return cur.fetchone()['used']


def guest_usage(guest_id):
    with transaction() as cur:
        return guest.usage(guest_used(cur, guest_id))


def create(content, uid, sex, slot, revision, filename, model, guest_id=None):
    search_id = uuid.uuid4()
    with Image.open(BytesIO(content)) as image:
        image_format, (width,height) = image.format, image.size
    suffix = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp'}[image_format]
    image_key = f'{search_id.hex}.{suffix}'
    DIRECTORY.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = file_path(image_key)
    try:
        with path.open('xb') as stream:
            stream.write(content)
        path.chmod(0o600)
        with transaction(write=True) as cur:
            if guest_id:
                # Serialize quota reservation across workers before starting paid inference.
                cur.execute('SELECT pg_advisory_xact_lock(%s)', (int.from_bytes(sha256(guest_id.encode()).digest()[:8], 'big', signed=True),))
                if guest_used(cur, guest_id) >= guest.LIMIT:
                    raise guest.exhausted()
            cur.execute('''INSERT INTO shop_image_search_history
                (id,user_id,status,sex,slot,catalog_revision,model,pipeline_version,image_key,source_sha256,image_format,
                 image_bytes,image_width,image_height,original_filename,diagnostics)
                VALUES(%s,%s,'running',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (str(search_id),uid,sex,slot,revision,model,PIPELINE_VERSION,image_key,sha256(content).hexdigest(),image_format,
                 len(content),width,height,Path(filename.replace('\\','/')).name[:255],Json({'guest_id': guest_id} if guest_id else {})))
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return str(search_id)


def finish(search_id, result=None, diagnostics=None, error=''):
    with transaction(write=True) as cur:
        cur.execute('''UPDATE shop_image_search_history SET status=%s,completed_at=now(),result=%s,diagnostics=diagnostics || %s,error=%s
                       WHERE id=%s''', ('failed' if error else 'completed',Json(result or {}),Json(diagnostics or {}),error[:500],search_id))


def owner_record(cur, search_id, uid):
    cur.execute('SELECT id,user_id,result,status,sex,slot,catalog_revision FROM shop_image_search_history WHERE id=%s FOR UPDATE', (str(search_id),))
    row = cur.fetchone()
    if not row or row['user_id'] != uid:
        raise HTTPException(404, '검색 기록을 찾을 수 없습니다.')
    if row['status'] != 'completed':
        raise HTTPException(409, '검색 완료 후 평가할 수 있습니다.')
    return row


def candidate_ids(record, slot=None):
    return {str(item['id']) for group in record['result'].get('groups', []) if slot is None or group['slot'] == slot
            for item in group.get('items', [])}


def publish(search_id, uid, selected_ids):
    from shop_sharing import short_target
    selected_ids = sorted(set(selected_ids))
    with transaction(write=True) as cur:
        row = owner_record(cur, search_id, uid)
        if not set(selected_ids).issubset(candidate_ids(row)) or any(
                len(set(selected_ids) & {str(item['id']) for item in group.get('items', [])}) > 1
                for group in row['result'].get('groups', [])):
            raise HTTPException(422, '검색 결과에서 부위별로 한 아이템만 선택해주세요.')
        shares = list(row['result'].get('shares', []))
        existing = next((share for share in shares if share['selected_ids'] == selected_ids), None)
        if existing:
            return {'url': existing['url']}
        if len(shares) >= 32:
            raise HTTPException(422, '이 검색에서 저장할 수 있는 공유 결과 수를 초과했습니다.')
        token = uuid.UUID(str(search_id)).hex + secrets.token_hex(24)
        target = short_target(f"/shop?imageResult={token}&v={row['catalog_revision']}&sex={row['sex']}")
        digest = sha256(target.encode()).hexdigest()
        for _ in range(32):
            code = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(4))
            cur.execute('INSERT INTO shop_short_links(code,target,target_hash) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING RETURNING code', (code,target,digest))
            saved = cur.fetchone()
            if saved:
                break
        else:
            raise HTTPException(503, '짧은 URL을 생성하지 못했습니다. 다시 시도해주세요.')
        url = 'https://r2archive.com/short/' + saved['code']
        shares.append({'token': token, 'selected_ids': selected_ids, 'url': url})
        cur.execute("UPDATE shop_image_search_history SET result=jsonb_set(result,'{shares}',%s) WHERE id=%s", (Json(shares),str(search_id)))
    return {'url': url}


def shared_record(cur, token):
    import re
    if not re.fullmatch(r'[a-f0-9]{80}', token):
        raise HTTPException(404, '공유 결과를 찾을 수 없습니다.')
    cur.execute("SELECT id,user_id,result,sex,slot,catalog_revision,image_key,image_format FROM shop_image_search_history WHERE id=%s AND status='completed' AND result->'shares' @> %s::jsonb", (str(uuid.UUID(hex=token[:32])),Json([{'token': token}]),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, '존재하지 않거나 삭제된 공유 결과입니다.')
    return row


def shared(token, uid=None):
    with transaction() as cur:
        row = shared_record(cur, token)
        share = next(share for share in row['result']['shares'] if share['token'] == token)
        owner = uid is not None and uid == row['user_id']
        votes = []
        if owner:
            cur.execute('SELECT slot,item_id::text AS item_id,value FROM shop_image_search_votes WHERE search_id=%s', (str(row['id']),))
            votes = [dict(vote) for vote in cur.fetchall()]
    return {**{key:row['result'][key] for key in ('items','groups')}, 'version': row['catalog_revision'],
            'sex': row['sex'], 'slot': row['slot'], 'shared': True, 'url': share['url'],
            'image_url': f'/api/shop/image-search/shared/{token}/image', 'selected_ids': share['selected_ids'],
            'search_id': str(row['id']) if owner else None, 'votes': votes,
            'preview_votes': row['result'].get('preview_votes', []) if owner else []}


def shared_image_path(token):
    with transaction() as cur:
        row = shared_record(cur, token)
    path = file_path(row['image_key'])
    if not path.is_file():
        raise HTTPException(404, '공유 이미지를 찾을 수 없습니다.')
    return path, {'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[row['image_format']]


def vote(search_id, uid, slot, item_id, value):
    with transaction(write=True) as cur:
        row = owner_record(cur, search_id, uid)
        if item_id not in candidate_ids(row, slot):
            raise HTTPException(422, '이 검색 결과에 포함된 아이템만 평가할 수 있습니다.')
        if value == 0:
            cur.execute('DELETE FROM shop_image_search_votes WHERE search_id=%s AND slot=%s AND item_id=%s', (str(search_id),slot,int(item_id)))
        else:
            cur.execute('''INSERT INTO shop_image_search_votes(search_id,slot,item_id,user_id,value) VALUES(%s,%s,%s,%s,%s)
                ON CONFLICT(search_id,slot,item_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now()''',
                (str(search_id),slot,int(item_id),uid,value))
    return {'slot': slot, 'item_id': item_id, 'value': value}


def action(search_id, uid, action_name, item_ids):
    with transaction(write=True) as cur:
        row = owner_record(cur, search_id, uid)
        if not set(item_ids).issubset(candidate_ids(row)):
            raise HTTPException(422, '이 검색 결과에 포함된 아이템만 기록할 수 있습니다.')
        cur.execute('''INSERT INTO shop_image_search_actions(search_id,user_id,action,item_ids)
            SELECT %s,%s,%s,%s WHERE (SELECT count(*) FROM shop_image_search_actions WHERE search_id=%s)<200''',
                    (str(search_id),uid,action_name,[int(item) for item in item_ids],str(search_id)))
    return {'recorded': True}


def preview_vote(search_id, uid, item_ids, value):
    ids = sorted(set(item_ids), key=int)
    with transaction(write=True) as cur:
        row = owner_record(cur, search_id, uid)
        candidates = {str(item['id']): (group['slot'], item) for group in row['result'].get('groups', []) for item in group.get('items', [])}
        if len(ids) != len(item_ids) or any(item_id not in candidates or not candidates[item_id][1].get('preview_available')
                                           or not candidates[item_id][1].get('model') for item_id in ids):
            raise HTTPException(422, '이 검색 결과에서 미리보기 가능한 아이템만 평가할 수 있습니다.')
        if len({candidates[item_id][0] for item_id in ids}) != len(ids):
            raise HTTPException(422, '부위별로 한 아이템만 평가할 수 있습니다.')
        votes = list(row['result'].get('preview_votes', []))
        existing = next((vote for vote in votes if vote['item_ids'] == ids), None)
        if value and not existing and len(votes) >= 64:
            raise HTTPException(422, '이 검색에서 평가할 수 있는 의상 조합 수를 초과했습니다.')
        votes = [vote for vote in votes if vote['item_ids'] != ids]
        saved = {'item_ids': ids, 'value': value, 'updated_at': datetime.now().astimezone().isoformat()}
        if value:
            votes.append({**saved, 'created_at': existing['created_at'] if existing else saved['updated_at']})
        cur.execute("UPDATE shop_image_search_history SET result=jsonb_set(result,'{preview_votes}',%s) WHERE id=%s", (Json(votes), str(search_id)))
    return saved


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    raise TypeError('Unsupported history value')


def public_record(row):
    result = dict(row)
    result['id'] = str(row['id'])
    result.pop('image_key', None)
    result['image_url'] = f"/api/shop/image-search/admin/history/{row['id']}/image"
    return json.loads(json.dumps(result, default=json_value))


def listing(status='', sex='', slot='', vote_filter='', before=None, limit=24):
    clauses, args = ['TRUE'], []
    for column,value in [('review_status',status),('sex',sex),('slot',slot)]:
        if value:
            clauses.append(f'h.{column}=%s'); args.append(value)
    if vote_filter:
        clauses.append('EXISTS(SELECT 1 FROM shop_image_search_votes v WHERE v.search_id=h.id AND v.value=%s)')
        args.append(1 if vote_filter == 'like' else -1)
    if before:
        clauses.append('(h.created_at,h.id)<(SELECT created_at,id FROM shop_image_search_history WHERE id=%s)')
        args.append(str(before))
    with transaction() as cur:
        cur.execute('''SELECT h.id,h.user_id,(h.diagnostics ? 'guest_id') AS is_guest,h.created_at,h.completed_at,h.status,h.sex,h.slot,h.catalog_revision,h.model,
            h.image_bytes,h.original_filename,h.review_status,h.review_version,h.error,COALESCE(h.result->'preview_votes','[]'::jsonb) AS preview_votes,
            (SELECT count(*) FROM shop_image_search_votes v WHERE v.search_id=h.id AND value=1) AS likes,
            (SELECT count(*) FROM shop_image_search_votes v WHERE v.search_id=h.id AND value=-1) AS dislikes,
            (SELECT count(*) FROM shop_image_search_examples e WHERE e.search_id=h.id) AS example_count
            FROM shop_image_search_history h WHERE '''+' AND '.join(clauses)+' ORDER BY h.created_at DESC,h.id DESC LIMIT %s', [*args,limit+1])
        rows = cur.fetchall()
        cur.execute('''SELECT count(*) AS total,COALESCE(sum(image_bytes),0) AS image_bytes,
            count(*) FILTER(WHERE review_status='pending') AS pending,
            count(*) FILTER(WHERE review_status='approved') AS approved,
            (SELECT count(*) FROM shop_image_search_examples) AS examples FROM shop_image_search_history''')
        stats = cur.fetchone()
        cur.execute('SELECT generation FROM shop_image_search_training_state WHERE id=1')
        stats['generation'] = cur.fetchone()['generation']
    return {'items': [public_record(row) for row in rows[:limit]], 'has_more': len(rows)>limit,
            'next_cursor': str(rows[limit-1]['id']) if len(rows)>limit else None, 'stats': dict(stats)}


def feedback(search_ids):
    ids = list(dict.fromkeys(str(value) for value in search_ids))
    if not ids:
        return {'items': []}
    with transaction() as cur:
        cur.execute('''SELECT h.id,v.slot,v.item_id::text AS item_id,v.value,v.updated_at
            FROM shop_image_search_history h LEFT JOIN shop_image_search_votes v ON v.search_id=h.id
            WHERE h.id=ANY(%s::uuid[]) ORDER BY h.id,v.slot,v.item_id''', (ids,))
        items = {}
        for row in cur.fetchall():
            item = items.setdefault(str(row['id']), {'id': str(row['id']), 'likes': 0, 'dislikes': 0, 'votes': []})
            if row['value'] is not None:
                item['votes'].append({key: row[key] for key in ('slot', 'item_id', 'value', 'updated_at')})
                item['likes' if row['value'] == 1 else 'dislikes'] += 1
        cur.execute("SELECT id,COALESCE(result->'preview_votes','[]'::jsonb) AS preview_votes FROM shop_image_search_history WHERE id=ANY(%s::uuid[])", (ids,))
        for row in cur.fetchall():
            if str(row['id']) in items:
                items[str(row['id'])]['preview_votes'] = row.get('preview_votes', [])
    return json.loads(json.dumps({'items': list(items.values())}, default=json_value))


def detail(search_id):
    with transaction() as cur:
        cur.execute('SELECT * FROM shop_image_search_history WHERE id=%s', (str(search_id),))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, '검색 기록을 찾을 수 없습니다.')
        cur.execute('SELECT slot,item_id::text AS item_id,value,updated_at FROM shop_image_search_votes WHERE search_id=%s ORDER BY slot,item_id', (str(search_id),))
        row['votes'] = cur.fetchall()
        cur.execute('SELECT action,item_ids,created_at FROM shop_image_search_actions WHERE search_id=%s ORDER BY id', (str(search_id),))
        row['actions'] = cur.fetchall()
        cur.execute('SELECT version,reviewer_id,decision,labels,notes,created_at FROM shop_image_search_reviews WHERE search_id=%s ORDER BY version', (str(search_id),))
        row['reviews'] = cur.fetchall()
    return public_record(row)


def image_path(search_id):
    with transaction() as cur:
        cur.execute('SELECT image_key,image_format FROM shop_image_search_history WHERE id=%s', (str(search_id),))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, '이미지를 찾을 수 없습니다.')
    path = file_path(row['image_key'])
    if not path.is_file():
        raise HTTPException(404, '보관된 이미지가 없습니다.')
    return path, {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}[row['image_format']]


def training_snapshot():
    with transaction() as cur:
        cur.execute('SELECT generation FROM shop_image_search_training_state WHERE id=1')
        state = cur.fetchone()
        if state is None:
            raise RuntimeError('Training state is unavailable')
        generation = state['generation']
        with _training_lock:
            if _training['generation'] != generation:
                cur.execute('''SELECT DISTINCT ON(e.source_sha256,e.slot) e.item_id::text AS item_id,e.sex,e.slot,e.thumbnail,
                    e.encoder_sha256,e.feature FROM shop_image_search_examples e
                    JOIN shop_image_search_history h ON h.id=e.search_id AND h.review_status='approved'
                    ORDER BY e.source_sha256,e.slot,e.created_at DESC,e.search_id DESC''')
                rows = []
                for row in cur.fetchall():
                    feature = np.frombuffer(bytes(row.pop('feature')), dtype=np.float32).copy()
                    if feature.shape == (384,) and np.isfinite(feature).all() and .99 < np.linalg.norm(feature) < 1.01:
                        rows.append({**row, 'feature': feature})
                _training.update(generation=generation, rows=rows)
            return generation, _training['rows']


def review(search_id, admin_id, decision, expected_version, labels, notes):
    import shop_outfit_search as core
    from shop_image_search import decode_image
    from routers.shop import SLOT_SQL, ACCESSIBLE
    examples, verified = [], {}
    with transaction() as cur:
        cur.execute('SELECT * FROM shop_image_search_history WHERE id=%s', (str(search_id),))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, '검색 기록을 찾을 수 없습니다.')
        if row['review_version'] != expected_version:
            raise HTTPException(409, '다른 검수 내용이 반영됐습니다. 기록을 다시 열어주세요.')
        if decision == 'approved':
            selected = {slot: label for slot,label in labels.items() if label.get('item_id')}
            if not selected:
                raise HTTPException(422, '최소 한 부위의 정답을 지정해주세요.')
            if not set(selected).issubset(core.SLOTS):
                raise HTTPException(422, '지원하지 않는 부위입니다.')
            if row['slot'] != 'all' and not set(selected).issubset({row['slot']}):
                raise HTTPException(422, '이 검색에서 분석한 부위만 승인할 수 있습니다.')
            ids = [int(label['item_id']) for label in selected.values()]
            cur.execute(f'''SELECT item_id::text AS id,name,sex,thumbnail,({SLOT_SQL}) AS slot FROM shop_items
                WHERE revision=%s AND item_id=ANY(%s) AND {ACCESSIBLE}''', (row['catalog_revision'],ids))
            items = {item['id']: dict(item) for item in cur.fetchall()}
    if decision == 'approved':
        try:
            with file_path(row['image_key']).open('rb') as stream:
                image = decode_image(stream.read())
            model = core.outfit_engine()
            for slot,label in selected.items():
                item = items.get(str(label['item_id']))
                if not item or item['slot'] != slot or item['sex'] not in (row['sex'], 'common') or not item['thumbnail']:
                    raise HTTPException(422, '정답 아이템의 부위와 성별을 확인해주세요.')
                region = label.get('region') or row['diagnostics'].get('localization', {}).get(slot)
                core.valid_region(region or {}, image.size)
                vector = model.example_vector(image, region)
                examples.append((slot,item,vector,region,model.encoder_sha256))
                verified[slot] = {'item_id': item['id'], 'name': item['name'], 'region': region}
        except HTTPException:
            raise
        except (ValueError, KeyError, TypeError, OSError):
            raise HTTPException(422, '원본 이미지와 정답 부위의 영역을 확인해주세요.') from None
        finally:
            if 'image' in locals():
                image.close()
    with transaction(write=True) as cur:
        cur.execute('SELECT review_version FROM shop_image_search_history WHERE id=%s FOR UPDATE', (str(search_id),))
        locked = cur.fetchone()
        if not locked:
            raise HTTPException(404, '검색 기록을 찾을 수 없습니다.')
        if locked['review_version'] != expected_version:
            raise HTTPException(409, '다른 검수 내용이 반영됐습니다. 기록을 다시 열어주세요.')
        cur.execute('DELETE FROM shop_image_search_examples WHERE search_id=%s', (str(search_id),))
        for slot,item,vector,region,encoder in examples:
            cur.execute('''INSERT INTO shop_image_search_examples
                (search_id,slot,item_id,sex,thumbnail,source_sha256,encoder_sha256,feature,region)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (str(search_id),slot,int(item['id']),item['sex'],item['thumbnail'],row['source_sha256'],encoder,vector.astype(np.float32).tobytes(),Json(region)))
        cur.execute('''UPDATE shop_image_search_history SET review_status=%s,review_version=review_version+1,
            review_labels=%s,review_notes=%s,reviewed_by=%s,reviewed_at=now() WHERE id=%s''',
            (decision,Json(verified),notes,admin_id,str(search_id)))
        cur.execute('INSERT INTO shop_image_search_reviews(search_id,version,reviewer_id,decision,labels,notes) VALUES(%s,%s,%s,%s,%s,%s)',
                    (str(search_id),expected_version+1,admin_id,decision,Json(verified),notes))
        cur.execute('UPDATE shop_image_search_training_state SET generation=generation+1 WHERE id=1 RETURNING generation')
        generation = cur.fetchone()['generation']
    return {'status': decision, 'review_version': expected_version+1, 'examples': len(examples), 'generation': generation}


def delete(search_id):
    moved, original = None, None
    try:
        with transaction(write=True) as cur:
            cur.execute('SELECT image_key FROM shop_image_search_history WHERE id=%s FOR UPDATE', (str(search_id),))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, '검색 기록을 찾을 수 없습니다.')
            original = file_path(row['image_key'])
            if original.is_file():
                moved = original.with_name(original.name+'.deleting-'+uuid.uuid4().hex)
                original.replace(moved)
            cur.execute('DELETE FROM shop_image_search_history WHERE id=%s', (str(search_id),))
            cur.execute('UPDATE shop_image_search_training_state SET generation=generation+1 WHERE id=1')
    except BaseException:
        if moved and moved.is_file():
            moved.replace(original)
        raise
    if moved:
        try:
            moved.unlink()
        except OSError:
            logger.exception('Could not remove a deleted search image')
            return {'deleted': True, 'warning': '기록은 삭제됐지만 보관 파일 정리가 필요합니다.'}
    return {'deleted': True}
