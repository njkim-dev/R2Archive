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

async function setup(page, { admin = true, loggedIn = true, metaGate, listGate, items, nextGate, models, texture = png, modelGate, textureRevision, favoriteIds = [], favoriteGate, authGate } = {}) {
  const requests = []
  const savedFavorites = new Set(favoriteIds.map(String))
  await page.addInitScript(() => { window.__copiedShopUrl = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedShopUrl = value } } }) })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.startsWith('/api/shop/')) requests.push(path)
    if (path === '/api/auth/me') { if (authGate) await authGate; return route.fulfill({ json: { user: loggedIn ? { id: 1, provider: 'google', nickname: '관리자', onboarded: true } : null } }) }
    if (path === '/api/auth/admin-status') return route.fulfill({ json: { is_admin: admin } })
    if (path === '/api/shop/favorites' && route.request().method() === 'DELETE') { const slot = url.searchParams.get('slot'), removed = [...savedFavorites].filter(id => !slot || (items || [shirt,femaleShirt,pet,hero]).some(item => item.id === id && item.slot === slot)); removed.forEach(id => savedFavorites.delete(id)); return route.fulfill({ json: { removed_ids: removed, count: removed.length } }) }
    if (path === '/api/shop/favorites') { if (favoriteGate) await favoriteGate; return route.fulfill({ json: { ids: [...savedFavorites] } }) }
    if (path.startsWith('/api/shop/favorites/')) { const id = path.split('/').at(-1); if (route.request().method() === 'POST') savedFavorites.add(id); else savedFavorites.delete(id); return route.fulfill({ json: { id, favorite: savedFavorites.has(id) } }) }
    if (path === '/api/shop/meta') { if (metaGate) await metaGate; return route.fulfill({ json: { revision: version, texture_revision: textureRevision, bases: { male: `${root}/models/${'d'.repeat(64)}.json.gz`, female: `${root}/models/${'e'.repeat(64)}.json.gz` }, counts: { wearable: 2, functional: 1, other: 0 }, admin_only: false } }) }
    if (path === '/api/shop/items') {
      if (listGate) await listGate
      const params = url.searchParams, position = params.get('cursor') || ''
      const start = position ? Number(position.split(':')[0]) + 1 : 0, size = Number(params.get('page_size') || 24)
      if (start && nextGate) await nextGate
      let list = items || (params.get('department') === 'wearable' ? [params.get('sex') === 'female' ? femaleShirt : shirt] : [hero])
      list = list.filter(item => (!params.get('department') || item.department === params.get('department')) && (!params.get('sex') || item.sex === params.get('sex') || item.sex === 'common') && (!params.get('slot') || item.slot === params.get('slot')) && (!params.get('group') || item.group === params.get('group')) && (!params.get('subgroup') || item.subgroup === params.get('subgroup')) && (!params.get('q') || item.name.includes(params.get('q'))) && (params.get('favorites_only') !== 'true' || savedFavorites.has(item.id)) && (params.get('preview_only') !== 'true' || !!item.preview_available && !!item.model) && (params.get('paired_only') !== 'true' || !!item.counterpart_id || item.slot === 'pet' && item.sex === 'common'))
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

async function setViewerAngle(page, target) {
  const canvas = page.locator('.shop-stage canvas')
  let angle = Number(await canvas.getAttribute('data-view-angle'))
  let delta = ((target - angle + 540) % 360) - 180
  const box = await canvas.boundingBox(), maximum = Math.min(60, box.width / 4)
  while (Math.abs(delta) > .01) {
    const dx = Math.sign(delta) * Math.min(Math.abs(delta) * 2, maximum)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2); await page.mouse.up()
    const next = (angle + dx * .5 + 360) % 360
    await expect.poll(async () => Number(await canvas.getAttribute('data-view-angle'))).toBeCloseTo(next, 2)
    angle = next; delta = ((target - angle + 540) % 360) - 180
  }
}
async function setViewerZoom(page, target) {
  const canvas = page.locator('.shop-stage canvas'), before = Number(await canvas.getAttribute('data-view-zoom'))
  await canvas.hover(); await page.mouse.wheel(0, -Math.log(target / before) / .0015)
  await expect.poll(async () => Number(await canvas.getAttribute('data-view-zoom'))).toBeCloseTo(target, 2)
}

async function openOutfitPanel(page) {
  if (!await page.evaluate(() => matchMedia('(max-width:800px)').matches)) return
  const panel = page.getByRole('dialog', { name: '아이템 현황', exact: true })
  if (!await panel.isVisible()) await page.getByRole('button', { name: '아이템 현황', exact: true }).click()
  const outfit = panel.getByRole('tab', { name: '선택한 의상', exact: true })
  if (await outfit.count()) await outfit.click()
}

async function closeMobilePanel(page) {
  const panel = page.getByRole('dialog', { name: '아이템 현황', exact: true })
  if (await panel.isVisible()) await panel.getByRole('button', { name: '아이템 현황 닫기', exact: true }).click()
}

async function previewSelection(page) {
  const panel = page.getByRole('dialog', { name: '아이템 현황', exact: true })
  if (await panel.isVisible()) {
    await openOutfitPanel(page)
    await panel.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
  } else await page.getByRole('button', { name: '선택한 아이템으로 미리보기', exact: true }).click()
}

test('browser back restores the loaded catalog filters selection and scroll and forward restores preview', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const items = Array.from({ length: 120 }, (_, i) => ({ ...shirt, id: String(2000 + i), name: `검증 의상 ${i}` }))
  await setup(page, { items, nextGate: gate })
  await page.route('**/previous-page', route => route.fulfill({ contentType: 'text/html', body: '<p>Previous page</p>' }))
  await page.goto('/previous-page'); await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '상의', exact: true }).click()
  await page.getByRole('button', { name: items[0].name + ' 의상 선택', exact: true }).click()
  await page.locator('.shop-grid').evaluate(node => scrollTo(0, node.getBoundingClientRect().top + scrollY + node.offsetHeight - innerHeight + 200))
  await expect(page.locator('.shop-list-status')).toContainText('더 불러오는 중')
  const y = await page.evaluate(() => scrollY)
  await openOutfitPanel(page); await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.goBack()
  await expect(page.locator('.shop-search')).toBeAttached()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0)
  await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '24')
  await expect(page.getByRole('button', { name: '상의', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.shop-slots')).toContainText(items[0].name)
  const watcher = await watchLayout(page, ['.shop-header', '.shop-search', '.shop-pair-filter'])
  release(); await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '48')
  await watcher.expectStable(); await watcher.stop()
  await page.goForward(); await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(items[0].name)
  await page.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
  await expect(page.locator('.shop-grid')).toHaveAttribute('data-loaded-count', '48')
  await page.goBack(); await expect(page).toHaveURL(/\/previous-page$/)
})

test('item status and top controls preserve catalog geometry and mobile header stays available during long scrolls', async ({ page }) => {
  const mobile = test.info().project.use.viewport.width <= 768
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1000 })
  await setup(page, { items: Array.from({ length: 100 }, (_, i) => ({ ...shirt, id: String(2000 + i), name: `의상 ${i}` })) })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-card').first()).toBeVisible()
  await page.evaluate(() => scrollTo(0, 1600))
  if (mobile) {
    await expect.poll(async () => (await page.locator('.shop-header').boundingBox()).y).toBe(0)
    const status = await page.getByRole('button', { name: '아이템 현황', exact: true }).boundingBox()
    const logout = await page.getByRole('button', { name: '로그아웃', exact: true }).boundingBox()
    expect(status.x + status.width).toBeLessThanOrEqual(logout.x)
    const watcher = await watchLayout(page, ['.shop-header', '.shop-search', '.shop-pair-filter'])
    await openOutfitPanel(page)
    const panel = page.getByRole('dialog', { name: '아이템 현황', exact: true })
    await expect(panel.getByRole('heading', { name: '선택한 의상', exact: true })).toBeVisible()
    await watcher.expectStable(); await closeMobilePanel(page); await watcher.expectStable(); await watcher.stop()
    await expect(page.locator('.shop-floating-top')).toBeVisible()
    await page.locator('.shop-floating-top').click(); await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await page.evaluate(() => scrollTo(0, 1600)); await openOutfitPanel(page)
    await panel.getByRole('button', { name: '페이지 맨 위로 이동', exact: true }).click()
    await expect(panel).not.toBeVisible()
  } else {
    await expect(page.getByRole('button', { name: '아이템 현황', exact: true })).not.toBeVisible()
    await page.locator('.shop-panel').getByRole('button', { name: '페이지 맨 위로 이동', exact: true }).click()
    await expect(page.getByRole('button', { name: '아이템 현황 닫기', exact: true })).toHaveCount(0)
  }
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('shop uses the music aquarium background without shifting content when artwork loads', async ({ page }) => {
  const width = test.info().project.use.viewport.width <= 768 ? 390 : 1440
  await page.setViewportSize({ width, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await setup(page)
  await page.route('**/*r2beat-aquarium*', async route => { await gate; await route.continue() })
  await page.goto('/shop?sex=male', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.shop-card')).toHaveCount(1)
  const image = await page.locator('.archive-backdrop').evaluate(el => getComputedStyle(el).backgroundImage)
  expect(image).toContain(width / 1000 <= 4 / 3 ? 'aquarium-portrait' : 'aquarium-wide')
  await expect(page.locator('.shop-app')).toHaveCSS('background-color', 'rgba(9, 16, 28, 0.87)')
  const watcher = await watchLayout(page, ['.shop-header', '.shop-search', '.shop-grid'])
  await watcher.expectStable(); release(); await page.waitForLoadState('load'); await watcher.expectStable(); await watcher.stop()
})

test('common pets remain visible in the matching gender filter and selection is unchanged', async ({ page }) => {
  const second = { ...pet, id: '301', name: '성장 공용 펫', subgroup: 'pet_growth' }
  await setup(page, { items: [shirt, femaleShirt, pet, second] })
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '펫', exact: true }).click()
  for (const sex of ['남성', '여성']) {
    await page.getByRole('button', { name: sex, exact: true }).click()
    await expect(page.locator('.shop-card')).toHaveCount(2)
    await page.getByRole('button', { name: pet.name + ' 의상 선택', exact: true }).click()
    await page.getByRole('checkbox', { name: '남녀 모두 존재하는 의상만', exact: true }).check()
    await expect(page.locator('.shop-card')).toHaveCount(2)
    await expect(page.locator('.shop-slots')).toContainText(pet.name)
    await page.getByRole('checkbox', { name: '남녀 모두 존재하는 의상만', exact: true }).uncheck()
  }
})

test('the public shop browses and shares outfits anonymously while favorite actions remain disabled', async ({ page }) => {
  const requests = await setup(page, { admin: false, loggedIn: false })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: shirt.name + ' 즐겨찾기 추가', exact: true })).toBeDisabled()
  await expect(page.getByRole('tab', { name: '즐겨찾기', exact: true })).toBeDisabled()
  await expect(page.locator('.shop-app')).not.toContainText('관리자 전용')
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true }).click()
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  const favorites = page.locator('.shop-slot-favorites')
  await expect(favorites).toHaveCount(8)
  for (const button of await favorites.all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  await page.goto(copied.pathname + copied.search)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  expect(requests.some(path => path.startsWith('/api/shop/favorites'))).toBe(false)
})

test('public items load while authentication is pending and favorite readiness never shifts the catalog', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let resolveAuth, resolveFavorites
  const authGate = new Promise(resolve => { resolveAuth = resolve }), favoriteGate = new Promise(resolve => { resolveFavorites = resolve })
  await setup(page, { admin: false, authGate, favoriteGate, favoriteIds: [shirt.id] })
  await page.goto('/shop?sex=male')
  const star = page.getByRole('button', { name: shirt.name + ' 즐겨찾기 추가', exact: true })
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(star).toBeDisabled()
  const watcher = await watchLayout(page, ['.shop-header','.shop-search','.shop-pair-filter','.shop-grid','.shop-panel'])
  resolveAuth()
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeEnabled()
  await expect(star).toBeDisabled(); await watcher.expectStable()
  resolveFavorites()
  const saved = page.getByRole('button', { name: shirt.name + ' 즐겨찾기 해제', exact: true })
  await expect(saved).toBeEnabled(); await expect(saved).toHaveAttribute('aria-pressed','true')
  await watcher.expectStable(); await watcher.stop()
})

test('favorite stars persist for members and failed parallel saves restore only the affected item', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const other = { ...shirt, id:'202', name:'다른 셔츠(남)', counterpart_id:null }
  await setup(page, { admin:false, items:[shirt,other] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/shop/favorites/200*', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    await gate
    return route.fulfill({status:500,json:{detail:'즐겨찾기 저장 실패. 다시 시도해주세요.'}})
  })
  await page.goto('/shop?sex=male')
  const first = page.locator('[data-item-id="200"] .shop-favorite-button'), second = page.locator('[data-item-id="202"] .shop-favorite-button')
  await expect(first).toBeEnabled()
  const watcher = await watchLayout(page, ['.shop-search','.shop-pair-filter','.shop-grid','.shop-panel'])
  await first.click(); await expect(first).toBeDisabled(); await expect(first).toHaveAttribute('aria-pressed','true')
  await second.click(); await expect(second).toBeEnabled(); await expect(second).toHaveAttribute('aria-pressed','true')
  await watcher.expectStable(); release()
  await expect(first).toBeEnabled(); await expect(first).toHaveAttribute('aria-pressed','false')
  await expect(second).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.shop-feedback')).toContainText('즐겨찾기 저장 실패')
  await expect(page.locator('.shop-slots')).not.toContainText(other.name)
  await watcher.expectStable(); await watcher.stop()
  await page.reload()
  await expect(second).toHaveAttribute('aria-pressed','true'); await expect(first).toHaveAttribute('aria-pressed','false')
  await second.click(); await expect(second).toHaveAttribute('aria-pressed','false')
  await page.reload(); await expect(second).toHaveAttribute('aria-pressed','false')
})

test('the favorite picker changes only the requested slot and preserves both characters camera and shared outfit', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const alternate = { ...shirt,id:'202',name:'새로운 셔츠(남)',counterpart_id:'203',model:`${root}/models/${'f'.repeat(64)}.json.gz` }
  const femaleAlternate = { ...alternate,id:'203',name:'새로운 셔츠(여)',sex:'female',counterpart_id:'202' }
  const hair = { ...shirt,id:'204',name:'즐겨찾기 머리',slot:'hair' }
  const unavailable = { ...shirt,id:'205',name:'미지원 상의',preview_available:false,model:null }
  await setup(page, { admin:false, items:[shirt,femaleShirt,pet,alternate,femaleAlternate,hair,unavailable], favoriteIds:['202','203','204','205'], models:{[alternate.model]:directionModel()} })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (new URL(route.request().url()).searchParams.get('favorites_only') === 'true') await gate
    return route.fallback()
  })
  await page.goto(`/shop?view=preview&v=${version}&sex=male&top=200&pet=300&pair=1&angle=237&zoom=119`)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await openOutfitPanel(page)
  const open = page.getByRole('button',{name:'상의 즐겨찾기 열기',exact:true})
  await expect(open).toBeEnabled(); await open.scrollIntoViewIfNeeded()
  const before = await page.locator('canvas').evaluate(canvas=>canvas.toDataURL())
  const watcher = await watchLayout(page,['.shop-stage','.shop-preview-toolbar','.shop-view-controls', ...(page.viewportSize().width > 800 ? ['.shop-panel'] : [])])
  await open.click()
  const dialog = page.getByRole('dialog',{name:'상의 즐겨찾기',exact:true})
  await expect(dialog).toBeVisible(); await expect(dialog.locator('.shop-favorite-status')).toContainText('불러오는 중')
  await watcher.expectStable(); release()
  await expect(dialog.getByRole('button',{name:alternate.name+' 착용',exact:true})).toBeVisible()
  await expect(dialog.locator('.shop-favorite-choose')).toHaveCount(1)
  await expect(dialog).not.toContainText(hair.name); await expect(dialog).not.toContainText(femaleAlternate.name); await expect(dialog).not.toContainText(unavailable.name)
  await watcher.expectStable()
  await dialog.getByRole('button',{name:alternate.name+' 착용',exact:true}).click()
  await expect(dialog).toHaveCount(0); await expect(page.locator('.shop-stage-status')).toHaveText('')
  await watcher.expectStable(); await watcher.stop()
  await expect(page.locator('.shop-slots')).toContainText(alternate.name); await expect(page.locator('.shop-slots')).toContainText(pet.name)
  await expect(page.locator('.shop-stage canvas')).toHaveAttribute('data-view-angle', '237'); await expect(page.locator('.shop-stage canvas')).toHaveAttribute('data-view-zoom', '119')
  await expect(page.locator('.shop-pair')).toHaveAttribute('aria-pressed','true')
  expect(await page.locator('canvas').evaluate(canvas=>canvas.toDataURL())).not.toBe(before)
  await page.getByRole('button',{name:'의상 URL 복사',exact:true}).click()
  const copied = new URL(await page.evaluate(()=>window.__copiedShopUrl))
  for(const [key,value] of Object.entries({top:'202',pet:'300',pair:'1',angle:'237',zoom:'119'}))expect(copied.searchParams.get(key)).toBe(value)
  await page.goto(copied.pathname+copied.search); await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(alternate.name)
  await openOutfitPanel(page); await open.click(); await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await expect(page.locator('.shop-slots')).toContainText(alternate.name)
})

test('login returns to the public catalog with already selected clothing intact', async ({ page }) => {
  await setup(page,{loggedIn:false,admin:false})
  await page.goto('/shop?sex=male')
  await page.getByRole('button',{name:shirt.name+' 의상 선택',exact:true}).click()
  await page.getByRole('button',{name:'로그인',exact:true}).click()
  const saved = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('r2_shop_return')))
  expect(new URL(saved.url,'https://r2archive.com').searchParams.get('top')).toBe(shirt.id)
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user:{id:1,provider:'google',nickname:'회원',onboarded:true}}}))
  await page.goto('/?auth=ok')
  await expect(page).toHaveURL(/\/shop\?/)
  await expect(page.getByRole('heading',{name:'아이템 상점',exact:true})).toBeVisible()
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await expect(page.getByRole('button',{name:shirt.name+' 즐겨찾기 추가',exact:true})).toBeEnabled()
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
  const star = page.getByRole('button', { name: hero.name + ' 즐겨찾기 추가', exact: true })
  await expect(star).toBeEnabled(); await star.click()
  await page.getByRole('tab', { name: '즐겨찾기', exact: true }).click()
  await page.getByRole('button', { name: hero.name + ' 자세히 보기', exact: true }).click()
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  const previewReturn = new URL(await page.evaluate(() => JSON.parse(sessionStorage.getItem('r2_shop_return')).url), 'https://r2archive.com')
  expect(previewReturn.searchParams.get('view')).toBe('preview')
  expect(previewReturn.searchParams.get('top')).toBe(shirt.id)
  await page.goto('/?auth=ok')
  await expect(page.getByRole('heading', { name: '의상 미리보기', exact: true })).toBeVisible()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
})

test('NEW and unavailable badges leave room for hover favorites without moving the catalog', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const fresh = { ...shirt, is_new: true }
  const missing = { ...shirt, id: '205', name: '새 미지원 상의', preview_available: false, model: null, is_new: true }
  await setup(page, { admin: false, items: [fresh, missing] })
  await page.goto('/shop?sex=male')
  await page.getByRole('checkbox', { name: '미리보기 불가능 아이템 가리기', exact: true }).uncheck()
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await expect(page.locator('.shop-footer')).toHaveText('R2 ARCHIVE ㆍ 아이템 미리보기')
  await page.locator('.shop-card').last().scrollIntoViewIfNeeded()
  const watcher = await watchLayout(page, ['.shop-departments', '.shop-search', '.shop-grid', '.shop-panel'])
  for (const item of [fresh, missing]) {
    const card = page.locator(`[data-item-id="${item.id}"]`), star = card.locator('.shop-favorite-button')
    await expect(card.locator('.shop-new-tag')).toHaveText('NEW')
    await expect(star).toBeEnabled(); await card.hover(); await expect(star).toHaveCSS('opacity', '1')
    const a = await star.boundingBox(), b = await card.locator('.shop-new-tag').boundingBox()
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width)
    if (item === missing) {
      await expect(card.locator('.shop-preview-unavailable')).toHaveText('미리보기 불가능')
      expect((await card.locator('.shop-preview-unavailable').boundingBox()).y).toBeGreaterThan(a.y + a.height)
    }
    await star.click(); await expect(star).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(page.locator('.shop-slots')).not.toContainText(missing.name)
  await watcher.expectStable(); await watcher.stop()
})

test('the favorites tab includes consumables and other items with gender category and search filters while preserving clothing', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const boost = { ...hero, id: '11000357', name: '자동 부스터 카드', group: 'buff', is_new: true }
  const other = { ...hero, id: '30852', name: '특수 캐릭터', department: 'other', group: 'character' }
  await setup(page, { admin: false, items: [shirt, femaleShirt, boost, other], favoriteIds: [shirt.id, femaleShirt.id, other.id] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (new URL(route.request().url()).searchParams.get('favorites_only') === 'true') await gate
    return route.fallback()
  })
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true }).click()
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
  const boostStar = page.locator(`[data-item-id="${boost.id}"] .shop-favorite-button`)
  await expect(boostStar).toBeEnabled(); await boostStar.click(); await expect(boostStar).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('tab', { name: '즐겨찾기', exact: true }).click()
  await expect(page.locator('.shop-list-status')).toContainText('불러오는 중')
  const watcher = await watchLayout(page, ['.shop-departments', '.shop-favorite-categories', '.shop-gender-row', '.shop-search', '.shop-grid', '.shop-panel'])
  await watcher.expectStable(); release()
  await expect(page.locator('.shop-card')).toHaveCount(3)
  await expect(page.locator(`[data-item-id="${boost.id}"]`)).toContainText(boost.name)
  await expect(page.locator(`[data-item-id="${other.id}"]`)).toContainText(other.name)
  await watcher.expectStable(); await watcher.stop()
  await page.getByRole('button', { name: '전체 성별', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(4)
  const categories = page.getByRole('group', { name: '즐겨찾기 아이템 분류', exact: true })
  await categories.getByRole('button', { name: '꾸미기ㆍ펫', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await page.getByRole('button', { name: femaleShirt.name + ' 의상 선택', exact: true }).click()
  await expect(page.locator('.shop-slots')).toContainText(femaleShirt.name)
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(shared.searchParams.get('sex')).toBe('female'); expect(shared.searchParams.get('top')).toBe(femaleShirt.id)
  await page.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
  await page.locator(`[data-item-id="${femaleShirt.id}"] .shop-favorite-button`).click()
  await expect(page.locator('.shop-card')).toHaveCount(0)
  await expect(page.locator('.shop-slots')).toContainText(femaleShirt.name)
  await categories.getByRole('button', { name: '기능성ㆍ소모품', exact: true }).click()
  await page.getByRole('button', { name: '버프아이템', exact: true }).click()
  await page.getByLabel('아이템 이름으로 검색').fill('자동')
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: boost.name + ' 자세히 보기', exact: true }).click()
  await expect(page.locator('.shop-detail h3')).toHaveText(boost.name)
  await closeMobilePanel(page)
  await categories.getByRole('button', { name: '기타', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await expect(page.getByRole('tab', { name: '즐겨찾기', exact: true })).toBeDisabled()
  await expect(categories).toHaveCount(0)
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
  await previewSelection(page)
  await expect(page.locator('.shop-stage canvas')).toBeVisible()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await expect(page.locator('.shop-pair-note')).toHaveText('선택하지 않은 부위는 기본 의상으로 표시됩니다.')
})

for (const [maleId, femaleId, maleName, femaleName] of [['1010034', '1020035', '샤프한 소년', '귀여운 소녀'], ['1010042', '1020043', '꼬마 인큐버스', '꼬마 서큐버스']]) {
  for (const sex of ['male', 'female']) {
    test(`different-named counterparts preserve ${maleName} ${sex} filtering preview and shared selection`, async ({ page }) => {
      await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
      const male = { ...shirt, id: maleId, name: maleName, slot: 'face', counterpart_id: femaleId }
      const female = { ...male, id: femaleId, name: femaleName, sex: 'female', counterpart_id: maleId }
      const selected = sex === 'male' ? male : female, partner = sex === 'male' ? female : male
      const unpaired = { ...selected, id: '777', name: '한쪽 전용 성형', counterpart_id: null }
      const requests = await setup(page, { items: [male, female, unpaired] })
      let releaseList
      const listGate = new Promise(resolve => { releaseList = resolve })
      await page.route(/\/api\/shop\/items\?/, async route => {
        if (new URL(route.request().url()).searchParams.get('paired_only') === 'true') await listGate
        return route.fallback()
      })
      await page.goto(`/shop?sex=${sex}`)
      await page.getByRole('button', { name: '성형', exact: true }).click()
      await expect(page.locator('.shop-card')).toHaveCount(2)
      const listWatcher = await watchLayout(page, ['.shop-header', '.shop-search', '.shop-pair-filter'])
      await page.getByRole('checkbox', { name: '남녀 모두 존재하는 의상만', exact: true }).check()
      await expect(page.locator('.shop-list-status')).toContainText('불러오는 중')
      await listWatcher.expectStable(); releaseList()
      await expect(page.locator('.shop-card')).toHaveCount(1)
      await listWatcher.expectStable(); await listWatcher.stop()
      await page.getByRole('button', { name: `${selected.name} 의상 선택`, exact: true }).click()
      await openOutfitPanel(page); await previewSelection(page)
      await expect(page.locator('.shop-stage-status')).toHaveText('')
      let releasePartner
      const partnerGate = new Promise(resolve => { releasePartner = resolve })
      await page.route(`**/api/shop/items/${partner.id}?*`, async route => { await partnerGate; return route.fallback() })
      const previewWatcher = await watchLayout(page, ['.shop-stage', '.shop-preview-toolbar', '.shop-pair', '.shop-pair-note'])
      await page.getByRole('button', { name: '이성 아이템 함께 보기', exact: true }).click()
      await expect(page.locator('.shop-stage-status')).toHaveText('이성 아이템을 확인 중입니다.')
      await previewWatcher.expectStable(); releasePartner()
      await expect(page.locator('.shop-stage-status')).toHaveText('')
      await expect(page.locator('.shop-character-labels span')).toHaveCount(2)
      await expect(page.locator('.shop-pair-note')).toHaveText('선택하지 않은 부위는 기본 의상으로 표시됩니다.')
      await previewWatcher.expectStable(); await previewWatcher.stop()
      expect(requests).toContain(`/api/shop/items/${partner.id}`)
      await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
      const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
      expect(shared.searchParams.get('face')).toBe(selected.id)
      expect(shared.searchParams.get('sex')).toBe(sex)
      expect(shared.searchParams.get('pair')).toBe('1')
      await page.goto(shared.pathname + shared.search)
      await expect(page.locator('.shop-stage-status')).toHaveText('')
      await expect(page.locator('.shop-character-labels span')).toHaveCount(2)
      await expect(page.locator('.shop-slots')).toContainText(selected.name)
    })
  }
}

const coupleRoot = `${root}/motions/`
const coupleRing = { ...hero, id: '30120', name: '하트 주얼링', category: '507', group: 'couple', couple_preview: { motion: coupleRoot + '1'.repeat(64) + '.json.gz', bindings: coupleRoot + '2'.repeat(64) + '.json.gz', audio: `${root}/audio/${'3'.repeat(64)}.mp3`, duration: .5 } }
const missingCoupleRing = { ...coupleRing, id: '30845', name: '흐르는 등불(공용)', couple_preview: null }
async function coupleFixture(page, { motionGate, actorRoles = true, effects = false, effectGate, ornamentCycle = 1, sharedEffectModel = false, particles = false, particleGate, blackParticles = false } = {}) {
  effects ||= particles
  const effectDescriptor = (model, animation) => ({ model: `${root}/models/${model.repeat(64)}.json.gz`, animation: coupleRoot + animation.repeat(64) + '.json.gz', ...(particles && model === '4' ? { particles: coupleRoot + 'a'.repeat(64) + '.json.gz' } : {}) })
  const ring = effects ? { ...coupleRing, couple_preview: { ...coupleRing.couple_preview, ornament: effectDescriptor('4', '5'), effects: [{ ...effectDescriptor(sharedEffectModel ? '4' : '6', '7'), sex: 'male' }] } } : coupleRing
  const requests = await setup(page, { items: [shirt, { ...femaleShirt, counterpart_id: '200' }, pet, { ...pet, id: '400', slot: 'accessory', model: `${root}/models/${'8'.repeat(64)}.json.gz` }, { ...pet, id: '500', slot: 'summon', model: `${root}/models/${'9'.repeat(64)}.json.gz` }, ring, missingCoupleRing] })
  const wave = Buffer.alloc(44 + 22050 * 2)
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(44100, 24); wave.writeUInt32LE(88200, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40)
  const matrices = Array.from({ length: 15 }, (_, frame) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.sin(frame * Math.PI * 2 / 15) * 15, 0, 0, 1]).flat()
  const actor = gender => ({ bones: ['Waist'], frames: matrices.map((value, index) => actorRoles && index % 16 === 12 ? value + (gender === 'male' ? 130 : -130) : value), ...(actorRoles ? { side: gender === 'male' ? 'right' : 'left' } : {}) })
  await page.route('**/api/shop/assets/*/motions/*', async route => {
    if (effects && ['5', '7'].some(digit => route.request().url().includes(digit.repeat(64)))) {
      if (effectGate) await effectGate
      const cycle = route.request().url().includes('5'.repeat(64)) ? ornamentCycle : 1
      return route.fulfill({ json: { schema: 'shop-couple-effect-v1', frame_count: 15 * cycle, relative_duration: cycle, bounds: [[-30, 0, -30], [30, 280, 30]], meshes: [{ name: 'Waist', frames: Array.from({ length: cycle }, () => matrices).flat() }] } })
    }
    if (motionGate) await motionGate
    const bindings = route.request().url().includes('2'.repeat(64))
    return route.fulfill({ json: bindings ? { schema: 'shop-couple-motion-v1', bindings: {} } : { schema: 'shop-couple-motion-v1', frame_count: 15, duration: .5, actors: { male: actor('male'), female: actor('female') } } })
  })
  if (effects) for (const digit of ['4', '6']) await page.route(`**/models/${digit.repeat(64)}.json.gz`, route => route.fulfill({ json: { ...mesh, texture_revision: 'f'.repeat(20) } }))
  if (particles) {
    await page.route(`**/motions/${'a'.repeat(64)}.json.gz`, async route => {
      if (particleGate) await particleGate
      return route.fulfill({ json: { schema: 'shop-particles-v1', texture_revision: 'f'.repeat(20), frame_count: 15 * ornamentCycle, source_duration: 15, anchors: { '': Array.from({ length: ornamentCycle }, () => matrices).flat() }, emitters: [{ anchor: '', texture: '9'.repeat(64) + '.webp', format: 'binary-v3', count: 8, interval: .1, seed: 42, start_tick: 0, end_tick: 0, midpoint: .5, uv_fps: 10, lifetime: [50, 50], velocity: [0, 0], position: [0, 0, -2], attachment_position: [0, 0, 0], attachment_rotation: [0, 0, 0], min_position: [0, 0, 0], max_position: [0, 0, 0], position_scale: [1, 1, 1], min_direction: [0, 0, 0], max_direction: [0, 0, 0], gravity: [0, 0, 0], acceleration: [0, 0, 0], colors: Array.from({ length: 3 }, () => [1, 1, 1, 1]), sizes: Array.from({ length: 3 }, () => [.25, .25, .25, .25]), uv: [[0, 0, 1, 1]], additive: true, angular_velocity: 0 }] } })
    })
    const black = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGNkYGD4z8DAwMAEIkAYAA4oAQOSwUJsAAAAAElFTkSuQmCC', 'base64')
    await page.route(`**/textures/${'9'.repeat(64)}.webp`, route => route.fulfill({ body: blackParticles ? black : png, contentType: 'image/png' }))
  }
  await page.route('**/api/shop/assets/*/audio/*', route => route.fulfill({ body: wave, contentType: 'audio/mpeg' }))
  await page.addInitScript(() => {
    const Native = window.AudioContext
    window.__coupleAudio = []
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args)
        const record = { context: this, starts: 0, stops: 0, loop: false }
        window.__coupleAudio.push(record)
        const original = this.createBufferSource.bind(this)
        this.createBufferSource = () => {
          const node = original(), start = node.start.bind(node), stop = node.stop.bind(node)
          node.start = (...values) => { record.starts++; record.loop = node.loop; return start(...values) }
          node.stop = (...values) => { record.stops++; return stop(...values) }
          return node
        }
      }
    }
  })
  return requests
}

test('couple preview loops selected outfits and audio without controls and keeps pending dialog and catalog geometry stable', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = await coupleFixture(page, { motionGate: gate })
  await page.goto(`/shop?v=${version}&sex=male&top=200`)
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
  await page.getByRole('button', { name: '커플링', exact: true }).click()
  await expect(page.locator('[data-item-id="30120"] .shop-preview-unavailable')).toHaveCount(0)
  await expect(page.locator('[data-item-id="30845"] .shop-preview-unavailable')).toHaveText('미리보기 불가능')
  await page.getByRole('button', { name: missingCoupleRing.name + ' 자세히 보기', exact: true }).click()
  await expect(page.getByRole('button', { name: '선택한 커플링 미리보기', exact: true })).toBeDisabled()
  await closeMobilePanel(page)
  await page.getByRole('button', { name: coupleRing.name + ' 자세히 보기', exact: true }).click()
  const open = page.getByRole('button', { name: '선택한 커플링 미리보기', exact: true })
  await open.scrollIntoViewIfNeeded()
  expect(await open.evaluate(button => !!(button.compareDocumentPosition(button.parentElement.querySelector('.shop-copy-item')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  const openingWatcher = await watchLayout(page, ['.shop-header', '.shop-search'])
  await open.click()
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog).toBeVisible()
  await openingWatcher.expectStable(); await openingWatcher.stop()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const watcher = await watchLayout(page, ['.shop-couple-heading', '.shop-couple-dialog .shop-stage', '.shop-couple-note', '.shop-couple-purchase-note', '.shop-header', '.shop-search'])
  await watcher.expectStable(); release()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  const labelPositions = await dialog.locator('canvas').evaluate(canvas => ['--shop-primary-label', '--shop-secondary-label'].map(name => parseFloat(canvas.parentElement.style.getPropertyValue(name))))
  expect(labelPositions[0]).toBeGreaterThan(labelPositions[1])
  await expect(dialog.getByRole('button')).toHaveCount(2)
  await expect(dialog.locator('.shop-couple-purchase-note')).toHaveText('게임 내 아이템과는 차이가 있을 수 있습니다. 반드시 인 게임에서 상세히 확인 후 구매하시기 바랍니다.')
  await expect(dialog.locator('.shop-couple-purchase-note')).toHaveCSS('color', 'rgb(255, 177, 94)')
  expect(await dialog.locator('.shop-couple-note').evaluate(note => note.nextElementSibling.classList.contains('shop-couple-purchase-note'))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('running')
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(1)
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).loop)).toBe(true)
  const first = await dialog.locator('canvas').getAttribute('data-motion-frame')
  await expect.poll(() => dialog.locator('canvas').getAttribute('data-motion-frame'), { intervals: [17, 41, 83, 127], timeout: 10000 }).not.toBe(first)
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.currentTime)).toBeGreaterThan(1)
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const coupleUrl = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(Object.fromEntries(coupleUrl.searchParams)).toMatchObject({ view: 'couple', item: '30120', v: version, sex: 'male', top: '200' })
  await expect(dialog.getByRole('status').filter({ hasText: 'URL을 복사했습니다' })).toBeVisible()
  await expect(dialog.locator('.shop-toast')).toHaveCount(0, { timeout: 5000 })
  expect(await page.evaluate(() => window.__coupleAudio.map(({ starts, stops }) => ({ starts, stops })))).toEqual([{ starts: 1, stops: 0 }])
  await watcher.expectStable(); await watcher.stop()
  expect(requests).toContain('/api/shop/items/201')
  await dialog.getByRole('button', { name: '커플 모션 미리보기 닫기' }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).stops)).toBe(1)
  await closeMobilePanel(page)
  await page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true }).click()
  await openOutfitPanel(page)
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(shared.searchParams.get('top')).toBe('200')
  expect(shared.searchParams.get('view')).toBe('preview')
})

test('back and Escape close couple audio and preserve the original item URL while pending assets cannot start after close', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await coupleFixture(page, { motionGate: gate, actorRoles: false })
  await page.goto(`/shop?item=30120&v=${version}`)
  await expect(page.locator('.shop-detail h3')).toHaveText(coupleRing.name)
  if (page.viewportSize().width <= 800) {
    if (!await page.getByRole('dialog', { name: '아이템 현황', exact: true }).isVisible()) await page.getByRole('button', { name: '아이템 현황', exact: true }).click()
    await page.getByRole('tab', { name: '아이템 정보', exact: true }).click()
  }
  const open = page.getByRole('button', { name: '선택한 커플링 미리보기', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).not.toBeVisible()
  expect(new URL(page.url()).searchParams.get('item')).toBe('30120')
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  release()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(0)
  await open.click()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
})

for (const sex of ['male', 'female']) test(`shared couple preview restores ${sex} clothing, waits for an audio gesture and keeps layout stable through loading and copy fallback`, async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = await coupleFixture(page, { motionGate: gate })
  const top = sex === 'male' ? '200' : '201'
  const selected = sex === 'male' ? shirt : femaleShirt
  const path = `/shop?view=couple&item=30120&v=${version}&sex=${sex}&top=${top}&pet=300&pair=1&angle=180&zoom=100`
  await page.goto(path)
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  expect(await page.evaluate(() => window.__coupleAudio.length)).toBe(0)
  expect(requests).toContain(`/api/shop/items/${sex === 'male' ? '201' : '200'}`)
  expect(requests).toContain('/api/shop/items/300')
  await expect(dialog.getByRole('button', { name: '커플 모션 시작', exact: true })).toBeVisible()
  const watcher = await watchLayout(page, ['.shop-couple-heading', '.shop-couple-dialog .shop-stage', '.shop-couple-note', '.shop-couple-purchase-note', '.shop-header', '.shop-search'])
  await watcher.expectStable()
  await dialog.getByRole('button', { name: '커플 모션 시작', exact: true }).click()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  await watcher.expectStable(); release()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(1)
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(copied.origin).toBe('https://r2archive.com')
  expect(Object.fromEntries(copied.searchParams)).toMatchObject({ view: 'couple', item: '30120', sex, top, pet: '300', v: version })
  await watcher.expectStable()
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied') } })
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const fallback = dialog.getByRole('dialog', { name: '커플 모션 URL 직접 복사', exact: true })
  await expect(fallback).toBeVisible()
  await expect(fallback.getByRole('textbox', { name: '커플 모션 공유 URL' })).toHaveValue(copied.href)
  await expect(fallback.getByRole('textbox')).toBeFocused()
  await watcher.expectStable()
  await fallback.getByRole('button', { name: '커플 모션 URL 직접 복사 닫기' }).click()
  expect(await page.evaluate(() => window.__coupleAudio.map(({ starts, stops }) => ({ starts, stops })))).toEqual([{ starts: 1, stops: 0 }])
  await watcher.expectStable(); await watcher.stop()
  await page.goBack()
  await expect(dialog).not.toBeVisible()
  await expect(page).toHaveURL(path)
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  await page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true }).click()
  await openOutfitPanel(page)
  await expect(page.locator('.shop-slots')).toContainText(selected.name)
  await expect(page.locator('.shop-slots')).toContainText(pet.name)
  await closeMobilePanel(page)
  await page.reload()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '커플 모션 시작', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__coupleAudio.length)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => window.__coupleAudio.length)).toBe(0)
})

test('unsupported or malformed shared couple links never open or start a motion', async ({ page }) => {
  await coupleFixture(page)
  for (const item of ['30845', '1000208', '../../secret', '']) {
    await page.goto(`/shop?view=couple&v=${version}&sex=male&item=${encodeURIComponent(item)}`)
    await expect(page.locator('.shop-feedback [role="alert"]')).toBeVisible()
    await expect(page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => window.__coupleAudio.length)).toBe(0)
  }
})

test('couple models share the audio clock while selected pets decorations and wings are hidden only in the couple stage', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = await coupleFixture(page, { effects: true, effectGate: gate, ornamentCycle: 2 })
  const assets = []
  page.on('request', request => { if (request.url().includes('/models/')) assets.push(new URL(request.url()).pathname) })
  await page.goto(`/shop?view=couple&item=30120&v=${version}&sex=male&top=200&pet=300&accessory=400&summon=500`)
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const watcher = await watchLayout(page, ['.shop-couple-heading', '.shop-couple-dialog .shop-stage', '.shop-couple-note', '.shop-couple-purchase-note', '.shop-header'])
  await watcher.expectStable()
  await dialog.getByRole('button', { name: '커플 모션 시작', exact: true }).click()
  await watcher.expectStable()
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(0)
  release()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(dialog.locator('canvas')).toHaveAttribute('data-couple-ornament', '1')
  await expect(dialog.locator('canvas')).toHaveAttribute('data-couple-scene-models', '1')
  await expect(dialog.locator('.shop-couple-model-caption')).toHaveCount(0)
  await expect(dialog.locator('canvas')).toHaveAttribute('data-couple-model-placement', 'main')
  await expect.poll(() => dialog.locator('canvas').evaluate(canvas => Number(canvas.dataset.ornamentFrame) >= 15 && Number(canvas.dataset.motionFrame) < 15), { intervals: [17, 41, 83, 127], timeout: 10000 }).toBe(true)
  const frame = await dialog.locator('canvas').getAttribute('data-ornament-frame')
  await expect.poll(() => dialog.locator('canvas').getAttribute('data-ornament-frame'), { intervals: [17, 41, 83, 127], timeout: 10000 }).not.toBe(frame)
  for (const digit of ['c', '8', '9']) expect(assets).not.toContain(`${root}/models/${digit.repeat(64)}.json.gz`)
  expect(requests).toContain('/api/shop/items/300')
  expect(requests).toContain('/api/shop/items/400')
  expect(requests).toContain('/api/shop/items/500')
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const shared = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(Object.fromEntries(shared.searchParams)).toMatchObject({ pet: '300', accessory: '400', summon: '500', top: '200', view: 'couple', item: '30120' })
  await watcher.expectStable(); await watcher.stop()
  await page.goBack(); await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  await page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true }).click()
  await openOutfitPanel(page); await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  for (const digit of ['c', '8', '9']) expect(assets).toContain(`${root}/models/${digit.repeat(64)}.json.gz`)
  await expect(page.locator('.shop-stage canvas')).toHaveAttribute('data-couple-ornament', '0')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  expect(Object.fromEntries(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams)).toMatchObject({ pet: '300', accessory: '400', summon: '500', view: 'preview' })
})

test('a lobby model reused by an action is shown once in the main scene', async ({ page }) => {
  const requests = []
  await coupleFixture(page, { effects: true, sharedEffectModel: true })
  page.on('request', request => requests.push(request.url()))
  await page.goto(`/shop?view=couple&item=30120&v=${version}&sex=male`)
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await dialog.getByRole('button', { name: '커플 모션 시작', exact: true }).click()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(dialog.locator('canvas')).toHaveAttribute('data-couple-ornament', '1')
  await expect(dialog.locator('canvas')).toHaveAttribute('data-couple-scene-models', '0')
  expect(requests.some(url => url.includes('7'.repeat(64) + '.json.gz'))).toBe(false)
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(1)
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
})

test('source particles render in the main scene without dark additive rectangles and pending particle loading keeps layout stable', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await coupleFixture(page, { particles: true, particleGate: gate, blackParticles: true })
  await page.addInitScript(() => {
    window.__particleDraws = 0; window.__insetViewport = false
    const draw = WebGLRenderingContext.prototype.drawArrays, viewport = WebGLRenderingContext.prototype.viewport
    WebGLRenderingContext.prototype.drawArrays = function (...args) { window.__particleDraws++; return draw.apply(this, args) }
    WebGLRenderingContext.prototype.viewport = function (...args) { if (args[0] || args[1]) window.__insetViewport = true; return viewport.apply(this, args) }
  })
  await page.goto(`/shop?view=couple&item=30120&v=${version}&sex=male&top=200&pet=300&accessory=400&summon=500`)
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const watcher = await watchLayout(page, ['.shop-couple-heading', '.shop-couple-dialog .shop-stage', '.shop-couple-note', '.shop-couple-purchase-note', '.shop-header'])
  await watcher.expectStable()
  await dialog.getByRole('button', { name: '커플 모션 시작', exact: true }).click()
  await watcher.expectStable()
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(0)
  release(); await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect.poll(async () => Number(await dialog.locator('canvas').getAttribute('data-particle-count'))).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__particleDraws)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__insetViewport)).toBe(false)
  const dark = await dialog.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl'), pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) if (!pixels[index] && !pixels[index + 1] && !pixels[index + 2] && pixels[index + 3] > 10) count++
    return count
  })
  expect(dark).toBe(0)
  const frame = await dialog.locator('canvas').getAttribute('data-particle-frame')
  await expect.poll(() => dialog.locator('canvas').getAttribute('data-particle-frame'), { intervals: [17, 41, 83, 127] }).not.toBe(frame)
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  expect(Object.fromEntries(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams)).toMatchObject({ item: '30120', top: '200', pet: '300', accessory: '400', summon: '500', view: 'couple' })
  await watcher.expectStable(); await watcher.stop()
  await page.goBack(); await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).stops)).toBe(1)
})

test('closing while particle definitions are pending prevents late audio and particle draws', async ({ page }) => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  await coupleFixture(page, { particles: true, particleGate: gate })
  await page.goto(`/shop?item=30120&v=${version}`)
  await expect(page.locator('.shop-detail h3')).toHaveText(coupleRing.name)
  if (page.viewportSize().width <= 800) {
    await expect(page.getByRole('dialog', { name: '아이템 현황', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '아이템 정보', exact: true }).click()
  }
  await page.getByRole('button', { name: '선택한 커플링 미리보기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
  release()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1).context.state)).toBe('closed')
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(0)
})

test('full outfit links restore camera, gender, both characters and default unselected slots', async ({ page }) => {
  await setup(page)
  await page.goto(`/shop?view=preview&v=${version}&sex=male&top=200&pair=1&angle=237&zoom=119`)
  await expect(page.locator('.shop-stage canvas')).toBeVisible()
  await expect(page.locator('.shop-stage canvas')).toHaveAttribute('data-view-angle', '237')
  await expect(page.locator('.shop-stage canvas')).toHaveAttribute('data-view-zoom', '119')
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
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
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
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  expect(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams.get('top')).toBe('2000')
  await page.getByRole('button', { name: '의상 미리보기 닫기' }).click()
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
  await previewSelection(page)
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
  await page.getByRole('checkbox', { name: '미리보기 불가능 아이템 가리기', exact: true }).click()
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
  await openOutfitPanel(page)
  await expect(page.locator('.shop-toast')).toHaveCount(0)
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await expect(page.locator('.shop-slots')).not.toContainText(unavailable.name)
  await watcher.expectStable()
  await watcher.stop()
  await closeMobilePanel(page)
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
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
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
  await closeMobilePanel(page)
  await page.getByRole('button', { name: '펫 용품', exact: true }).click()
  await page.getByRole('button', { name: '펫 먹이', exact: true }).click()
  await expect(page.locator('.shop-card')).toContainText(food.name)
  await page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true }).click()
  await openOutfitPanel(page)
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await expect(page.locator('.shop-slots')).toContainText(regular.name)
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const outfit = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(outfit.searchParams.get('top')).toBe(shirt.id)
  expect(outfit.searchParams.get('pet')).toBe(regular.id)
  await page.goto(shared.pathname + shared.search)
  await expect(page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '단짝링', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-item-id="901"]')).toBeAttached()
  await expect(page.locator('[data-item-id="900"]')).toHaveCount(0)
})

test('unavailable items are hidden by default and the toggle keeps selection and pending list geometry stable', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const unavailable = { ...shirt, id: '700', name: '미지원 장식', slot: 'accessory', preview_available: false, model: null }
  await setup(page, { items: [shirt, unavailable] })
  await page.goto('/shop?sex=male')
  const toggle = page.getByRole('checkbox', { name: '미리보기 불가능 아이템 가리기', exact: true })
  const paired = page.getByRole('checkbox', { name: '남녀 모두 존재하는 의상만', exact: true })
  await expect(toggle).toBeChecked()
  await expect(paired).not.toBeChecked()
  await expect(page.locator('.shop-slots')).toContainText('선택한 펫 없음')
  await expect(page.locator('.shop-panel-note')).toHaveText('선택하지 않은 부위는 기본 의상으로 표시됩니다.')
  await expect(page.locator('.shop-title p')).toHaveCount(0)
  await expect(page.locator('.shop-app')).not.toContainText('·')
  await expect(page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true })).toBeVisible()
  const styles = await page.locator('.shop-pair-filter input').evaluateAll(inputs => inputs.map(input => {
    const box = getComputedStyle(input), label = getComputedStyle(input.parentElement)
    return [input.type, box.width, box.height, box.accentColor, label.fontSize, label.fontWeight, label.minHeight, label.gap, label.color]
  }))
  expect(styles).toHaveLength(2); expect(styles[0]).toEqual(styles[1])
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
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.shop-list-status')).toContainText('불러오는 중')
  await watcher.expectStable()
  release()
  await expect(page.locator('.shop-card')).toHaveCount(2)
  await expect(page.locator('[data-item-id="700"] .shop-preview-unavailable')).toHaveText('미리보기 불가능')
  await watcher.expectStable()
  await toggle.click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable()
  let releasePaired
  const pairedGate = new Promise(resolve => { releasePaired = resolve })
  await page.route(/\/api\/shop\/items\?/, async route => {
    if (new URL(route.request().url()).searchParams.get('paired_only') === 'true') await pairedGate
    return route.fallback()
  })
  await paired.check()
  await expect(page.locator('.shop-list-status')).toContainText('불러오는 중')
  await watcher.expectStable(); releasePaired()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await watcher.expectStable(); await watcher.stop()
  await expect(page.locator('.shop-slots')).toContainText(shirt.name)
  await page.goto(`/shop?item=700&v=${version}`)
  await expect(toggle).not.toBeChecked()
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

test('static standing poses anchor common wings separately for both genders while preserving hands and legacy shared URLs', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const accessory = { ...shirt, id: '610', name: '손 장식(남)', slot: 'accessory', model: `${root}/models/${'1'.repeat(64)}.json.gz`, counterpart_id: '611' }
  const other = { ...accessory, id: '611', sex: 'female', name: '손 장식(여)', counterpart_id: '610' }
  const wings = { ...pet, id: '620', name: '정지 날개', slot: 'summon', model: `${root}/models/${'2'.repeat(64)}.json.gz` }
  const rectangle = (name, left, right, bottom, top, z, color) => ({ name, vertices: [[left,bottom],[right,bottom],[right,top],[left,top]].flatMap(([x,y]) => [x,y,z,0,0,-1,(color+.5)/6,.5]), indices: [0,1,2,0,2,3], texture: `${hash}.webp` })
  const pose = (x, y) => [1,0,0,0,0,1,0,0,0,0,1,0,x,y,0,1]
  const textureRevision = '9'.repeat(20)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = await setup(page, { items: [accessory,other,wings], textureRevision, modelGate: gate,
    texture: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAABCAIAAAByq0inAAAAE0lEQVR4nGP4z8DAAMb//0OI/wBHywj4QWpCgAAAAABJRU5ErkJggg==', 'base64'), models: {
      [`${root}/models/${'d'.repeat(64)}.json.gz`]: { attachment_pose: pose(120,40), meshes: [rectangle('Waist',-24,24,20,280,-10,0)] },
      [`${root}/models/${'e'.repeat(64)}.json.gz`]: { attachment_pose: pose(-120,-40), meshes: [rectangle('Waist',-24,24,20,280,-10,1)] },
      [accessory.model]: { meshes: [rectangle('RightHand',15,35,100,130,-20,2)] },
      [wings.model]: { meshes: [rectangle('Summon-wing',-25,25,100,150,25,4)] },
    } })
  await page.goto(`/shop?view=preview&v=${version}&sex=male&accessory=610&summon=620&pair=1&angle=180&zoom=100`)
  await expect(page.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const watcher = await watchLayout(page, ['.shop-stage','.shop-preview-toolbar','.shop-view-controls'])
  await watcher.expectStable(); release()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await watcher.expectStable(); await watcher.stop()
  const canvas = page.locator('.shop-stage canvas'), pixels = await directionPixels(canvas)
  const red = pixels.groups.find(group => group.colors[1]), green = pixels.groups.find(group => group.colors[2])
  const blue = pixels.groups.filter(group => (group.colors[6]?.count || 0) > 100)
  expect(blue).toHaveLength(2)
  expect(red.colors[1].x).toBeLessThan(blue[0].colors[6].x)
  expect(blue[1].colors[6].x).toBeLessThan(green.colors[2].x)
  expect(blue[0].colors[6].top).toBeGreaterThan(blue[1].colors[6].top + 5)
  for (const body of [red,green]) expect(body.colors[4]?.count || 0).toBeGreaterThan(10)
  expect(pixels.left).toBeGreaterThan(4); expect(pixels.right).toBeLessThan(pixels.width-5)
  expect(requests.some(p => p.startsWith(`/api/shop/assets/${textureRevision}/textures/`))).toBe(true)
  const frame = await canvas.evaluate(c => c.toDataURL())
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  const copied = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(copied.searchParams.get('v')).toBe(version)
  expect(copied.searchParams.get('accessory')).toBe('610')
  expect(copied.searchParams.get('summon')).toBe('620')
  await page.goto(copied.pathname+copied.search)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(frame)
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
  await previewSelection(page)
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
    await setViewerAngle(page, Number(angle))
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
  await setViewerAngle(page, 237)
  await setViewerZoom(page, 119)
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

test('couple camera gestures reuse poses and motion bounds without reloading assets or restarting audio and label the selected female correctly', async ({ page }) => {
  await coupleFixture(page, { particles: true })
  await page.goto(`/shop?view=couple&item=30120&v=${version}&sex=female&top=201&angle=237&zoom=119`)
  const dialog = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true }), canvas = dialog.locator('canvas')
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(dialog.locator('.shop-character-labels')).toContainText('여성 ㆍ 선택한 의상')
  await expect(dialog.locator('.shop-character-labels')).toContainText('남성 ㆍ 대응 의상')
  await dialog.getByRole('button', { name: '커플 모션 시작', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-envelope-builds', '1')
  await page.evaluate(() => { const context = window.__coupleAudio.at(-1).context; const time = context.currentTime; Object.defineProperty(context, 'currentTime', { get: () => time }) })
  await page.waitForTimeout(100)
  const poses = await canvas.getAttribute('data-pose-builds')
  let assetRequests = 0
  page.on('request', request => { if (request.url().includes('/api/shop/assets/')) assetRequests++ })
  await setViewerAngle(page, 307); await setViewerZoom(page, 105)
  const labels = dialog.locator('.shop-character-labels span'), labelA = await labels.nth(0).boundingBox(), labelB = await labels.nth(1).boundingBox()
  expect(labelA.x + labelA.width <= labelB.x || labelB.x + labelB.width <= labelA.x).toBe(true)
  await expect(canvas).toHaveAttribute('data-envelope-builds', '1')
  expect(assetRequests).toBe(0)
  await expect(canvas).toHaveAttribute('data-pose-builds', poses)
  expect(await page.evaluate(() => window.__coupleAudio.at(-1).starts)).toBe(1)
  await dialog.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const url = new URL(await page.evaluate(() => window.__copiedShopUrl))
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ view: 'couple', sex: 'female', top: '201', angle: '307', zoom: '105' })
  await page.goto(url.pathname + url.search)
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(canvas).toHaveAttribute('data-view-angle', '307'); await expect(canvas).toHaveAttribute('data-view-zoom', '105')
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
})

test('outfit modal loads every favorite automatically with bounded rendering and confirms a slot reset while preserving clothing and layout', async ({ page }) => {
  await page.setViewportSize({ width: test.info().project.use.viewport.width <= 768 ? 390 : 1440, height: 1000 })
  const tops = Array.from({ length: 180 }, (_, index) => ({ ...shirt, id: String(5000 + index), name: `저장된 상의 ${index}` }))
  const items = [shirt, femaleShirt, pet, hero, ...tops], ids = [...tops.map(item => item.id), '201', '300', hero.id]
  await setup(page, { items, favoriteIds: ids })
  let releasePages, releaseClear
  const pages = new Promise(resolve => { releasePages = resolve }), clear = new Promise(resolve => { releaseClear = resolve })
  const clears = []
  await page.route(/\/api\/shop\/items\?/, async route => { const params = new URL(route.request().url()).searchParams; if (params.get('favorites_only') === 'true' && params.get('cursor')) await pages; return route.fallback() })
  await page.route('**/api/shop/favorites?slot=top', async route => { clears.push(route.request().method()); await clear; return route.fallback() })
  await page.goto(`/shop?view=preview&v=${version}&sex=male&top=200`)
  const preview = page.getByRole('dialog', { name: '의상 미리보기', exact: true })
  await expect(preview.locator('.shop-stage-status')).toHaveText('')
  await openOutfitPanel(page); await page.getByRole('button', { name: '상의 즐겨찾기 열기', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '상의 즐겨찾기', exact: true })
  const watcher = await watchLayout(page, ['.shop-favorite-picker>header', '.shop-favorite-picker .shop-search', '.shop-favorite-results', '.shop-favorite-picker>footer', '.shop-stage'])
  await expect(picker.getByRole('button', { name: '더 불러오기', exact: true })).toHaveCount(0)
  await expect(picker.getByRole('button', { name: '기본 상의 사용', exact: true })).toHaveCount(0)
  await watcher.expectStable(); releasePages()
  await expect(picker.locator('.shop-favorite-status')).toHaveText('즐겨찾기 180개')
  expect(await picker.locator('[data-item-id]').count()).toBeLessThan(30)
  await picker.locator('.shop-favorite-results').evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(picker.getByRole('button', { name: '저장된 상의 179 착용', exact: true })).toBeVisible()
  await watcher.expectStable()
  page.once('dialog', async dialog => { expect(dialog.message()).toBe('등록된 상의 즐겨찾기가 전부 제거됩니다. 계속 하시겠습니까?'); await dialog.dismiss() })
  await picker.getByRole('button', { name: '즐겨찾기 초기화', exact: true }).click(); expect(clears).toEqual([])
  page.once('dialog', dialog => dialog.accept())
  await picker.getByRole('button', { name: '즐겨찾기 초기화', exact: true }).click()
  await expect(picker.getByRole('button', { name: '즐겨찾기 초기화', exact: true })).toBeDisabled()
  await watcher.expectStable(); releaseClear()
  await expect(picker.locator('.shop-favorite-status')).toHaveText('즐겨찾기 0개')
  await watcher.expectStable(); await watcher.stop()
  await picker.getByRole('button', { name: '즐겨찾기 목록 닫기', exact: true }).click()
  await closeMobilePanel(page)
  await preview.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  expect(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams.get('top')).toBe('200')
  await preview.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
  await page.getByRole('tab', { name: '즐겨찾기', exact: true }).click()
  await expect(page.locator('.shop-list-status')).toHaveText('아이템 2개')
})

test('all-favorite reset requires confirmation preserves favorites on failure and clears functional items too', async ({ page }) => {
  await setup(page, { items: [shirt, femaleShirt, pet, hero], favoriteIds: ['200', '201', '300', hero.id] })
  await page.goto('/shop?sex=male')
  await page.getByRole('tab', { name: '즐겨찾기', exact: true }).click()
  await page.getByRole('button', { name: '전체 성별', exact: true }).click()
  await expect(page.locator('.shop-list-status')).toHaveText('아이템 4개')
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/shop/favorites', async route => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    calls++; if (calls === 1) { await gate; return route.fulfill({ status: 503, json: { detail: '잠시 후 다시 시도해주세요.' } }) }
    return route.fallback()
  })
  page.once('dialog', async dialog => { expect(dialog.message()).toBe('등록된 모든 즐겨찾기가 전부 제거됩니다. 계속 하시겠습니까?'); await dialog.dismiss() })
  await page.getByRole('button', { name: '즐겨찾기 초기화', exact: true }).click(); expect(calls).toBe(0)
  const watcher = await watchLayout(page, ['.shop-departments', '.shop-search', '.shop-grid', '.shop-gender-row'])
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '즐겨찾기 초기화', exact: true }).click()
  await expect(page.getByRole('button', { name: '즐겨찾기 초기화', exact: true })).toBeDisabled()
  await watcher.expectStable(); release()
  await expect(page.getByRole('alert')).toHaveText('잠시 후 다시 시도해주세요.')
  await expect(page.locator('.shop-card')).toHaveCount(4)
  await watcher.expectStable(); await watcher.stop()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '즐겨찾기 초기화', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(0)
  await page.reload(); await page.getByRole('tab', { name: '즐겨찾기', exact: true }).click()
  await expect(page.locator('.shop-list-status')).toHaveText('아이템 0개')
})

test('male and female clothing selections survive gender switches and reload within a tab while shared outfits override session memory', async ({ page }) => {
  await setup(page, { items: [shirt, femaleShirt, pet] })
  await page.goto('/shop?sex=female')
  await page.getByRole('button', { name: femaleShirt.name + ' 의상 선택', exact: true }).click()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  await page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true }).click()
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await expect(page.getByRole('button', { name: femaleShirt.name + ' 의상 선택', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '남성', exact: true }).click()
  await expect(page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/shop')
  await expect(page.getByRole('button', { name: '남성', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto(`/shop?view=preview&v=${version}&sex=female&pet=300`)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await openOutfitPanel(page)
  await expect(page.locator('.shop-slots')).not.toContainText(femaleShirt.name)
  await expect(page.locator('.shop-slots')).toContainText(pet.name)
  await closeMobilePanel(page)
  await page.getByRole('dialog', { name: '의상 미리보기', exact: true }).getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
  await page.goto('/shop?item=1000208')
  await closeMobilePanel(page)
  await page.getByRole('tab', { name: '꾸미기ㆍ펫', exact: true }).click()
  await expect(page.getByRole('button', { name: '여성', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await previewSelection(page)
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  await page.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  expect(Object.fromEntries(new URL(await page.evaluate(() => window.__copiedShopUrl)).searchParams)).toMatchObject({ sex: 'female', pet: '300' })
})
