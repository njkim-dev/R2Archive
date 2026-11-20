import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { copiedShopUrl, femaleShirt, mesh, setup, shirt, version } from './shopFixtures.js'
import { coupleFixture, coupleRing } from './coupleFixtures.js'
import { waitForFrames, watchLayout } from './layout.js'

const round = JSON.parse(readFileSync(new URL('../../src/data/encore-shop.json', import.meta.url), 'utf8'))
const showcase = round.offers[0]
const restored = new Set(['20520532', '30320532', '10420533', '10310508', '920532'])
const sourceItem = id => round.offers.flatMap(offer => offer.items).find(item => item.id === id)
const wearable = [showcase, ...round.offers.filter(offer => offer.kind === 'wearable')]
  .flatMap(offer => offer.items).filter(item => item.preview).map(item => ({
  ...shirt, id: item.id, name: item.name, slot: item.slot, sex: item.sex,
}))
const setName = '블랙 수트 · 블랙 드레스'
const bind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const shifted = [...bind.slice(0, 12), 6, 10, 0, 1]
const standAloneMotion = {
  schema: 'shop-couple-effect-v1', frame_count: 2, bounds: [[-20, 0, 0], [30, 290, 1]],
  meshes: [{ name: 'Waist', frames: [...bind, ...shifted] }],
}
const standAloneParticles = {
  schema: 'shop-particles-v1', frame_count: 2, source_duration: 2, texture_revision: version, anchors: {}, emitters: [],
}

test('Encore opens a same-page couple modal with the selected character and their partner', async ({ page }) => {
  const width = test.info().project.use.viewport.width <= 768 ? 390 : 1440
  await page.setViewportSize({ width, height: 940 })
  await page.addInitScript(() => sessionStorage.setItem('r2_active_character', '1'))
  const wardrobe = { ...shirt, id: '211', name: '두 번째 캐릭터 메인' }
  const partnerTop = { ...femaleShirt, id: '212', name: '커플 캐릭터 메인' }
  const first = { id: '1', name: '첫 번째 캐릭터', sex: 'female', ids: ['201'], mains: [{ sex: 'female', slot: 'top', item: femaleShirt }] }
  const second = { id: '2', name: '두 번째 캐릭터', sex: 'male', ids: ['211'], mains: [{ sex: 'male', slot: 'top', item: wardrobe }] }
  const partner = { id: '81', name: '커플 캐릭터', sex: 'female' }
  const ring = { ...coupleRing, id: '30835', name: '릴리 앤 리본' }
  await coupleFixture(page, { characters: [first, second], extraItems: [ring, wardrobe, partnerTop] })
  await page.route(/\/encore-shop(?:-[\w-]+)?\.json(?:\?.*)?$/, route => route.request().resourceType() === 'fetch'
    ? route.fulfill({ json: { ...round, catalogVersion: version } }) : route.fallback())
  await page.route('**/api/shop/couples', route => route.fulfill({ json: { relationships: [
    { id: '41', status: 'accepted', character: { id: first.id, sex: first.sex } },
    { id: '42', status: 'accepted', character: { id: second.id, sex: second.sex }, partner },
  ] } }))
  await page.route('**/api/shop/couples/2/home?**', route => route.fulfill({ json: { character: partner, mains: [{ slot: 'top', item: partnerTop }] } }))
  let releaseList, releaseMotion
  const listGate = new Promise(resolve => { releaseList = resolve })
  const motionGate = new Promise(resolve => { releaseMotion = resolve })
  await page.route('**/api/shop/characters?**', async route => { await listGate; return route.fallback() })
  await page.route(`**/api/shop/items/${ring.id}?**`, async route => { await motionGate; return route.fallback() })
  await page.goto('/shop/encore')

  const characters = page.getByLabel('저장할 캐릭터', { exact: true })
  await expect(characters).toBeDisabled()
  const listing = await watchLayout(page, ['.encore-title', '.encore-round', '.encore-toolbar', '.encore-list-heading'])
  await listing.expectStable()
  releaseList()
  await expect(characters).toHaveValue('1')
  await listing.expectStable()
  await listing.stop()
  await characters.selectOption(second.id)
  expect(await page.evaluate(() => sessionStorage.getItem('r2_active_character'))).toBe(second.id)

  await page.getByRole('button', { name: `${ring.name} 미리보기`, exact: true }).click()
  const offerPreview = width === 390 ? page.getByRole('dialog', { name: '의상 미리보기', exact: true })
    : page.getByRole('complementary', { name: '착용 미리보기' })
  await offerPreview.getByRole('button', { name: '커플 모션 미리보기', exact: true }).click()
  const motion = page.getByRole('dialog', { name: '커플 모션 미리보기', exact: true })
  await expect(motion.locator('.shop-stage-status')).toHaveText('선택한 의상을 준비 중입니다.')
  const layout = await watchLayout(page, ['dialog[aria-label="커플 모션 미리보기"] .shop-couple-heading', '.shop-couple-viewport', '.shop-couple-note'])
  await layout.expectStable()
  releaseMotion()
  await expect(motion.locator('.shop-stage-status')).toHaveText('')
  await layout.expectStable()
  await layout.stop()
  await expect(motion.locator('[data-actor="primary"]')).toContainText('남성')
  await expect(motion.locator('[data-actor="partner"]')).toContainText('여성')
  await motion.getByRole('button', { name: 'URL 복사', exact: true }).click()
  const shared = await copiedShopUrl(page)
  expect(Object.fromEntries(shared.searchParams)).toMatchObject({ item: ring.id, sex: 'male', top: wardrobe.id, partnerSex: 'female', partner_top: partnerTop.id })
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1)?.starts)).toBe(1)
  await motion.getByRole('button', { name: '커플 모션 미리보기 닫기', exact: true }).click()
  await expect(motion).toBeHidden()
  await expect(offerPreview.getByRole('button', { name: '커플 모션 미리보기', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__coupleAudio.at(-1)?.context.state)).toBe('closed')
  await expect(page).toHaveURL(/\/shop\/encore$/)
  expect(page.context().pages()).toHaveLength(1)
})

test('a recovered Encore garment can be viewed separately while the set preview stays in place', async ({ page }) => {
  const width = test.info().project.use.viewport.width <= 768 ? 390 : 1440
  await page.setViewportSize({ width, height: 940 })
  for (const id of restored) expect(sourceItem(id).preview).toBe(true)
  const offer = round.offers.find(entry => entry.id === 'balsam')
  const garment = sourceItem('20520532')
  const items = offer.items.filter(item => item.preview).map(item => ({ ...shirt, ...item, model: shirt.model }))
  await setup(page, { items, loggedIn: false })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(`**/api/shop/items/${garment.id}?**`, async route => {
    await gate
    return route.fallback()
  })
  await page.goto('/shop/encore')
  await page.getByRole('searchbox', { name: '판매 아이템 이름 검색' }).fill(offer.name)
  await page.getByRole('button', { name: `${offer.name} 미리보기`, exact: true }).click()
  const preview = width === 390 ? page.getByRole('dialog', { name: '의상 미리보기' }) : page.getByRole('complementary', { name: '착용 미리보기' })
  await expect(preview.getByText('의상을 불러오는 중입니다.')).toBeVisible()
  const stage = await watchLayout(page, ['.encore-preview-heading', '.encore-stage', '.encore-preview-controls'])
  await stage.expectStable()
  release()
  await expect(preview.locator('.shop-stage-status')).toHaveText('')
  await stage.expectStable()
  await stage.stop()
  await preview.getByText('구성 아이템', { exact: false }).click()
  const part = preview.getByRole('button', { name: new RegExp(garment.name.replace(/[()]/g, '\\$&')) })
  await part.click()
  await expect(part).toHaveAttribute('aria-pressed', 'true')
  await expect(preview.locator('canvas')).toBeVisible()
})

for (const width of [1440, 390]) test(`Encore navigation, stable loading and set preview at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const mobile = width <= 800
  let releaseCatalog, releaseModels, releaseEffect
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
  const modelGate = new Promise(resolve => { releaseModels = resolve })
  const effectGate = new Promise(resolve => { releaseEffect = resolve })
  const requests = await setup(page, { items: wearable, loggedIn: false, admin: false, modelGate })
  for (const id of ['1200116', '1200127']) {
    const { effectPreview } = sourceItem(id)
    await page.route('**' + effectPreview.model, route => route.fulfill({ json: { ...mesh, texture_revision: version } }))
    await page.route('**' + effectPreview.animation, async route => {
      if (id === '1200116') await effectGate
      await route.fulfill({ json: standAloneMotion })
    })
    await page.route('**' + effectPreview.particles, route => route.fulfill({ json: standAloneParticles }))
  }
  await page.route(/\/encore-shop(?:-[\w-]+)?\.json(?:\?.*)?$/, async route => {
    if (route.request().resourceType() !== 'fetch') return route.fallback()
    await catalogGate
    const offers = round.offers.map(offer => ({ ...offer, items: offer.items.map(item =>
      item.effectPreview ? { ...item, effectPreview: { ...item.effectPreview, duration: .6 } } : item) }))
    await route.fulfill({ json: { ...round, offers, catalogVersion: version } })
  })
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: '아이템 상점', exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: '주요 페이지', exact: true })
  await expect(nav.locator('.archive-primary-item')).toHaveText(['한국 서버 음악', '중국 서버 음악', '앙코르 상점', '상점', '마이홈'])
  await nav.getByRole('link', { name: '앙코르 상점', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/encore$/)
  await expect(nav.getByRole('link', { name: '앙코르 상점', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('판매 목록을 불러오는 중입니다.')).toBeVisible()
  const layout = await watchLayout(page, ['.encore-round', '.encore-toolbar', '.encore-list-heading'])
  await layout.expectStable()
  releaseCatalog()
  await expect(page.getByText('2026년 11월 회차')).toBeVisible()
  await expect(page.locator('.encore-offer')).toHaveCount(26)
  await layout.expectStable()
  await layout.stop()

  const open = page.getByRole('button', { name: setName + ' 미리보기', exact: true })
  if (mobile) await open.click()
  const preview = mobile ? page.getByRole('dialog', { name: '의상 미리보기' }) : page.getByRole('complementary', { name: '착용 미리보기' })
  await expect(preview.getByRole('heading', { name: setName })).toBeVisible()
  const stage = await watchLayout(page, ['.encore-preview-heading', '.encore-stage', '.encore-preview-controls', '.encore-parts summary'])
  await expect(preview.locator('.shop-stage-status')).toContainText(/불러오는|준비/)
  await stage.expectStable()
  releaseModels()
  await expect(preview.locator('.shop-stage-status')).toBeEmpty()
  await stage.expectStable()
  await stage.stop()
  await preview.getByRole('button', { name: '남성', exact: true }).click()
  await preview.getByText('구성 아이템', { exact: false }).click()
  await preview.getByRole('button', { name: /블랙 수트 머리\(남\)/ }).click()
  await expect(preview.getByRole('button', { name: /블랙 수트 머리\(남\)/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview.locator('canvas')).toBeVisible()
  if (mobile) {
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()
  }
  const search = page.getByRole('searchbox', { name: '판매 아이템 이름 검색', exact: true })
  await search.fill('블랙 드레스 치마')
  await expect(page.locator('.encore-offer')).toHaveCount(1)
  await search.clear()
  await page.getByRole('button', { name: '기능성', exact: true }).click()
  await expect(page.locator('.encore-offer')).toHaveCount(7)
  const motion = page.getByRole('button', { name: '릴리 앤 리본 미리보기', exact: true })
  await motion.click()
  await expect(preview.getByRole('button', { name: '커플 모션 미리보기' })).toHaveAttribute('aria-haspopup', 'dialog')
  if (mobile) await page.keyboard.press('Escape')
  for (const [name, id] of [['찬란한 별', '1200116'], ['별의 동공', '1200127']]) {
    const card = page.getByRole('button', { name: name + ' 미리보기', exact: true })
    if (id === '1200116') await expect(card.locator('img')).toHaveAttribute('src', /688f9705d31ff67f95d0bb5d42a083957/)
    await card.click()
    const canvas = preview.getByRole('img', { name: '단짝 효과 3D 미리보기', exact: true })
    if (id === '1200116') {
      await expect(preview.locator('.shop-stage-status')).toContainText('준비 중')
      const pending = await watchLayout(page, ['.encore-preview-heading', '.encore-stage', '.encore-preview-controls'])
      await pending.expectStable()
      releaseEffect()
      await expect(preview.locator('.shop-stage-status')).toBeEmpty()
      await pending.expectStable()
      await pending.stop()
    }
    await expect(canvas).toHaveAttribute('data-ornament-frame', /[01]/)
    const frame = await canvas.getAttribute('data-ornament-frame')
    await expect(canvas).not.toHaveAttribute('data-ornament-frame', frame, { timeout: 12000 })
    await preview.getByRole('button', { name: '일시정지', exact: true }).click()
    const paused = await canvas.getAttribute('data-ornament-frame')
    await waitForFrames(page)
    await expect(canvas).toHaveAttribute('data-ornament-frame', paused)
    if (mobile) await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: '백금성령 미리보기', exact: true }).click()
  await expect(preview.getByRole('button', { name: '커플 모션 미리보기' })).toBeEnabled()
  if (mobile) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '섬 여행 닉네임팩 미리보기', exact: true }).click()
  const sprite = preview.locator('.encore-image-stage img')
  await expect(sprite).toHaveAttribute('src', sourceItem('11000464').imagePreview.variants[0].url)
  await preview.getByRole('button', { name: '채팅', exact: true }).click()
  await expect(sprite).toHaveAttribute('src', sourceItem('11000464').imagePreview.variants[1].url)
  if (mobile) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '동적 캐릭터 슬롯-바다풍경 미리보기', exact: true }).click()
  const ocean = sourceItem('11000694').imagePreview
  await expect(sprite).toHaveAttribute('src', ocean.animated)
  await preview.getByRole('button', { name: '일시정지', exact: true }).click()
  await expect(sprite).toHaveAttribute('src', ocean.still)
  if (mobile) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '펫·효과', exact: true }).click()
  await expect(page.locator('.encore-offer')).toHaveCount(3)
  for (const [name, id] of [['슬라임 보글보글', 11000673], ['캐릭터 효과-별이 빛나는', 11000463], ['파란 토끼/빨간 토끼', 600515]]) {
    await page.getByRole('button', { name: name + ' 미리보기', exact: true }).click()
    await expect(preview.locator('.shop-stage-status')).toBeEmpty()
    expect(requests).toContain(`/api/shop/items/${id}`)
    if (mobile) await page.keyboard.press('Escape')
  }
  await expect(page.getByText(/할인율|습득확률/)).toHaveCount(0)
})
