export const SHOP_ORIGIN = 'https://r2archive.com'
export const SHOP_SLOTS = ['hair', 'face', 'top', 'bottom', 'shoes', 'pet', 'accessory', 'summon']
export const SLOT_LABELS = { hair: '머리', face: '성형', top: '상의', bottom: '하의', shoes: '신발', pet: '펫', accessory: '장식', summon: '소환물ㆍ날개' }
export const OPTIONAL_SLOT_LABELS = { pet: '선택한 펫 없음', accessory: '선택한 장식 없음', summon: '선택한 소환물ㆍ날개 없음' }
const validId = value => /^\d{1,12}$/.test(value || '') ? value : null
const bounded = (value, fallback, min, max) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback

export function readShopUrl(search) {
  const params = new URLSearchParams(search)
  const version = /^[a-f0-9]{12,64}$/.test(params.get('v') || '') ? params.get('v') : null
  return {
    version, item: validId(params.get('item')), preview: params.get('view') === 'preview',
    sex: ['male', 'female'].includes(params.get('sex')) ? params.get('sex') : null,
    slots: Object.fromEntries(SHOP_SLOTS.map(slot => [slot, validId(params.get(slot))])),
    pair: params.get('pair') === '1', angle: bounded(params.get('angle'), 180, 0, 360),
    zoom: bounded(params.get('zoom'), 100, 75, 135), price: /^[A-Z0-9]{1,8}$/.test(params.get('price') || '') ? params.get('price') : null,
  }
}

export function itemShareUrl(item, sex, price) {
  const url = new URL('/shop', SHOP_ORIGIN)
  url.searchParams.set('v', item.version)
  url.searchParams.set('item', item.id)
  if (sex) url.searchParams.set('sex', sex)
  if (price) url.searchParams.set('price', price)
  return url.href
}

export function outfitShareUrl({ version, sex, slots, pair, angle, zoom }) {
  const url = new URL('/shop', SHOP_ORIGIN)
  for (const [key, value] of Object.entries({ view: 'preview', v: version, sex, pair: pair ? '1' : '0', angle: String(angle), zoom: String(zoom) })) url.searchParams.set(key, value)
  for (const slot of SHOP_SLOTS) if (slots[slot]) url.searchParams.set(slot, String(slots[slot].id || slots[slot]))
  return url.href
}

export function rememberShopReturn() {
  try { sessionStorage.setItem('r2_shop_return', JSON.stringify({ url: location.pathname + location.search, at: Date.now() })) } catch {}
}

export function takeShopReturn() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('r2_shop_return'))
    sessionStorage.removeItem('r2_shop_return')
    if (saved && /^\/shop(?:\?|$)/.test(saved.url) && saved.url.length < 4096 && Date.now() - saved.at < 900000) return saved.url
  } catch {}
  return null
}
