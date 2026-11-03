import { expect, test } from '@playwright/test'
import { setup, shirt, version, root } from './shopFixtures.js'
import { watchLayout } from './layout.js'

async function openSearch(page) {
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 600
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'pink'; ctx.fillRect(0, 0, 300, 600)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await modal.getByLabel('검색 이미지', { exact: true }).setInputFiles({ name: 'character.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') })
  await modal.getByRole('button', { name: '전체 이미지 사용', exact: true }).click()
  await modal.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('female')
  return modal
}

for (const width of [1440, 390]) {
  test(`remaining estimate stays stable through overrun and minimized restore at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.clock.install()
    await setup(page, { admin: false })
    let estimateCalls = 0, release
    await page.route('**/api/shop/image-search/estimate?*', route => { estimateCalls++; return route.fulfill({ json: { min_seconds: 8, max_seconds: 18 } }) })
    await page.route('**/api/shop/image-search', async route => {
      await new Promise(resolve => { release = resolve })
      return route.fulfill({ json: { version, sex: 'female', groups: [], items: [] } })
    })
    const modal = await openSearch(page)
    await expect.poll(() => estimateCalls).toBeGreaterThan(0)
    const initialEstimateCalls = estimateCalls
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).scrollIntoViewIfNeeded()
    const watch = await watchLayout(page, ['.shop-image-search-submit', '.shop-image-search-status', '.shop-image-search-actions'])
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    await expect(modal.locator('.shop-image-search-status')).toContainText('예상 남은 시간 약 8~18초')
    await page.clock.fastForward(5000)
    await expect(modal.locator('.shop-image-search-status')).toContainText('약 3~13초')
    await watch.expectStable(); await watch.stop()
    await modal.getByRole('button', { name: '이미지 검색 최소화' }).click()
    await page.clock.fastForward(14000)
    await page.getByRole('button', { name: /이미지 검색 다시 열기/ }).click()
    await expect(modal.locator('.shop-image-search-status')).toContainText('예상보다 오래 걸리고 있습니다.')
    expect(estimateCalls).toBe(initialEstimateCalls)
    release()
    await expect(modal.getByRole('button', { name: '다시 찾기', exact: true })).toBeVisible()
    await expect(modal.locator('.shop-image-search-status')).not.toContainText('예상 남은 시간')
  })

  test(`unreleased models apply while missing models are explicitly identified at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const usable = { ...shirt, id: '321', name: '모델 있는 미출시 머리', slot: 'hair', sex: 'female', is_unreleased: true, model: `${root}/models/${'d'.repeat(64)}.json.gz` }
    const missing = { ...shirt, id: '322', name: '모델 없는 미출시 상의', sex: 'female', is_unreleased: true, preview_available: false, model: null }
    const requests = await setup(page, { admin: false, items: [usable, missing] })
    await page.route('**/api/shop/image-search/estimate?*', route => route.fulfill({ status: 503, json: {} }))
    await page.route('**/api/shop/image-search', route => route.fulfill({ json: { version, sex: 'female', items: [usable, missing], groups: [{ slot: 'hair', items: [usable] }, { slot: 'top', items: [missing] }] } }))
    const modal = await openSearch(page)
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    await expect(modal.getByRole('button', { name: `${missing.name} 선택`, exact: true })).toContainText('미리보기 불가')
    await modal.getByRole('button', { name: `${missing.name} 선택`, exact: true }).click()
    await modal.getByRole('button', { name: '해당 의상 입어보기', exact: true }).click()
    await expect(modal).toBeVisible()
    await expect(modal.locator('.shop-image-search-status')).toContainText('3D 모델이 없어 입어볼 수 없습니다')
    await modal.getByRole('button', { name: `${usable.name} 선택`, exact: true }).click()
    await modal.getByRole('button', { name: '해당 의상 입어보기', exact: true }).scrollIntoViewIfNeeded()
    const scroll = await modal.evaluate(node => node.scrollTop)
    const originalUrl = page.url()
    await modal.getByRole('button', { name: '해당 의상 입어보기', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '의상 미리보기', exact: true })
    await expect(preview).toBeVisible()
    await expect(preview.locator('.shop-image-preview-warning')).toContainText(missing.name)
    await expect(preview.locator('.shop-stage-status')).toBeEmpty()
    await expect(preview.locator('canvas')).toHaveAttribute('data-view-angle', '180')
    expect(requests).toContain(usable.model)
    await expect(preview.locator('.shop-image-preview-items').getByText(usable.name, { exact: true })).toHaveCount(1)
    await expect(preview.locator('.shop-image-preview-items').getByText(missing.name, { exact: true })).toHaveCount(0)
    await expect(modal).toBeVisible()
    await expect(page.getByRole('button', { name: /이미지 검색 다시 열기/ })).toHaveCount(0)
    expect(page.url()).toBe(originalUrl)
    await preview.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
    await expect(preview).toHaveCount(0)
    await expect(modal).toBeVisible()
    expect(await modal.evaluate(node => node.scrollTop)).toBe(scroll)
    await expect(modal.getByRole('button', { name: `${usable.name} 선택`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await modal.getByRole('button', { name: `${missing.name} 선택`, exact: true }).click()
    await modal.getByRole('button', { name: '해당 의상 입어보기', exact: true }).click()
    await expect(preview.locator('.shop-image-preview-warning')).toHaveCount(0)
    await expect(preview.locator('.shop-image-preview-items').getByText(usable.name, { exact: true })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)
    await expect(modal).toBeVisible()
    await expect(modal).toHaveJSProperty('open', true)
  })
}
