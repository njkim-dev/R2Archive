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

async function setup(page, { admin = true, loggedIn = true, metaGate, listGate } = {}) {
  const requests = []
  await page.addInitScript(() => { window.__copiedShopUrl = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }) })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.startsWith('/api/shop/')) requests.push(path)
    if (path === '/api/auth/me') return route.fulfill({ json: { user: loggedIn ? { id: 1, provider: 'google', nickname: '관리자', onboarded: true } : null } })
    if (path === '/api/auth/admin-status') return route.fulfill({ json: { is_admin: admin } })
    if (path === '/api/shop/meta') { if (metaGate) await metaGate; return route.fulfill({ json: { revision: version, bases: { male: `${root}/models/${'d'.repeat(64)}.json.gz`, female: `${root}/models/${'e'.repeat(64)}.json.gz` }, counts: { wearable: 2, functional: 1, other: 0 }, admin_only: true } }) }
    if (path === '/api/shop/items') { if (listGate) await listGate; return route.fulfill({ json: { version, items: url.searchParams.get('department') === 'wearable' ? [shirt] : [hero], total: 1, page: 1, page_size: 12 } }) }
    if (path.startsWith('/api/shop/items/')) return route.fulfill({ json: path.endsWith('/201') ? femaleShirt : path.endsWith('/200') ? shirt : path.endsWith('/300') ? pet : hero })
    if (path.includes('/models/')) return route.fulfill({ json: path.includes('c'.repeat(64)) ? petMesh : mesh })
    if (path.includes('/textures/')) return route.fulfill({ body: png, contentType: 'image/png' })
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
  await page.getByRole('button', { name: '착장 URL 복사' }).click()
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
  const watcher = await watchLayout(page, ['.shop-search', '.shop-grid', '.shop-pagination'])
  releaseMeta()
  await expect(page.locator('.shop-list-status')).toContainText('아이템을 불러오는 중입니다.')
  await watcher.expectStable()
  releaseList()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable()
  await page.getByLabel('아이템 이름으로 검색').fill('돌발')
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
  await page.getByRole('button', { name: `${femaleShirt.name} 착장 선택` }).click()
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
  const watcher = await watchLayout(page, ['.shop-search', '.shop-grid', '.shop-pagination'])
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('Clipboard denied') } } }))
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).click()
  await expect(page.getByLabel('공유 URL')).toHaveValue(/item=1000208/)
  await watcher.expectStable()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }))
  await page.getByRole('button', { name: '이 아이템 URL 복사', exact: true }).click()
  await expect(page.getByLabel('공유 URL')).toHaveCount(0)
  await watcher.expectStable()
  await watcher.stop()
})
