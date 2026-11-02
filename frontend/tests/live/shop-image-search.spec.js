import { expect, test } from '@playwright/test'
import { watchLayout } from '../e2e/layout.js'

test.use({ baseURL: process.env.SHOP_IMAGE_TEST_BASE_URL || 'https://r2archive.com' })

test('uploaded character finds the known head and shirt through local model inference', async ({ page }, info) => {
  test.skip(!process.env.SHOP_IMAGE_TEST_FILE, 'A reference character image is required for this live search check.')
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
  await page.getByLabel('검색 이미지', { exact: true }).setInputFiles(process.env.SHOP_IMAGE_TEST_FILE)
  const source = modal.getByAltText('검색할 영역을 선택하는 원본 이미지')
  await expect(source).toBeVisible()
  const checks = []
  for (const item of [
    { slot: 'hair', id: '20210405', name: '고양이 파티2 머리(남)', region: [.194, .001, .724, .332] },
    { slot: 'top', id: '30310765', name: '토끼 민트 상의(남)', region: [.141, .316, .820, .641] },
  ]) {
    await modal.getByLabel('찾을 부위', { exact: true }).selectOption(item.slot)
    await source.scrollIntoViewIfNeeded()
    const bounds = await source.boundingBox(), [left, top, right, bottom] = item.region
    await page.mouse.move(bounds.x + bounds.width * left, bounds.y + bounds.height * top)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width * right, bounds.y + bounds.height * bottom, { steps: 4 })
    await page.mouse.up()
    const submit = modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true })
    await submit.scrollIntoViewIfNeeded()
    const watch = await watchLayout(page, ['.shop-image-search-workspace', '.shop-image-search-submit', '.shop-image-search-status', '.shop-image-search-results'])
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shop/image-search' && response.request().method() === 'POST')
    const start = Date.now(); await submit.click(); const response = await pending
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.items[0].id).toBe(item.id)
    await expect(modal.locator('.shop-image-search-results button').first()).toContainText(item.name)
    await watch.expectStable(); await watch.stop()
    await modal.screenshot({ path: info.outputPath(`${item.slot}-results.png`) })
    checks.push({ slot: item.slot, top1_id: result.items[0].id, name: result.items[0].name, milliseconds: Date.now() - start })
  }
  await info.attach('search-results', { body: JSON.stringify(checks, null, 2), contentType: 'application/json' })
  await modal.locator('.shop-image-search-results button').first().click()
  await expect(modal).not.toBeVisible()
})
