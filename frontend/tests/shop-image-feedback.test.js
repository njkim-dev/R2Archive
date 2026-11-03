import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateShopImage } from '../src/api/shop.js'

test('votes are sent immediately with keepalive and resolve only after server acknowledgment', async () => {
  const original = global.fetch
  let request, release
  global.fetch = (url, options) => { request = { url, options }; return new Promise(resolve => { release = resolve }) }
  try {
    let done = false
    const saved = rateShopImage('history', 'hair', '123', -1).then(value => { done = true; return value })
    assert.equal(request.url, '/api/shop/image-search/history/history/votes')
    assert.equal(request.options.keepalive, true)
    assert.equal(request.options.credentials, 'include')
    assert.equal(request.options.method, 'PUT')
    assert.deepEqual(JSON.parse(request.options.body), { slot: 'hair', item_id: '123', value: -1 })
    assert.equal(done, false)
    release({ ok: true, json: async () => ({ slot: 'hair', item_id: '123', value: -1 }) })
    assert.equal((await saved).value, -1)
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: '평가 저장 실패' }) })
    await assert.rejects(rateShopImage('history', 'hair', '123', 1), error => error.response.status === 503 && error.response.data.detail === '평가 저장 실패')
  } finally { global.fetch = original }
})
