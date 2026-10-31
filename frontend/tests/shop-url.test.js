import test from 'node:test'
import assert from 'node:assert/strict'
import { coupleShareUrl, itemShareUrl, outfitShareUrl, readShopUrl, SHOP_SLOTS, takeShopReturn } from '../src/utils/shopUrl.js'

test('outfit shares preserve all eight slots, gender, camera and counterpart state', () => {
  const slots = Object.fromEntries(SHOP_SLOTS.map((slot, i) => [slot, { id: String(100 + i) }]))
  const url = new URL(outfitShareUrl({ version: 'a'.repeat(20), sex: 'female', slots, pair: true, angle: 237, zoom: 119 }))
  assert.equal(url.origin, 'https://r2archive.com')
  assert.equal(url.pathname, '/shop')
  const restored = readShopUrl(url.search)
  assert.equal(restored.version, 'a'.repeat(20))
  assert.equal(restored.preview, true)
  assert.equal(restored.couple, false)
  assert.equal(restored.pair, true)
  assert.equal(restored.sex, 'female')
  assert.equal(restored.angle, 237)
  assert.equal(restored.zoom, 119)
  assert.deepEqual(restored.slots, Object.fromEntries(SHOP_SLOTS.map((slot, i) => [slot, String(100 + i)])))
  assert.equal(restored.slots.face, slots.face.id)
})

test('existing five-slot outfit links keep their clothing and use the default face', () => {
  const restored = readShopUrl('?view=preview&v=' + 'a'.repeat(20) + '&sex=male&hair=200&top=201&bottom=202&shoes=203&pet=204')
  assert.deepEqual(restored.slots, { hair: '200', face: null, top: '201', bottom: '202', shoes: '203', pet: '204', accessory: null, summon: null })
})

test('item URLs restore a single selected item and its price option', () => {
  const url = new URL(itemShareUrl({ id: '1000208', version: 'b'.repeat(20) }, 'male', 'P7'))
  const state = readShopUrl(url.search)
  assert.equal(state.item, '1000208')
  assert.equal(state.price, 'P7')
  assert.equal(state.preview, false)
  assert.equal(state.couple, false)
  assert.deepEqual(state.slots, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null])))
})

test('couple motion shares preserve the ring, catalog, gender and all eight selected slots', () => {
  const slots = Object.fromEntries(SHOP_SLOTS.map((slot, index) => [slot, { id: String(100 + index) }]))
  const url = new URL(coupleShareUrl({ version: 'b'.repeat(20), sex: 'female', slots, item: { id: '30846' } }))
  assert.equal(url.origin, 'https://r2archive.com')
  assert.equal(url.pathname, '/shop')
  const restored = readShopUrl(url.search)
  assert.equal(restored.couple, true)
  assert.equal(restored.preview, false)
  assert.equal(restored.item, '30846')
  assert.equal(restored.version, 'b'.repeat(20))
  assert.equal(restored.sex, 'female')
  assert.equal(restored.pair, true)
  assert.equal(restored.angle, 180)
  assert.equal(restored.zoom, 100)
  assert.deepEqual(restored.slots, Object.fromEntries(SHOP_SLOTS.map((slot, index) => [slot, String(100 + index)])))
})

test('couple shares support default clothing and reject malformed ring identifiers', () => {
  const slots = Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null]))
  const url = new URL(coupleShareUrl({ version: 'a'.repeat(20), sex: 'male', slots, item: '30120' }))
  assert.deepEqual(readShopUrl(url.search).slots, slots)
  url.searchParams.set('item', '../../secret')
  assert.equal(readShopUrl(url.search).item, null)
})

test('couple snapshots retain both actors independently of future profile edits',()=>{
  for(const primarySex of ['male','female'])for(const partnerSex of ['male','female']){
    const slots=Object.fromEntries(SHOP_SLOTS.map((slot,i)=>[slot,{id:String(100+i)}]))
    const partner={sex:partnerSex,slots:Object.fromEntries(SHOP_SLOTS.map((slot,i)=>[slot,{id:String(200+i)}]))}
    const url=new URL(coupleShareUrl({version:'a'.repeat(20),sex:primarySex,slots,partner,item:'30854',angle:245,zoom:126,panX:14,panY:-19}))
    partner.slots.top.id='999';slots.top.id='888'
    const restored=readShopUrl(url.search)
    assert.equal(restored.sex,primarySex);assert.equal(restored.partner.sex,partnerSex)
    assert.equal(restored.slots.top,'102');assert.equal(restored.partner.slots.top,'202')
    assert.deepEqual([restored.angle,restored.zoom,restored.panX,restored.panY],[245,126,14,-19])
    assert.equal(Object.values(restored.partner.slots).filter(Boolean).length,8)
  }
  assert.equal(readShopUrl('?view=couple&partnerSex=admin&partner_top=201').partner,null)
  assert.equal(readShopUrl('?view=couple&partnerSex=female&partner_top=../../x').partner.slots.top,null)
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


test('outfit and couple links retain bounded screen movement without changing legacy defaults', () => {
  for (const create of [outfitShareUrl, coupleShareUrl]) {
    const url = new URL(create({ version: 'a'.repeat(20), sex: 'female', slots: { top: { id: '200' } }, item: '30120', angle: 237, zoom: 119, panX: 12.5, panY: -8.25 }))
    const restored = readShopUrl(url.search)
    assert.equal(restored.panX, 12.5); assert.equal(restored.panY, -8.25)
    assert.equal(restored.slots.top, '200'); assert.equal(restored.angle, 237); assert.equal(restored.zoom, 119)
  }
  assert.equal(readShopUrl('?panX=Infinity&panY=invalid').panX, 0)
  assert.equal(readShopUrl('?panX=999&panY=-999').panX, 75)
  assert.equal(readShopUrl('?panX=999&panY=-999').panY, -75)
  assert.equal(readShopUrl('?view=preview&top=200').panY, 0)
})
