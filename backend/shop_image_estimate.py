import logging
import math
from threading import Lock
from time import monotonic

from database import get_conn


_cache = {}
_lock = Lock()
logger = logging.getLogger(__name__)


def summarize(durations, slot):
    samples = sorted(float(value) for value in durations if value is not None and math.isfinite(float(value)) and 1 <= float(value) <= 140)
    if len(samples) < 5:
        return {'min_seconds': 20 if slot == 'all' else 10, 'max_seconds': 50 if slot == 'all' else 30, 'basis': 'initial'}

    def percentile(fraction):
        position = (len(samples) - 1) * fraction
        left = math.floor(position)
        right = min(left + 1, len(samples) - 1)
        return samples[left] + (samples[right] - samples[left]) * (position - left)

    lower = max(3, min(125, math.floor(percentile(.25) * .8)))
    upper = min(145, max(lower + 8, math.ceil(percentile(.9) * 1.25 + 3)))
    return {'min_seconds': lower, 'max_seconds': upper, 'basis': 'recent'}


def estimate(slot, model, pipeline):
    key = (slot, model, pipeline)
    with _lock:
        cached = _cache.get(key)
        if cached and monotonic() < cached[0]:
            return dict(cached[1])
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute('''SELECT EXTRACT(EPOCH FROM (completed_at-created_at)) FROM shop_image_search_history
                WHERE status='completed' AND slot=%s AND model=%s AND pipeline_version=%s
                AND created_at > now()-interval '7 days' AND completed_at > created_at
                AND diagnostics->>'cached' IS DISTINCT FROM 'true'
                ORDER BY created_at DESC LIMIT 80''', (slot, model, pipeline))
            result = summarize([row[0] for row in cur.fetchall()], slot)
    except Exception:
        logger.warning('Could not load image search duration estimates')
        return summarize([], slot)
    with _lock:
        if len(_cache) >= 5:
            _cache.clear()
        _cache[key] = (monotonic() + 60, result)
    return dict(result)
