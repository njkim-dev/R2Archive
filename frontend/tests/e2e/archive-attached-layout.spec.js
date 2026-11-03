import { test, expect } from '@playwright/test'
import { setup } from './shopFixtures.js'
import { watchLayout } from './layout.js'

for (const width of [2560, 1920, 1024, 390]) test(`shop and myhome keep navigation beside their centered content at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await setup(page, { authGate: gate })
  await page.goto('/shop')
  await expect(page.locator('.shop-main')).toBeVisible()
  const mobile = width <= 800
  const check = async () => {
    const frame = await page.locator('.archive-page-layout').boundingBox()
    const body = await page.locator('.shop-main').boundingBox()
    expect(frame.width).toBeCloseTo(Math.min(width, 1648), 1)
    expect(frame.x).toBeCloseTo((width - frame.width) / 2, 1)
    expect(body.width).toBeCloseTo(mobile ? width : Math.min(1440, width - 208), 1)
    const header = await page.locator('.archive-page-topbar').boundingBox()
    expect(header.x).toBeCloseTo(body.x, 1)
    expect(header.width).toBeCloseTo(body.width, 1)
    if (!mobile) {
      const menu = await page.locator('.archive-page-layout>.archive-sidebar').boundingBox()
      expect(menu.x).toBeCloseTo(frame.x, 1)
      expect(menu.x + menu.width).toBeCloseTo(body.x, 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  }
  await check()
  const pending = await watchLayout(page, mobile ? ['.archive-mobile-header', '.archive-mobile-bottom', '.archive-page-topbar'] : ['.archive-page-layout>.archive-sidebar', '.archive-page-topbar', '.shop-search'])
  release()
  await expect(page.getByRole('button', { name: '마이홈', exact: true })).toBeEnabled()
  await pending.expectStable()
  await pending.stop()
  await check()
  if (!mobile) {
    await page.evaluate(() => { document.body.style.paddingRight = '17px' })
    const paddedMenu = await page.locator('.archive-page-layout>.archive-sidebar').boundingBox(), paddedBody = await page.locator('.shop-main').boundingBox()
    expect(paddedMenu.x + paddedMenu.width).toBeCloseTo(paddedBody.x, 1)
    await page.evaluate(() => { document.body.style.paddingRight = ''; scrollTo(0, 300) })
    expect((await page.locator('.archive-page-layout>.archive-sidebar').boundingBox()).y).toBe(0)
    await page.evaluate(() => scrollTo(0, 0))
  }
  await check()
  await page.screenshot({ path: test.info().outputPath(`attached-shop-${width}.png`) })
  await page.getByRole('button', { name: '마이홈', exact: true }).click()
  await expect(page.getByRole('button', { name: '남성캐릭터 캐릭터 선택', exact: true })).toBeVisible()
  await check()
  await page.screenshot({ path: test.info().outputPath(`attached-myhome-${width}.png`) })
})
