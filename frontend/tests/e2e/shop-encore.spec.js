import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { setup, shirt, version } from './shopFixtures.js'
import { watchLayout } from './layout.js'

const round = JSON.parse(readFileSync(new URL('../../src/data/encore-shop.json', import.meta.url), 'utf8'))
const showcase = round.offers[0]
const wearable = [showcase, ...round.offers.filter(offer => offer.kind === 'wearable')]
  .flatMap(offer => offer.items).filter(item => item.preview).map(item => ({
  ...shirt, id: item.id, name: item.name, slot: item.slot, sex: item.sex,
}))
const setName = '블랙 수트 · 블랙 드레스'

for (const width of [1440, 390]) test(`Encore navigation, stable loading and set preview at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const mobile = width <= 800
  let releaseCatalog, releaseModels
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
  const modelGate = new Promise(resolve => { releaseModels = resolve })
  const requests = await setup(page, { items: wearable, loggedIn: false, admin: false, modelGate })
  await page.route(/\/encore-shop(?:-[\w-]+)?\.json(?:\?.*)?$/, async route => {
    if (route.request().resourceType() !== 'fetch') return route.fallback()
    await catalogGate
    await route.fulfill({ json: { ...round, catalogVersion: version } })
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
  await expect(preview.getByRole('link', { name: '커플 모션 미리보기' })).toHaveAttribute('href', /view=couple.*item=30835/)
  if (mobile) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '찬란한 별 미리보기', exact: true }).click()
  await expect(preview.locator('.encore-stage-placeholder img')).toHaveAttribute('src', /688f9705d31ff67f95d0bb5d42a083957/)
  if (mobile) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '백금성령 미리보기', exact: true }).click()
  await expect(preview.getByRole('link', { name: '커플 모션 미리보기' })).toHaveAttribute('href', /view=couple.*item=30810/)
  if (mobile) await page.keyboard.press('Escape')
  for (const [name, id] of [['섬 여행 닉네임팩', 11000464], ['동적 캐릭터 슬롯-바다풍경', 11000694]]) {
    await page.getByRole('button', { name: name + ' 미리보기', exact: true }).click()
    const icon = preview.locator('.encore-stage-placeholder img')
    await expect(icon).toHaveAttribute('src', new RegExp(`/assets/encore-${id}-`))
    await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth === 128)).toBe(true)
    if (mobile) await page.keyboard.press('Escape')
  }
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
