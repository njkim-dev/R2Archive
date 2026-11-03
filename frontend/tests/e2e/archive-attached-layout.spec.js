import { test, expect } from '@playwright/test'
import { setup } from './shopFixtures.js'
import { watchLayout } from './layout.js'

for (const width of [2560, 1920, 1024, 390]) test(`music, shop and myhome keep the same navigation position at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await setup(page, { authGate: gate })
  await page.goto('/')
  const mobile = width <= 800
  const selectors = mobile ? ['.archive-mobile-header', '.archive-mobile-bottom'] : ['.archive-sidebar .archive-brand', '.archive-sidebar .archive-primary-nav']
  await expect(page.locator(selectors[0])).toBeVisible()
  const originalNavigation = await page.locator(selectors[1]).boundingBox()
  const transition = await watchLayout(page, selectors)
  await page.getByRole('link', { name: '상점', exact: true }).click()
  await expect(page.locator('.shop-main')).toBeVisible()
  await transition.expectStable()
  await transition.stop()
  const check = async () => {
    expect(await page.locator(selectors[1]).boundingBox()).toEqual(originalNavigation)
    const frame = await page.locator('.archive-page-layout').boundingBox()
    const body = await page.locator('.shop-main').boundingBox()
    expect(frame.width).toBeCloseTo(Math.min(width, 1808), 1)
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
    await page.evaluate(() => { document.documentElement.style.scrollbarGutter = 'stable' })
    expect(await page.locator(selectors[1]).boundingBox()).toEqual(originalNavigation)
    await page.evaluate(() => { document.documentElement.style.scrollbarGutter = '' })
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
  const returnTransition = await watchLayout(page, selectors)
  await page.getByRole('link', { name: '한국 서버 음악', exact: true }).click()
  await expect(page.locator(mobile ? '.app-mobile' : '.app>.main')).toBeVisible()
  await returnTransition.expectStable()
  await returnTransition.stop()
  expect(await page.locator(selectors[1]).boundingBox()).toEqual(originalNavigation)
})
