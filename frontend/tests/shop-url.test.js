import test from 'node:test'
import assert from 'node:assert/strict'
import { itemShareUrl, outfitShareUrl, readShopUrl, SHOP_SLOTS, takeShopReturn } from '../src/utils/shopUrl.js'

test('outfit shares preserve version, all five slots, gender, camera and counterpart state', () => {
  const slots = Object.fromEntries(SHOP_SLOTS.map((slot, i) => [slot, { id: String(100 + i) }]))
  const url = new URL(outfitShareUrl({ version: 'a'.repeat(20), sex: 'female', slots, pair: true, angle: 237, zoom: 119 }))
  assert.equal(url.origin, 'https://r2archive.com')
  assert.equal(url.pathname, '/shop')
  const restored = readShopUrl(url.search)
  assert.equal(restored.version, 'a'.repeat(20))
  assert.equal(restored.preview, true)
  assert.equal(restored.pair, true)
  assert.equal(restored.sex, 'female')
  assert.equal(restored.angle, 237)
  assert.equal(restored.zoom, 119)
  assert.deepEqual(restored.slots, Object.fromEntries(SHOP_SLOTS.map((slot, i) => [slot, String(100 + i)])))
})

test('item URLs restore a single selected item and its price option', () => {
  const url = new URL(itemShareUrl({ id: '1000208', version: 'b'.repeat(20) }, 'male', 'P7'))
  const state = readShopUrl(url.search)
  assert.equal(state.item, '1000208')
  assert.equal(state.price, 'P7')
  assert.equal(state.preview, false)
  assert.deepEqual(state.slots, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null])))
})

test('unselected slots remain defaults and invalid inputs never become model identifiers', () => {
  const state = readShopUrl('?view=preview&v=../../secret&hair=../../x&pet=-1&sex=admin&angle=Infinity&zoom=9999')
  assert.equal(state.version, null)
  assert.equal(state.slots.hair, null)
  assert.equal(state.slots.pet, null)
  assert.equal(state.sex, null)
  assert.equal(state.angle, 180)
  assert.equal(state.zoom, 135)
})

test('login restoration retains only recent local shop URLs and rejects redirect targets', () => {
  const original = globalThis.sessionStorage
  let saved
  globalThis.sessionStorage = { getItem: () => saved, removeItem: () => { saved = null } }
  try {
    saved = JSON.stringify({ url: '/shop?item=1000208&v=' + 'a'.repeat(20), at: Date.now() })
    assert.equal(takeShopReturn(), '/shop?item=1000208&v=' + 'a'.repeat(20))
    for (const value of [{ url: '//example.com/shop', at: Date.now() }, { url: '/other', at: Date.now() }, { url: '/shop', at: Date.now() - 1000000 }]) {
      saved = JSON.stringify(value)
      assert.equal(takeShopReturn(), null)
    }
  } finally { if (original === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = original }
})
