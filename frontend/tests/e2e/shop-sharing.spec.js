import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'
import { setup, version, shirt, pet, copiedShopUrl } from './shopFixtures.js'

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('short links and live public homes preserve outfits while save and removal controls stay stable', async ({ page }) => {
  const narrow = test.info().project.use.viewport.width <= 768
  await page.setViewportSize({ width: narrow ? 320 : 1440, height: 1000 })
  const requests = await setup(page, { items: [shirt, pet] })
  let handle = null, releaseCheck, releaseSave
  const checkGate = new Promise(resolve => { releaseCheck = resolve }), saveGate = new Promise(resolve => { releaseSave = resolve })
  await page.route('**/api/share/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method()
    if (path === '/api/share/myhome/check') {
      if (url.searchParams.get('handle') !== 'Taken') await checkGate
      return route.fulfill({ json: { available: url.searchParams.get('handle') !== 'Taken' } })
    }
    if (path === '/api/share/myhome') {
      if (method === 'PUT') handle = route.request().postDataJSON().handle
      if (method === 'DELETE') handle = null
      return route.fulfill({ json: { handle } })
    }
    if (path.startsWith('/api/share/homes/')) return handle ? route.fulfill({ json: { handle, ...requests.wardrobe() } }) : route.fulfill({ status: 404, json: { detail: '존재하지 않거나 공유가 해제된 마이홈입니다' } })
    return route.fallback()
  })
  await page.route('**/api/shop/wardrobe/200?**', async route => { if (route.request().method() === 'POST') await saveGate; return route.fallback() })
  await page.goto(`/shop?view=preview&v=${version}&sex=male&top=200&pet=300&pair=0&angle=180&zoom=100&panX=5&panY=-3`)
  const preview = page.getByRole('dialog', { name: '의상 미리보기', exact: true })
  await expect(preview).toBeVisible()
  await expect(page.locator('.shop-stage-status')).toHaveText('')
  const panel = page.getByRole('dialog', { name: '아이템 현황', exact: true })
  if (narrow) await preview.getByRole('button', { name: '아이템 현황', exact: true }).click()
  const top = page.getByRole('button', { name: '상의 내 의상으로 저장', exact: true })
  await expect(top).toBeEnabled(); await top.scrollIntoViewIfNeeded()
  let watcher = await watchLayout(page, ['.shop-slots', '.shop-slot-actions'])
  await top.click(); await expect(top).toBeDisabled(); await watcher.expectStable()
  releaseSave(); await expect(top).toHaveText('저장됨'); await watcher.expectStable(); await watcher.stop()
  if (narrow) await panel.getByRole('button', { name: '아이템 현황 닫기', exact: true }).click()
  await preview.getByRole('button', { name: '전부 내 의상으로 저장', exact: true }).click()
  await expect.poll(() => requests.wardrobe().ids.sort()).toEqual(['200','300'])
  const bulk = await preview.getByRole('button', { name: '전부 내 의상으로 저장', exact: true }).boundingBox(), copy = await preview.getByRole('button', { name: '의상 URL 복사', exact: true }).boundingBox()
  expect(bulk.x + bulk.width).toBeLessThanOrEqual(copy.x + 1)
  await page.screenshot({ path: test.info().outputPath('preview-save-controls.png'), fullPage: true })
  await preview.getByRole('button', { name: '의상 URL 복사', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__copiedShopUrl)).toMatch(/^https:\/\/r2archive\.com\/short\/[a-z0-9]{4}$/)
  const shortUrl = await page.evaluate(() => window.__copiedShopUrl), decoded = await copiedShopUrl(page)
  expect(Object.fromEntries(decoded.searchParams)).toMatchObject({ view:'preview',sex:'male',top:'200',pet:'300',angle:'180',zoom:'100',panX:'5',panY:'-3' })
  await preview.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
  await page.getByRole('tab', { name: '마이홈', exact: true }).click()
  await expect(page.getByRole('button', { name: '메인으로 지정', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '내 마이홈 URL 제거', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '내 마이홈 URL 복사', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '내 마이홈 복사', exact: true }), input = dialog.getByLabel('원하는 ID를 입력하세요.')
  await input.fill('가나다라마바사')
  await expect(dialog.getByRole('button', { name: 'URL 생성ㆍ복사', exact: true })).toBeDisabled()
  await input.fill('Taken'); await expect(dialog.locator('.shop-home-id-status')).toHaveText('이미 사용 중인 ID입니다.')
  watcher = await watchLayout(page, ['.shop-home-id-dialog', '#shop-home-id', '.shop-home-id-dialog form>div'])
  await input.fill('내집[1]'); await expect(dialog.locator('.shop-home-id-status')).toHaveText('중복 확인 중입니다.'); await watcher.expectStable()
  releaseCheck(); await expect(dialog.locator('.shop-home-id-status')).toHaveText('사용할 수 있는 ID입니다.'); await watcher.expectStable(); await watcher.stop()
  await dialog.getByRole('button', { name: 'URL 생성ㆍ복사', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__copiedShopUrl)).toBe('https://r2archive.com/myhome/' + encodeURIComponent('내집[1]'))
  await expect(page.getByRole('button', { name: '내 마이홈 URL 제거', exact: true })).toBeVisible()
  await page.locator('[data-item-id="300"]').getByRole('button', { name: '내 의상에서 제거', exact: true }).click()
  await expect(page.locator('[data-item-id="300"]')).toHaveCount(0)
  await page.goto('/myhome/' + encodeURIComponent('내집[1]'))
  await expect(page.getByRole('heading', { name: '내집[1]님의 마이홈', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  await expect(page.locator('.shop-card')).toHaveCount(1)
  await expect(page.locator('[data-item-id="200"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '내 의상에서 제거', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '내 마이홈 URL 제거', exact: true })).toHaveCount(0)
  await page.goto('/shop?sex=male'); await page.getByRole('tab', { name: '마이홈', exact: true }).click()
  await page.getByRole('button', { name: '내 마이홈 URL 제거', exact: true }).click()
  await expect(page.getByRole('button', { name: '내 마이홈 URL 제거', exact: true })).toHaveCount(0)
  await page.goto('/myhome/' + encodeURIComponent('내집[1]'))
  await expect(page.getByRole('alert')).toHaveText('존재하지 않거나 공유가 해제된 마이홈입니다')
  await page.route('https://r2archive.com/shop?**', route => route.fulfill({ body:'<p>Shared outfit</p>',contentType:'text/html' }))
  await page.goto(new URL(shortUrl).pathname)
  await page.waitForURL('https://r2archive.com/shop?**')
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ top:'200',pet:'300',view:'preview',panX:'5',panY:'-3' })
})
