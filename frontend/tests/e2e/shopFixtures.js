export const version = 'a'.repeat(20)
export const hash = 'c'.repeat(64)
export const root = `/api/shop/assets/${version}`
export const hero = { id: '1000208', version, name: '돌발모드(영웅)', category: '503', department: 'functional', sex: 'common', slot: null, preview_available: false, description: '장애물이 갑자기 출현합니다.', prices: [{ key: 'P1', label: '1일', amount: 1000, currency: 'cash' }, { key: 'P7', label: '7일', amount: 2000, currency: 'cash' }, { key: 'P30', label: '30일', amount: 4000, currency: 'cash' }], thumbnail: null }
export const shirt = { ...hero, id: '200', name: '검증 셔츠(남)', department: 'wearable', sex: 'male', slot: 'top', preview_available: true, model: `${root}/models/${'b'.repeat(64)}.json.gz`, counterpart_id: '201' }
export const femaleShirt = { ...shirt, id: '201', name: '검증 셔츠(여)', sex: 'female' }
export const pet = { ...shirt, id: '300', name: '검증 펫', sex: 'common', slot: 'pet', model: `${root}/models/${'c'.repeat(64)}.json.gz`, counterpart_id: null }
export const mesh = { meshes: [{ name: 'Waist', vertices: [-20, 20, 0, 0, 0, 1, 0, 0, 20, 20, 0, 0, 0, 1, 1, 0, 0, 280, 0, 0, 0, 1, .5, 1], indices: [0, 1, 2], texture: `${hash}.webp` }] }
export const petMesh = { meshes: [{ ...mesh.meshes[0], name: 'Pet-body', vertices: [-130, 30, 0, 0, 0, 1, 0, 0, -30, 30, 0, 0, 0, 1, 1, 0, -80, 140, 0, 0, 0, 1, .5, 1] }] }
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmEAHCAD34BABm6tHAAAAAAElFTkSuQmCC', 'base64')

export async function setup(page, { admin = true, loggedIn = true, metaGate, listGate, items, nextGate, models, texture = png, modelGate, textureRevision, favoriteIds = [], favoriteGate, authGate, wardrobeIds = [], wardrobeMains = [], wardrobeGate, wardrobeSaveGate } = {}) {
  const requests = []
  const shortLinks = new Map()
  const savedFavorites = new Set(favoriteIds.map(String))
  const savedOwned = new Set(wardrobeIds.map(String))
  const mains = new Map(wardrobeMains.map(main => [`${main.sex}:${main.slot}`, main]))
  const ownedResponse = () => ({ ids: [...savedOwned], mains: [...mains.values()] })
  requests.wardrobe = ownedResponse
  await page.addInitScript(() => { window.__copiedShopUrl = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }) })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.startsWith('/api/shop/')) requests.push(path)
    if (path === '/api/share/short' && route.request().method() === 'POST') {
      const target = route.request().postDataJSON().target
      const existing = [...shortLinks].find(([, value]) => value === target)
      const code = existing?.[0] || (shortLinks.size + 1).toString(36).padStart(4, '0')
      shortLinks.set(code, target)
      await page.evaluate(() => { window.__copiedShopUrl = '' })
      return route.fulfill({ json: { url: 'https://r2archive.com/short/' + code } })
    }
    if (path.startsWith('/api/share/short/')) return route.fulfill({ json: { target: shortLinks.get(path.split('/').at(-1)) } })
    if (path === '/api/share/myhome') return route.fulfill({ json: { handle: null } })
    if (path === '/api/shop/wardrobe/batch') {
      for (const id of route.request().postDataJSON().ids) {
        const item = (items || [shirt, femaleShirt, pet]).find(item => item.id === id)
        savedOwned.add(id)
        for (const sex of item.sex === 'common' ? ['male','female'] : [item.sex]) if (!mains.has(`${sex}:${item.slot}`)) mains.set(`${sex}:${item.slot}`, { sex, slot: item.slot, item: { ...item, version } })
      }
      return route.fulfill({ json: ownedResponse() })
    }
    if (path === '/api/auth/me') { if (authGate) await authGate; return route.fulfill({ json: { user: loggedIn ? { id: 1, provider: 'google', nickname: '관리자', onboarded: true } : null } }) }
    if (path === '/api/auth/admin-status') return route.fulfill({ json: { is_admin: admin } })
    if (path === '/api/shop/favorites' && route.request().method() === 'DELETE') { const slot = url.searchParams.get('slot'), removed = [...savedFavorites].filter(id => !slot || (items || [shirt,femaleShirt,pet,hero]).some(item => item.id === id && item.slot === slot)); removed.forEach(id => savedFavorites.delete(id)); return route.fulfill({ json: { removed_ids: removed, count: removed.length } }) }
    if (path === '/api/shop/favorites') { if (favoriteGate) await favoriteGate; return route.fulfill({ json: { ids: [...savedFavorites] } }) }
    if (path.startsWith('/api/shop/favorites/')) { const id = path.split('/').at(-1); if (route.request().method() === 'POST') savedFavorites.add(id); else savedFavorites.delete(id); return route.fulfill({ json: { id, favorite: savedFavorites.has(id) } }) }
    if (path === '/api/shop/wardrobe') { if (wardrobeGate) await wardrobeGate; return route.fulfill({ json: ownedResponse() }) }
    if (path.startsWith('/api/shop/wardrobe/')) {
      if (wardrobeSaveGate) await wardrobeSaveGate
      const id = path.split('/')[4], item = (items || [shirt, femaleShirt, pet]).find(item => item.id === id)
      if (!item) return route.fulfill({ status: 404, json: { detail: '아이템 없음' } })
      if (route.request().method() === 'DELETE') {
        savedOwned.delete(id)
        for (const [key, main] of mains) if (main.item.id === id) mains.delete(key)
      } else if (route.request().method() === 'POST') {
        savedOwned.add(id)
        for (const gender of item.sex === 'common' ? ['male', 'female'] : [item.sex]) {
          const key = `${gender}:${item.slot}`
          if (!mains.has(key)) mains.set(key, { sex: gender, slot: item.slot, item: { ...item, version } })
        }
      } else {
        const sex = url.searchParams.get('sex')
        if (!savedOwned.has(id)) return route.fulfill({ status: 404, json: { detail: '저장되지 않은 의상' } })
        mains.set(`${sex}:${item.slot}`, { sex, slot: item.slot, item: { ...item, version } })
      }
      return route.fulfill({ json: ownedResponse() })
    }
    if (path === '/api/shop/meta') { if (metaGate) await metaGate; return route.fulfill({ json: { revision: version, texture_revision: textureRevision, bases: { male: `${root}/models/${'d'.repeat(64)}.json.gz`, female: `${root}/models/${'e'.repeat(64)}.json.gz` }, counts: { wearable: 2, functional: 1, other: 0 }, admin_only: false } }) }
    if (path === '/api/shop/items') {
      if (listGate) await listGate
      const params = url.searchParams, position = params.get('cursor') || ''
      const start = position ? Number(position.split(':')[0]) + 1 : 0, size = Number(params.get('page_size') || 24)
      if (start && nextGate) await nextGate
      let list = items || (params.get('department') === 'wearable' ? [params.get('sex') === 'female' ? femaleShirt : shirt] : [hero])
      list = list.filter(item => (!item.is_unreleased || params.get('include_unreleased') === 'true' && item.department === 'wearable') && (!params.get('department') || item.department === params.get('department')) && (!params.get('sex') || item.sex === params.get('sex') || item.sex === 'common') && (!params.get('slot') || item.slot === params.get('slot')) && (!params.get('group') || item.group === params.get('group')) && (!params.get('subgroup') || item.subgroup === params.get('subgroup')) && (!params.get('q') || item.name.includes(params.get('q'))) && (params.get('owned_only') !== 'true' || savedOwned.has(item.id)) && (params.get('favorites_only') !== 'true' || savedFavorites.has(item.id)) && (params.get('preview_only') !== 'true' || !!item.preview_available && !!item.model) && (params.get('paired_only') !== 'true' || !!item.counterpart_id || item.slot === 'pet' && item.sex === 'common'))
      if (params.get('home')) list = list.filter(item => savedOwned.has(item.id))
      const chunk = list.slice(start, start + size), more = start + size < list.length
      return route.fulfill({ json: { version, items: chunk, total: start ? null : list.length, page_size: size, has_more: more, next_cursor: more ? `${start + size - 1}:${chunk.at(-1).id}` : null } })
    }
    if (path.startsWith('/api/shop/items/')) return route.fulfill({ json: items?.find(item => path.endsWith('/' + item.id)) || (path.endsWith('/201') ? femaleShirt : path.endsWith('/200') ? shirt : path.endsWith('/300') ? pet : hero) })
    if (path.includes('/models/')) { if (modelGate) await modelGate; return route.fulfill({ json: models?.[path] || (path.includes('c'.repeat(64)) ? petMesh : mesh) }) }
    if (path.includes('/textures/') || path.includes('/thumbnails/')) return route.fulfill({ body: texture, contentType: 'image/png' })
    if (path.endsWith('/flags')) return route.fulfill({ json: { favorites: [], played: [], played_all: [] } })
    return route.fulfill({ json: [] })
  })
  return requests
}

export async function copiedShopUrl(page) {
  await page.waitForFunction(() => !!window.__copiedShopUrl)
  const raw = new URL(await page.evaluate(() => window.__copiedShopUrl))
  if (!raw.pathname.startsWith('/short/')) return raw
  const data = await page.evaluate(code => fetch('/api/share/short/' + code).then(response => response.json()), raw.pathname.split('/').at(-1))
  return new URL(data.target, 'https://r2archive.com')
}
