import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { setup, shirt, version, openShopFilters } from './shopFixtures.js'
import { watchLayout } from './layout.js'

const release = JSON.parse(readFileSync(new URL('../fixtures/shop-release-2026-11-19.json', import.meta.url), 'utf8'))
const items = release.map(row => ({ ...row, id: String(row.id), version, thumbnail: null, model: row.preview_available ? shirt.model : null }))

for (const width of [1440, 390]) test(`November 19 hidden items and renamed outfits retain availability and selection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await setup(page, { items, loggedIn: false, admin: false })
  let releaseSearch, waiting = false
  const gate = new Promise(resolve => { releaseSearch = resolve })
  await page.route('**/api/shop/items?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === '조이') { waiting = true; await gate }
    await route.fallback()
  })
  await page.goto('/shop?sex=male')
  await expect(page.locator('.shop-grid')).toBeVisible()
  await openShopFilters(page)
  await page.getByRole('checkbox', { name: '미출시 아이템 가리기', exact: true }).uncheck()
  const search = page.getByRole('searchbox', { name: '아이템 이름으로 검색', exact: true })
  await search.scrollIntoViewIfNeeded()
  const layout = await watchLayout(page, ['.shop-header', '.shop-search-tools', '.shop-departments'])
  await search.fill('조이'); await expect.poll(() => waiting).toBe(true); await layout.expectStable()
  releaseSearch(); await expect(page.locator('.shop-card')).toHaveCount(4); await layout.expectStable(); await layout.stop()
  const hair = page.locator('[data-item-id="30210534"]')
  await expect(hair).toContainText('조이 브라운 헤어(남)')
  await expect(hair).toContainText('미출시')
  await hair.locator('.shop-card-select').click()
  await expect(hair.locator('.shop-card-select')).toHaveAttribute('aria-pressed', 'true')
  await search.fill('살구곰')
  await expect(page.locator('.shop-card')).toHaveCount(0)
  await openShopFilters(page)
  await page.getByRole('checkbox', { name: '미리보기 불가능 아이템 가리기', exact: true }).uncheck()
  const pet = page.locator('[data-item-id="600525"]')
  await expect(pet).toBeVisible(); await expect(pet).toContainText('살구곰/블루베리곰')
  await expect(pet).toContainText('미리보기 불가능')
  await search.fill('고결한 천사')
  await expect(page.locator('[data-item-id="11000986"]')).toContainText('고결한 천사의 날개')
  await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
  for (const [query, id] of [['환영수정', '30860'], ['강아지 귀', '1200165']]) {
    await search.fill(query)
    await expect(page.locator(`[data-item-id="${id}"]`)).toBeVisible()
    await expect(page.locator(`[data-item-id="${id}"]`)).toContainText('미출시')
  }
})
