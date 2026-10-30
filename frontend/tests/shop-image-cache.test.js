import test from 'node:test'
import assert from 'node:assert/strict'
import { createShopImageCache } from '../src/utils/shopImageCache.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(options = {}) {
  const requests = [], revoked = []
  const cache = createShopImageCache({ fetcher: async url => { requests.push(url); return { ok: true, blob: async () => new Blob(['1234']) } }, createUrl: () => `blob:${requests.length}`, revokeUrl: url => revoked.push(url), ...options })
  return { cache, requests, revoked }
}

test('shared thumbnails reuse both in-flight and retained responses', async () => {
  const { cache, requests } = fixture()
  const a = cache.acquire('/image'), b = cache.acquire('/image')
  assert.equal(await a.promise, await b.promise)
  a.release(); b.release()
  const again = cache.acquire('/image')
  await again.promise
  assert.deepEqual(requests, ['/image'])
  again.release(); cache.clear()
})

test('LRU bounds revoke inactive blobs while preserving images in use', async () => {
  const { cache, revoked } = fixture({ maxEntries: 1, maxBytes: 4 })
  const a = cache.acquire('/a'); const aUrl = await a.promise
  const b = cache.acquire('/b'); const bUrl = await b.promise
  assert.deepEqual(revoked, [])
  a.release()
  assert.deepEqual(revoked, [aUrl])
  assert.equal(cache.stats().entries, 1)
  b.release(); cache.clear()
  assert.deepEqual(revoked, [aUrl, bUrl])
  assert.equal(cache.stats().bytes, 0)
})

test('requests are bounded and discarded offscreen queued images are never fetched', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = []
  const { cache } = fixture({ maxConcurrent: 1, fetcher: async url => { requests.push(url); await gate; return { ok: true, blob: async () => new Blob(['x']) } } })
  const a = cache.acquire('/a'); await tick()
  const b = cache.acquire('/b'); const rejected = assert.rejects(b.promise, { name: 'AbortError' }); b.release()
  await rejected
  assert.deepEqual(requests, ['/a'])
  release(); await a.promise; a.release(); cache.clear()
})

test('session cleanup aborts pending requests and cannot repopulate the next session', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const { cache, revoked } = fixture({ fetcher: async () => { await gate; return { ok: true, blob: async () => new Blob(['x']) } } })
  const old = cache.acquire('/private'); await tick()
  const rejected = assert.rejects(old.promise, { name: 'AbortError' }); cache.clear(); release(); await rejected; await tick()
  assert.equal(cache.stats().entries, 0)
  assert.equal(cache.stats().bytes, 0)
  assert.deepEqual(revoked, [])
})

test('temporary rate limits retry within the same request budget and failures remain retryable', async () => {
  let attempts = 0
  const { cache } = fixture({ retryDelay: () => 1, fetcher: async () => { attempts++; return attempts === 1 ? { ok: false, status: 429 } : { ok: true, status: 200, blob: async () => new Blob(['x']) } } })
  const image = cache.acquire('/limited'); await image.promise; assert.equal(attempts, 2); image.release(); cache.clear()
  let succeed = false
  const other = fixture({ fetcher: async () => succeed ? { ok: true, status: 200, blob: async () => new Blob(['x']) } : { ok: false, status: 404 } }).cache
  const failed = other.acquire('/missing'); await assert.rejects(failed.promise); failed.release(); succeed = true
  const retry = other.acquire('/missing'); await retry.promise; retry.release(); other.clear()
})
