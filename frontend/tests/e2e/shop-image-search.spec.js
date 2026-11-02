import { expect, test } from '@playwright/test'
import { setup, shirt, version } from './shopFixtures.js'
import { watchLayout } from './layout.js'

async function upload(page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 600
    const context = canvas.getContext('2d'); context.fillStyle = 'pink'; context.fillRect(0, 0, 300, 600)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('검색 이미지', { exact: true }).setInputFiles({ name: 'character.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') })
  await expect(page.getByAltText('검색할 캐릭터 원본 이미지')).toBeVisible()
}

async function pasteImage(page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(async () => {
    delete navigator.clipboard
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 600
    const context = canvas.getContext('2d'); context.fillStyle = 'pink'; context.fillRect(0, 0, 300, 600)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  })
  await page.keyboard.press('Control+V')
  await expect(page.getByAltText('검색할 캐릭터 원본 이미지')).toBeVisible()
}

for (const width of [1440, 390]) {
  for (const loggedIn of [false, true]) {
    test(`image search is hidden for ${loggedIn ? 'members' : 'guests'} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await setup(page, { loggedIn, admin: false })
      await page.goto('/shop?sex=male')
      await expect(page.getByRole('button', { name: loggedIn ? '로그아웃' : '로그인', exact: true }).first()).toBeEnabled()
      await expect(page.getByRole('button', { name: '이미지로 찾기', exact: true })).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: '이미지로 아이템 찾기' })).toHaveCount(0)
    })
  }
  test(`image search upload, pending results, failure, and retry preserve geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const candidate = { ...shirt, version, name: '토끼 민트 상의(남)', is_unreleased: true }
    await setup(page, { admin: true, items: [candidate] })
    let release, requested = false, calls = 0
    await page.route('**/api/shop/image-search', async route => {
      requested = true; calls++
      expect(route.request().headers()['content-type']).toContain('multipart/form-data')
      expect(route.request().postDataBuffer().toString('latin1')).toContain('name="image"')
      expect(route.request().postDataBuffer().toString('latin1')).toContain('\r\nterra\r\n')
      expect(route.request().postDataBuffer().toString('latin1')).toContain('\r\nauto\r\n')
      await new Promise(resolve => { release = resolve })
      return calls === 1 ? route.fulfill({ status: 429, json: { error: 'Rate limit exceeded' } }) : route.fulfill({ json: { items: [candidate], version,
        groups: ['hair', 'top', 'bottom', 'shoes'].map(slot => ({ slot, items: slot === 'top' ? [candidate] : [], exact_match_supported: slot === 'top' })) } })
    })
    await page.goto('/shop?sex=male')
    await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
    await expect(modal).toBeVisible()
    await pasteImage(page)
    await expect(modal.getByLabel('찾을 부위', { exact: true })).toHaveValue('all')
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).scrollIntoViewIfNeeded()
    const watch = await watchLayout(page, ['.shop-image-search-workspace', '.shop-image-search-controls', '.shop-image-search-submit', '.shop-image-search-status', '.shop-image-search-results'])
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    await expect.poll(() => requested).toBe(true)
    await watch.expectStable()
    release()
    await expect(modal.getByRole('alert')).toContainText('검색 요청이 많습니다')
    await watch.expectStable()
    requested = false
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    await expect.poll(() => requested).toBe(true)
    await watch.expectStable()
    release()
    await expect(modal.getByRole('button', { name: /토끼 민트 상의/ })).toBeVisible()
    await expect(modal.getByRole('heading', { level: 3 })).toHaveCount(4)
    await watch.expectStable(); await watch.stop()
    await modal.getByRole('button', { name: /토끼 민트 상의/ }).click()
    await expect(modal).not.toBeVisible()
    await expect(page.getByRole('checkbox', { name: '미출시 아이템 가리기', exact: true })).not.toBeChecked()
    await expect(page.locator('.shop-selected-outfit, .shop-panel').getByText('토끼 민트 상의(남)', { exact: true }).first()).toBeVisible()
  })
  test(`image result without a preview opens item details and clears unrelated filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const candidate = { ...shirt, id: '202', sex: 'female', name: '미리보기 없는 검색 상의', model: null, preview_available: false }
    await setup(page, { admin: true, items: [candidate] })
    await page.route('**/api/shop/image-search', route => route.fulfill({ json: { items: [candidate], version } }))
    await page.goto('/shop?sex=male')
    await page.getByRole('tab', { name: '기능성ㆍ소모품', exact: true }).click()
    await page.getByRole('searchbox', { name: '아이템 이름으로 검색', exact: true }).fill('기존 검색어')
    await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
    await upload(page)
    await modal.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('female')
    await modal.getByLabel('찾을 부위', { exact: true }).selectOption('top')
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    await modal.getByRole('button', { name: /미리보기 없는 검색 상의/ }).click()
    await expect(modal).not.toBeVisible()
    await expect(page.getByRole('searchbox', { name: '아이템 이름으로 검색', exact: true })).toHaveValue('')
    await expect(page.getByRole('checkbox', { name: '미리보기 불가능 아이템 가리기', exact: true })).not.toBeChecked()
    await expect(page.locator('.shop-detail h3')).toHaveText(candidate.name)
    await expect(page.locator('.shop-detail')).toBeVisible()
  })
}
