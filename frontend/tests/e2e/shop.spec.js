import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })
const version = 'a'.repeat(20)
const hash = 'c'.repeat(64)
const root = `/api/shop/assets/${version}`
const hero = { id: '1000208', version, name: '돌발모드(영웅)', category: '503', department: 'functional', sex: 'common', slot: null, preview_available: false, description: '장애물이 갑자기 출현합니다.', prices: [{ key: 'P1', label: '1일', amount: 1000, currency: 'cash' }, { key: 'P7', label: '7일', amount: 2000, currency: 'cash' }, { key: 'P30', label: '30일', amount: 4000, currency: 'cash' }], thumbnail: null }
const shirt = { ...hero, id: '200', name: '검증 셔츠(남)', department: 'wearable', sex: 'male', slot: 'top', preview_available: true, model: `${root}/models/${'b'.repeat(64)}.json.gz`, counterpart_id: '201' }
const femaleShirt = { ...shirt, id: '201', name: '검증 셔츠(여)', sex: 'female' }
const pet = { ...shirt, id: '300', name: '검증 펫', sex: 'common', slot: 'pet', model: `${root}/models/${'c'.repeat(64)}.json.gz`, counterpart_id: null }
const mesh = { meshes: [{ name: 'Waist', vertices: [-20, 20, 0, 0, 0, 1, 0, 0, 20, 20, 0, 0, 0, 1, 1, 0, 0, 280, 0, 0, 0, 1, .5, 1], indices: [0, 1, 2], texture: `${hash}.webp` }] }
const petMesh = { meshes: [{ ...mesh.meshes[0], name: 'Pet-body', vertices: [-130, 30, 0, 0, 0, 1, 0, 0, -30, 30, 0, 0, 0, 1, 1, 0, -80, 140, 0, 0, 0, 1, .5, 1] }] }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmEAHCAD34BABm6tHAAAAAAElFTkSuQmCC', 'base64')

async function setup(page, { admin = true, loggedIn = true, metaGate, listGate, items, nextGate, models, texture = png, modelGate } = {}) {
  const requests = []
  await page.addInitScript(() => { window.__copiedShopUrl = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }) })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.startsWith('/api/shop/')) requests.push(path)
    if (path === '/api/auth/me') return route.fulfill({ json: { user: loggedIn ? { id: 1, provider: 'google', nickname: '관리자', onboarded: true } : null } })
    if (path === '/api/auth/admin-status') return route.fulfill({ json: { is_admin: admin } })
    if (path === '/api/shop/meta') { if (metaGate) await metaGate; return route.fulfill({ json: { revision: version, bases: { male: `${root}/models/${'d'.repeat(64)}.json.gz`, female: `${root}/models/${'e'.repeat(64)}.json.gz` }, counts: { wearable: 2, functional: 1, other: 0 }, admin_only: true } }) }
    if (path === '/api/shop/items') {
      if (listGate) await listGate
      const params = url.searchParams, position = params.get('cursor') || ''
      const start = position ? Number(position.split(':')[0]) + 1 : 0, size = Number(params.get('page_size') || 24)
      if (start && nextGate) await nextGate
      let list = items || (params.get('department') === 'wearable' ? [params.get('sex') === 'female' ? femaleShirt : shirt] : [hero])
      list = list.filter(item => (!params.get('department') || item.department === params.get('department')) && (!params.get('sex') || item.sex === params.get('sex') || item.sex === 'common') && (!params.get('slot') || item.slot === params.get('slot')) && (!params.get('group') || item.group === params.get('group')) && (!params.get('subgroup') || item.subgroup === params.get('subgroup')) && (!params.get('q') || item.name.includes(params.get('q'))) && (params.get('preview_only') !== 'true' || !!item.preview_available && !!item.model) && (params.get('paired_only') !== 'true' || !!item.counterpart_id))
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

test('shop data is never requested before a real admin session is confirmed', async ({ page }) => {
  const requests = await setup(page, { admin: false })
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: '관리자 전용 상점입니다.' })).toBeVisible()
  expect(requests).toEqual([])
})

test('functional item links restore selected item and price without adding it to the outfit', async ({ page }) => {
  await setup(page)
  await page.goto(`/shop?item=1000208&v=${version}&price=P7`)
  await expect(page.locator('.shop-detail h3')).toHaveText(hero.name)
  await expect(page.locator('.shop-detail-price')).toContainText('2,000')
  await expect(page.locator('.shop-slot')).toHaveCount(0)
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('.shop-card').getByText('기능성', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '이 아이템 URL 복사' }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(copied.origin).toBe('https://r2archive.com')
  expect(copied.searchParams.get('item')).toBe('1000208')
  expect(copied.searchParams.get('price')).toBe('P7')
})

test('the shop first asks for gender and can preview the default outfit without selecting items', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/shop')
  await expect(page.locator('.shop-list-status')).toContainText('성별을 먼저 선택해주세요.')
  expect(requests).not.toContain('/api/shop/items')
  await expect(page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('.shop-slots')).toContainText('기본 머리 착용')
  await expect(page.locator('.shop-slots')).toContainText('기본 상의 착용')
  await expect(page.locator('.shop-slots')).toContainText('기본 하의 착용')
  await expect(page.locator('.shop-slots')).toContainText('기본 신발 착용')
  await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  await expect(page.locator('.shop-stage canvas')).toBeVisible()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
})

test('full outfit links restore camera, gender, both characters and default unselected slots', async ({ page }) => {
  await setup(page)
  await page.goto(`/shop?view=preview&v=${version}&sex=male&top=200&pair=1&angle=237&zoom=119`)
  await expect(page.locator('.shop-stage canvas')).toBeVisible()
  await expect(page.getByLabel('캐릭터 회전')).toHaveValue('237')
  await expect(page.getByLabel('캐릭터 확대')).toHaveValue('119')
  await expect(page.getByRole('button', { name: '이성 아이템 함께 보기' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.shop-character-labels span')).toHaveCount(2)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText('기본 머리 착용')
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await page.getByRole('button', { name: '의상 URL 복사' }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(copied.searchParams.get('top')).toBe('200')
  expect(copied.searchParams.has('hair')).toBe(false)
  expect(copied.searchParams.get('pair')).toBe('1')
  expect(copied.searchParams.get('angle')).toBe('237')
  expect(copied.searchParams.get('zoom')).toBe('119')
})

test('pending catalog and search responses never move the item toolbar or grid', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let releaseMeta, releaseList
  const metaGate = new Promise(resolve => { releaseMeta = resolve })
  const listGate = new Promise(resolve => { releaseList = resolve })
  await setup(page, { metaGate, listGate })
  await page.goto('/shop')
  await expect(page.locator('.shop-grid')).toBeVisible()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  const watcher = await watchLayout(page, ['.shop-search', '.shop-grid', '.shop-pair-filter'])
  releaseMeta()
  await expect(page.locator('.shop-list-status')).toContainText('아이템을 불러오는 중입니다.')
  await watcher.expectStable()
  releaseList()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable()
  await page.getByLabel('아이템 이름으로 검색').fill('검증')
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable()
  await watcher.stop()
})

test('a narrow preview frames both characters and their pet without clipping the edges', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await setup(page)
  await page.goto(`/shop?view=preview&v=${version}&sex=male&pet=300&pair=1&angle=180&zoom=100`)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  const pixels = await page.locator('.shop-stage canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl'), data = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
    let left = canvas.width, right = -1, count = 0
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3]) { left = Math.min(left, x); right = Math.max(right, x); count++ }
    return { left, right, width: canvas.width, count }
  })
  expect(pixels.count).toBeGreaterThan(2000)
  expect(pixels.left).toBeGreaterThan(4)
  expect(pixels.right).toBeLessThan(pixels.width - 5)
})

test('switching gender cannot select a stale card while the new list is pending', async ({ page }) => {
  await setup(page)
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (new URL(route.request().url()).searchParams.get('sex') !== 'female') return route.fallback()
    await gate
    return route.fulfill({ json: { version, items: [femaleShirt], total: 1, page: 1, page_size: 12 } })
  })
  await page.goto(`/shop?item=200&v=${version}`)
  await expect(page.locator('.shop-card')).toContainText(shirt.name)
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(0)
  await expect(page.locator('.shop-slots')).not.toContainText(shirt.name)
  release()
  await expect(page.locator('.shop-card')).toContainText(femaleShirt.name)
  await page.getByRole('button', { name: `${femaleShirt.name} 의상 선택` }).click()
  await expect(page.locator('.shop-slots')).toContainText(femaleShirt.name)
})

test('structured search errors remain readable and the search field is bounded', async ({ page }) => {
  await setup(page)
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (!new URL(route.request().url()).searchParams.get('q')) return route.fallback()
    return route.fulfill({ status: 422, json: { detail: [{ type: 'string_too_long', msg: 'invalid query' }] } })
  })
  await page.goto('/shop')
  await page.getByRole('tab', { name: '기능성·소모품', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.getByLabel('아이템 이름으로 검색')).toHaveAttribute('maxlength', '120')
  await page.getByLabel('아이템 이름으로 검색').fill('실패 검증')
  await expect(page.getByRole('alert')).toContainText('검색어나 공유 URL을 확인해주세요.')
  await expect(page.getByRole('heading', { name: '아이템 상점', exact: true })).toBeVisible()
})

test('OAuth return restores the shared shop URL rather than dropping the selected item', async ({ page }) => {
  await setup(page)
  const url = `/shop?item=1000208&v=${version}&price=P7`
  await page.addInitScript(value => sessionStorage.setItem('r2_shop_return', JSON.stringify({ url: value, at: Date.now() })), url)
  await page.goto('/?auth=ok')
  await expect(page).toHaveURL(new RegExp('/shop\\?item=1000208'))
  await expect(page.locator('.shop-detail h3')).toHaveText(hero.name)
  await expect(page.locator('.shop-detail-price')).toContainText('2,000')
})

test('clipboard failure and recovery keep the catalog geometry stable', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  await setup(page)
  await page.goto(`/shop?item=1000208&v=${version}&price=P7`)
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).scrollIntoViewIfNeeded()
  const watcher = await watchLayout(page, ['.shop-search', '.shop-grid', '.shop-pair-filter'])
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('Clipboard denied') } } }))
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).click()
  await expect(page.getByLabel('공유 URL')).toHaveValue(/item=1000208/)
  await watcher.expectStable()
  await page.getByRole('button', { name: 'URL 직접 복사 닫기' }).click()
  await watcher.expectStable()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }))
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).click()
  await expect(page.getByLabel('공유 URL')).toHaveCount(0)
  await watcher.expectStable()
  await watcher.stop()
})

test('copy confirmation is a small toast that closes without moving the catalog', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  await setup(page)
  await page.goto(`/shop?item=1000208&v=${version}`)
  await expect(page.locator('.shop-card')).toHaveCount(1)
  const copy = page.getByRole('button', { name: '이 아이템 URL 복사', exact: true })
  await copy.scrollIntoViewIfNeeded()
  const watcher = await watchLayout(page, ['.shop-search', '.shop-pair-filter', '.shop-grid'])
  await copy.click()
  await expect(page.locator('.shop-toast')).toHaveText('URL을 복사했습니다')
  await watcher.expectStable()
  await expect(page.locator('.shop-toast')).toHaveCount(0, { timeout: 4000 })
  await watcher.expectStable()
  await expect(page.locator('.shop-feedback')).not.toContainText('URL을 복사했습니다')
  await watcher.stop()
})

test('infinite loading keeps the DOM bounded, caches images and preserves selected clothing', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const catalog = Array.from({ length: 240 }, (_, i) => ({ ...shirt, id: String(2000 + i), name: `검증 의상 ${String(i).padStart(3, '0')}`, thumbnail: `${root}/thumbnails/${hash}.webp` }))
  await setup(page, { items: catalog, nextGate: gate })
  let imageRequests = 0
  page.on('request', request => { if (request.url().includes('/thumbnails/')) imageRequests++ })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '24')
  await page.getByRole('button', { name: `${catalog[0].name} 의상 선택` }).click()
  await expect(page.locator('.shop-slots')).toContainText(catalog[0].name)
  const end = async () => page.locator('.shop-grid').evaluate(grid => window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY + grid.clientHeight - window.innerHeight + 100, behavior: 'instant' }))
  await end()
  await expect(page.locator('.shop-grid')).toHaveAttribute('aria-busy', 'true')
  const last = page.locator('[data-item-id="2023"]')
  await expect(last).toBeAttached()
  const watcher = await watchLayout(page, ['[data-item-id="2023"]', '.shop-search', '.shop-pair-filter'])
  release()
  await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '48')
  await watcher.expectStable()
  await watcher.stop()
  for (const count of [72, 96, 120, 144]) { await end(); await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', String(count)) }
  expect(await page.locator('.shop-card').count()).toBeLessThan(40)
  await expect(page.locator('[data-item-id="2000"]')).toHaveCount(0)
  await expect(page.locator('.shop-slots')).toContainText(catalog[0].name)
  await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  expect(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams.get('top')).toBe('2000')
  await page.getByRole('button', { name: '아이템 다시 고르기' }).click()
  await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '144')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(page.locator('[data-item-id="2000"]')).toBeAttached()
  expect(imageRequests).toBe(1)
})

test('matching-gender filter affects the catalog while preserving the selected clothing', async ({ page }) => {
  const unpaired = { ...shirt, id: '202', name: '한쪽 전용 셔츠', counterpart_id: null }
  await setup(page, { items: [shirt, unpaired] })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await page.getByRole('button', { name: `${unpaired.name} 의상 선택` }).click()
  await page.getByRole('checkbox', { name: '남녀 모두 존재하는 의상만' }).check()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('.shop-card')).toContainText(shirt.name)
  await expect(page.locator('.shop-slots')).toContainText(unpaired.name)
})

test('face selection is combined with hair and restored by the shared outfit URL', async ({ page }) => {
  const hair = { ...shirt, id: '401', name: '검증 머리', slot: 'hair', counterpart_id: null }
  const face = { ...shirt, id: '402', name: '검증 성형', slot: 'face', counterpart_id: null }
  await setup(page, { items: [hair, face] })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await page.getByRole('button', { name: `${hair.name} 의상 선택` }).click()
  await page.getByRole('button', { name: '성형', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: `${face.name} 의상 선택` }).click()
  await expect(page.locator('.shop-slots')).toContainText(hair.name)
  await expect(page.locator('.shop-slots')).toContainText(face.name)
  await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const url = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(url.searchParams.get('hair')).toBe(hair.id)
  expect(url.searchParams.get('face')).toBe(face.id)
  await page.goto(url.pathname + url.search)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(hair.name)
  await expect(page.locator('.shop-slots')).toContainText(face.name)
})

test('unavailable previews are tagged over images before selection and non-cash prices use R-coins', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const unavailable = { ...shirt, id: '403', name: '성인 성형', slot: 'face', preview_available: false, model: null, thumbnail: `${root}/thumbnails/${hash}.webp`, prices: [{ key: 'PI', label: '무기한', amount: 400, currency: 'coin' }] }
  const unknown = { ...unavailable, id: '404', name: '가격 단위 검증', prices: [{ key: 'PI', label: '무기한', amount: 800, currency: 'unknown' }] }
  await setup(page, { items: [shirt, unavailable, unknown] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/thumbnails/**', async route => { await gate; return route.fulfill({ body: png, contentType: 'image/png' }) })
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '미리보기 불가능 아이템 가리기', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(3)
  const card = page.locator('[data-item-id="403"]'), tag = card.locator('.shop-preview-unavailable')
  await expect(tag).toHaveText('미리보기 불가능')
  await expect(tag).toHaveCSS('background-color', 'rgb(179, 39, 63)')
  await expect(page.locator('[data-item-id="200"] .shop-preview-unavailable')).toHaveCount(0)
  await expect(card.locator('.shop-card-price')).toContainText('400 알코인')
  await expect(page.locator('[data-item-id="404"] .shop-card-price')).toContainText('800 알코인')
  await expect(page.locator('[data-item-id="200"] .shop-card-price')).toContainText('캐시')
  const inside = await tag.evaluate(node => {
    const tag = node.getBoundingClientRect(), image = node.parentElement.getBoundingClientRect()
    return tag.top >= image.top && tag.bottom <= image.bottom && tag.left >= image.left && tag.right <= image.right
  })
  expect(inside).toBe(true)
  const watcher = await watchLayout(page, ['.shop-search', '.shop-grid', '.shop-pair-filter', '[data-item-id="403"] .shop-card-image', '[data-item-id="403"] .shop-preview-unavailable'])
  await watcher.expectStable()
  release()
  await expect(card.locator('img')).toBeVisible()
  await watcher.expectStable()
  await page.getByRole('button', { name: `${shirt.name} 의상 선택`, exact: true }).click()
  await card.getByRole('button', { name: `${unavailable.name} 자세히 보기`, exact: true }).click()
  await expect(page.locator('.shop-detail-price')).toContainText('400 알코인')
  await expect(page.locator('.shop-detail-image .shop-preview-unavailable')).toHaveText('미리보기 불가능')
  await expect(page.locator('.shop-toast')).toHaveCount(0)
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await expect(page.locator('.shop-slots')).not.toContainText(unavailable.name)
  await watcher.expectStable()
  await watcher.stop()
  await page.getByRole('button', { name: `${unknown.name} 자세히 보기`, exact: true }).click()
  await expect(page.locator('.shop-detail-price')).toContainText('800 알코인')
  await expect(page.locator('.shop-app')).not.toContainText('표기가격')
})

test('category filters isolate matching ring names, pet kinds and supplies without losing clothing or shifting pending lists', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const couple = { ...hero, id: '900', name: '자수정 나비링', category: '507', group: 'couple' }
  const friend = { ...couple, id: '901', category: '508', group: 'friend' }
  const regular = { ...pet, subgroup: 'pet_regular' }, growth = { ...pet, id: '902', name: '드래곤', subgroup: 'pet_growth' }
  const food = { ...hero, id: '903', name: '펫 푸드', group: 'pet_supplies', subgroup: 'pet_food' }
  await setup(page, { items: [shirt, couple, friend, regular, growth, food] })
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: `${shirt.name} 의상 선택`, exact: true }).click()
  await page.getByRole('button', { name: '펫', exact: true }).click()
  await page.getByRole('button', { name: '일반 펫', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: `${regular.name} 의상 선택`, exact: true }).click()
  await page.getByRole('button', { name: '성장 펫', exact: true }).click()
  await expect(page.locator('.shop-card')).toContainText(growth.name)
  await expect(page.locator('.shop-slots')).toContainText(regular.name)
  let releaseCouple, releaseFriend
  const coupleGate = new Promise(resolve => { releaseCouple = resolve }), friendGate = new Promise(resolve => { releaseFriend = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    const group = new URL(route.request().url()).searchParams.get('group')
    if (!['couple', 'friend'].includes(group)) return route.fallback()
    await (group === 'couple' ? coupleGate : friendGate)
    return route.fallback()
  })
  await page.getByRole('tab', { name: '기능성·소모품', exact: true }).click()
  await page.getByRole('button', { name: '커플링', exact: true }).click()
  await page.getByRole('button', { name: '단짝링', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(0)
  const watcher = await watchLayout(page, ['.shop-filters', '.shop-search', '.shop-grid'])
  await watcher.expectStable()
  releaseCouple()
  await watcher.expectStable()
  await expect(page.locator('.shop-card')).toHaveCount(0)
  releaseFriend()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('[data-item-id="901"]')).toBeAttached()
  await expect(page.locator('[data-item-id="900"]')).toHaveCount(0)
  await watcher.expectStable()
  await watcher.stop()
  await page.locator('[data-item-id="901"] .shop-card-select').click()
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).click()
  const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
  await page.getByRole('button', { name: '펫 용품', exact: true }).click()
  await page.getByRole('button', { name: '펫 먹이', exact: true }).click()
  await expect(page.locator('.shop-card')).toContainText(food.name)
  await page.getByRole('tab', { name: '꾸미기·펫', exact: true }).click()
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await expect(page.locator('.shop-slots')).toContainText(regular.name)
  await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const outfit = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(outfit.searchParams.get('top')).toBe(shirt.id)
  expect(outfit.searchParams.get('pet')).toBe(regular.id)
  await page.goto(shared.pathname + shared.search)
  await expect(page.getByRole('tab', { name: '기능성·소모품', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '단짝링', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-item-id="901"]')).toBeAttached()
  await expect(page.locator('[data-item-id="900"]')).toHaveCount(0)
})

test('unavailable items are hidden by default and the toggle keeps selection and pending list geometry stable', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const unavailable = { ...shirt, id: '700', name: '미지원 장식', slot: 'accessory', preview_available: false, model: null }
  await setup(page, { items: [shirt, unavailable] })
  await page.goto('/shop?sex=male')
  const toggle = page.getByRole('button', { name: '미리보기 불가능 아이템 가리기', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: `${shirt.name} 의상 선택`, exact: true }).click()
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (new URL(route.request().url()).searchParams.get('preview_only') !== 'false') return route.fallback()
    await gate; return route.fallback()
  })
  await toggle.scrollIntoViewIfNeeded()
  const watcher = await watchLayout(page, ['.shop-search', '.shop-filters', '.shop-pair-filter', '.shop-grid'])
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.shop-list-status')).toContainText('불러오는 중')
  await watcher.expectStable()
  release()
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await expect(page.locator('[data-item-id="700"] .shop-preview-unavailable')).toHaveText('미리보기 불가능')
  await watcher.expectStable()
  await toggle.click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable(); await watcher.stop()
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await page.goto(`/shop?item=700&v=${version}`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-item-id="700"]')).toBeVisible()
  await expect(page.locator('.shop-detail h3')).toHaveText(unavailable.name)
})

test('all eight outfit slots and common wings restore in both characters with unclipped pets', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const accessory = { ...shirt, id: '510', name: '검증 장식(남)', slot: 'accessory', model: `${root}/models/${'1'.repeat(64)}.json.gz`, counterpart_id: '511' }
  const otherAccessory = { ...accessory, id: '511', name: '검증 장식(여)', sex: 'female', counterpart_id: '510' }
  const summon = { ...pet, id: '520', name: '공용 날개', slot: 'summon', model: `${root}/models/${'2'.repeat(64)}.json.gz` }
  const extras = [['hair', '530'], ['face', '531'], ['bottom', '532'], ['shoes', '533']].map(([slot, id]) => ({ ...shirt, id, name: `검증 ${slot}`, slot, counterpart_id: null }))
  const texture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAABCAIAAAByq0inAAAAE0lEQVR4nGP4z8DAAMb//0OI/wBHywj4QWpCgAAAAABJRU5ErkJggg==', 'base64')
  const rectangle = (name, left, right, bottom, top, z, color) => ({ meshes: [{ name, vertices: [[left, bottom], [right, bottom], [right, top], [left, top]].flatMap(([x, y]) => [x, y, z, 0, 0, -1, (color + .5) / 6, .5]), indices: [0, 1, 2, 0, 2, 3], texture: `${hash}.webp` }] })
  await setup(page, { items: [shirt, femaleShirt, pet, accessory, otherAccessory, summon, ...extras], texture, models: {
    [`${root}/models/${'d'.repeat(64)}.json.gz`]: directionModel(), [`${root}/models/${'e'.repeat(64)}.json.gz`]: directionModel(),
    [shirt.model]: directionModel(), [accessory.model]: rectangle('Accessory-prop', 28, 48, 80, 135, -20, 2),
    [summon.model]: rectangle('Summon-wings', -140, 140, 40, 220, 25, 4),
  } })
  const values = { top: shirt.id, pet: pet.id, accessory: accessory.id, summon: summon.id, ...Object.fromEntries(extras.map(item => [item.slot, item.id])) }
  const params = new URLSearchParams({ view: 'preview', v: version, sex: 'male', pair: '1', angle: '180', zoom: '100', ...values })
  await page.goto('/shop?' + params)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  const canvas = page.locator('.shop-stage canvas')
  const pixels = await directionPixels(canvas)
  expect(pixels.groups).toHaveLength(3)
  for (const group of pixels.groups.slice(0, 2)) for (const color of [1, 2, 4, 6]) expect(group.colors[color]?.count || 0).toBeGreaterThan(10)
  expect(pixels.left).toBeGreaterThan(4); expect(pixels.right).toBeLessThan(pixels.width - 5)
  expect(pixels.bottom).toBeGreaterThan(4); expect(pixels.top).toBeLessThan(pixels.height - 5)
  const image = await canvas.evaluate(canvas => canvas.toDataURL())
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
  for (const [key, value] of Object.entries(values)) expect(shared.searchParams.get(key)).toBe(value)
  await page.goto(shared.pathname + shared.search)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  expect(await canvas.evaluate(canvas => canvas.toDataURL())).toBe(image)
  await expect(page.locator('.shop-slots')).toContainText(accessory.name)
  await expect(page.locator('.shop-slots')).toContainText(summon.name)
})

function directionModel(centerX = 0, bottom = 20, height = 260, width = 24) {
  const vertices = [], indices = []
  function quad(points, normal, color) {
    const start = vertices.length / 8
    for (const point of points) vertices.push(...point, ...normal, (color + .5) / 6, .5)
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }
  const left = centerX - width, right = centerX + width, tall = bottom + height, short = bottom + height * .8
  // 정면의 왼쪽 형상은 더 높다. UV만 뒤집는 수정으로는 이 기준을 통과할 수 없다.
  for (const [z, normal, colors] of [[-12, [0, 0, -1], [0, 1]], [12, [0, 0, 1], [2, 3]]]) {
    quad([[left, bottom, z], [centerX, bottom, z], [centerX, tall, z], [left, tall, z]], normal, colors[0])
    quad([[centerX, bottom, z], [right, bottom, z], [right, short, z], [centerX, short, z]], normal, colors[1])
  }
  quad([[left, bottom, -12], [left, bottom, 12], [left, tall, 12], [left, tall, -12]], [-1, 0, 0], 4)
  quad([[right, bottom, -12], [right, bottom, 12], [right, short, 12], [right, short, -12]], [1, 0, 0], 5)
  return { meshes: [{ name: 'Waist', vertices, indices, texture: `${hash}.webp` }] }
}

async function directionPixels(canvas) {
  return canvas.evaluate(canvas => {
    const gl = canvas.getContext('webgl'), data = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
    const columns = new Set(), totals = {}, samples = []
    let left = canvas.width, right = -1, bottom = canvas.height, top = -1
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i + 3] < 200) continue
      const color = (data[i] > 100 ? 1 : 0) + (data[i + 1] > 100 ? 2 : 0) + (data[i + 2] > 100 ? 4 : 0)
      columns.add(x); totals[color] = (totals[color] || 0) + 1; samples.push({ x, y, color })
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.min(bottom, y); top = Math.max(top, y)
    }
    const groups = []
    for (const x of [...columns].sort((a, b) => a - b)) {
      if (!groups.length || x > groups.at(-1).right + 1) groups.push({ left: x, right: x, colors: {} })
      else groups.at(-1).right = x
    }
    for (const { x, y, color } of samples) {
      const group = groups.find(group => x >= group.left && x <= group.right)
      const stats = group.colors[color] ||= { count: 0, x: 0, top: -1 }
      stats.count++; stats.x += x; stats.top = Math.max(stats.top, y)
    }
    for (const group of groups) for (const stats of Object.values(group.colors)) stats.x /= stats.count
    return { groups, totals, left, right, bottom, top, width: canvas.width, height: canvas.height }
  })
}

for (const sex of ['male', 'female']) test(`MD9 ${sex} and opposite gender with a pet keep game orientation and shared selection`, async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const female = { ...femaleShirt, counterpart_id: shirt.id, model: `${root}/models/${'f'.repeat(64)}.json.gz` }
  const models = {
    [`${root}/models/${'d'.repeat(64)}.json.gz`]: directionModel(),
    [`${root}/models/${'e'.repeat(64)}.json.gz`]: directionModel(0, 20, 240, 20),
    [shirt.model]: directionModel(), [female.model]: directionModel(0, 20, 240, 20),
    [pet.model]: directionModel(-80, 30, 110, 18),
  }
  let release
  const modelGate = new Promise(resolve => { release = resolve })
  const texture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAABCAIAAAByq0inAAAAE0lEQVR4nGP4z8DAAMb//0OI/wBHywj4QWpCgAAAAABJRU5ErkJggg==', 'base64')
  await setup(page, { items: [shirt, female, pet], models, texture, modelGate })
  await page.goto(`/shop?sex=${sex}`)
  const selected = sex === 'male' ? shirt : female
  await page.getByRole('button', { name: `${selected.name} 의상 선택`, exact: true }).click()
  await page.getByRole('button', { name: `${pet.name} 의상 선택`, exact: true }).click()
  await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  await page.getByRole('button', { name: '이성 아이템 함께 보기', exact: true }).click()
  await expect(page.locator('.shop-character-labels span')).toHaveCount(2)
  await expect(page.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const watcher = await watchLayout(page, ['.shop-stage', '.shop-view-controls', '.shop-preview-toolbar'])
  await watcher.expectStable()
  release()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await watcher.expectStable()
  await watcher.stop()
  const canvas = page.locator('.shop-stage canvas')
  const front = await directionPixels(canvas)
  expect(front.groups).toHaveLength(3)
  for (const group of front.groups) {
    expect(group.colors[1].x).toBeLessThan(group.colors[2].x)
    expect(group.colors[1].top).toBeGreaterThan(group.colors[2].top + 5)
  }
  expect(front.groups[2].colors[1].top).toBeLessThan(Math.min(front.groups[0].colors[1].top, front.groups[1].colors[1].top))
  if (sex === 'male') expect(front.groups[0].colors[1].top).toBeGreaterThan(front.groups[1].colors[1].top)
  else expect(front.groups[0].colors[1].top).toBeLessThan(front.groups[1].colors[1].top)
  const labels = await page.locator('.shop-character-labels span').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().x + node.getBoundingClientRect().width / 2))
  expect(labels[0]).toBeLessThan(labels[1])
  const sideColors = { 0: [3, 4], 90: [6], 270: [5, 6] }
  for (const [angle, colors] of Object.entries(sideColors)) {
    await page.getByLabel('캐릭터 회전').fill(angle)
    await expect.poll(async () => {
      const { totals } = await directionPixels(canvas)
      const total = Object.values(totals).reduce((sum, count) => sum + count, 0)
      return colors.every(color => totals[color] > 50) && colors.reduce((sum, color) => sum + (totals[color] || 0), 0) > total * .95
    }).toBe(true)
    const pixels = await directionPixels(canvas)
    expect(pixels.left).toBeGreaterThan(4); expect(pixels.right).toBeLessThan(pixels.width - 5)
    expect(pixels.bottom).toBeGreaterThan(4); expect(pixels.top).toBeLessThan(pixels.height - 5)
    if (angle === '0') for (const group of pixels.groups) expect(group.colors[3].x).toBeLessThan(group.colors[4].x)
    if (angle === '270') expect(pixels.totals[5]).toBeGreaterThan(pixels.totals[6] * 2)
  }
  await page.getByLabel('캐릭터 회전').fill('237')
  await page.getByLabel('캐릭터 확대').fill('119')
  const image = await canvas.evaluate(canvas => canvas.toDataURL())
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  for (const [key, value] of Object.entries({ sex, top: selected.id, pet: pet.id, pair: '1', angle: '237', zoom: '119', v: version })) expect(copied.searchParams.get(key)).toBe(value)
  await page.goto(copied.pathname + copied.search)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(selected.name)
  await expect(page.locator('.shop-slots')).toContainText(pet.name)
  expect(await canvas.evaluate(canvas => canvas.toDataURL())).toBe(image)
})
