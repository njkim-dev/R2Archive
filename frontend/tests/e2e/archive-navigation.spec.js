import { test, expect } from '@playwright/test'
import { setup } from './shopFixtures.js'
import { watchLayout } from './layout.js'

test.afterEach(async ({ page, context }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.unrouteAll({ behavior: 'ignoreErrors' })
})

test('shared feedback link retains the music router and a single visible account control', async ({ page, baseURL }) => {
  if (page.viewportSize().width <= 800) await page.setViewportSize({ width: 390, height: 900 })
  await setup(page, { loggedIn: false, admin: false })
  await page.route(/^https?:\/\/r2archive\.com\//, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) return route.fallback()
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.goto('http://r2archive.com/shop')
  await expect(page.getByRole('heading', { name: '아이템 상점', exact: true })).toBeVisible()
  if (page.viewportSize().width <= 800) await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click()
  await page.getByRole('link', { name: '피드백', exact: true }).click()
  await expect(page).toHaveURL('https://r2archive.com/music/feedback')
  await expect(page.locator('.fb-tabs,.fb-mob-body')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toHaveCount(1)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

for (const width of [1440, 390]) test(`shared service navigation and account resolution remain stable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await setup(page, { authGate: gate })
  await page.goto('/shop')
  await expect(page.locator('.shop-grid')).toBeVisible()
  const home = page.getByRole('button', { name: '마이홈', exact: true })
  await expect(home).toBeDisabled()
  const primary = page.getByRole('navigation', { name: '주요 페이지' })
  await expect(primary).toBeVisible()
  await expect(primary.locator('.archive-primary-item')).toHaveText(['음악', '상점', '마이홈', '게임 복구'])
  await expect(page.locator('.server-switcher,.main-home-link')).toHaveCount(0)
  const primarySelector = width > 800 ? '.archive-mobile-header .archive-desktop-nav' : '.archive-mobile-bottom'
  const watcher = await watchLayout(page, [primarySelector, '.archive-page-topbar', '.shop-grid'])
  release()
  await expect(home).toBeEnabled()
  await expect(page.getByRole('button', { name: '마이페이지', exact: true })).toBeVisible()
  await watcher.expectStable()
  await watcher.stop()
  await home.click()
  await expect(page).toHaveURL(/\/myhome$/)
  await expect(page.getByRole('button', { name: '마이홈', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: '남성캐릭터 캐릭터 선택', exact: true })).toBeVisible()
  if (width <= 800) {
    const trigger = page.getByRole('button', { name: '전체 메뉴 열기', exact: true })
    await trigger.click()
    const drawer = page.getByRole('dialog', { name: '전체 메뉴', exact: true })
    await expect(drawer.getByRole('link', { name: '모든 의상', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await drawer.getByRole('link', { name: '모든 의상', exact: true }).click()
    await expect(page).toHaveURL(/\/myhome\/characters\/all$/)
    await expect(drawer).toBeHidden()
  } else await page.getByRole('link', { name: '모든 의상', exact: true }).click()
  await page.getByRole('link', { name: '상점', exact: true }).click()
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.getByRole('link', { name: '상점', exact: true })).toHaveAttribute('aria-current', 'page')
  if (width <= 800) await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click()
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '전체 메뉴', exact: true })).toBeHidden()
  await expect(page.getByRole('tab', { name: '즐겨찾기', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: test.info().outputPath(`navigation-${width}.png`), fullPage: true })
})

test('music, shop and wardrobe follow system colors without moving navigation or content', async ({ page }) => {
  const mobile = page.viewportSize().width <= 800
  if (mobile) await page.setViewportSize({ width: 390, height: 900 })
  let resolveAuth
  await setup(page, { authGate: new Promise(resolve => { resolveAuth = resolve }) })
  const luminance = async (selector, property) => page.locator(selector).first().evaluate((node, key) => {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = getComputedStyle(node)[key]
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map(v => {
      const s = v / 255
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4
    })
    return .2126 * r + .7152 * g + .0722 * b
  }, property)
  for (const [url, surface, content] of [
    ['/shop', '.archive-page-layout', '.shop-search'],
    ['/myhome', '.archive-page-layout', '.shop-character-cards'],
    ['/music/', mobile ? '.app-mobile' : '.app > .main', mobile ? '.mob-top' : '.topbar'],
  ]) {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url)
    await expect(page.locator(content).first()).toBeVisible()
    const nav = '.archive-mobile-header'
    const layout = await watchLayout(page, [nav, content])
    if (url === '/shop') {
      await expect(page.getByRole('button', { name: '마이홈', exact: true })).toBeDisabled()
      resolveAuth()
      await expect(page.getByRole('button', { name: '마이홈', exact: true })).toBeEnabled()
    }
    for (const theme of ['light','dark','light']) {
      await page.emulateMedia({ colorScheme: theme })
      for (const selector of [surface, nav]) {
        const bg = await luminance(selector, 'backgroundColor')
        const fg = await luminance(selector, 'color')
        if (theme === 'dark') expect(bg).toBeLessThan(.1)
        else expect(bg).toBeGreaterThan(.8)
        expect((Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05)).toBeGreaterThanOrEqual(4.5)
      }
      await layout.expectStable()
    }
    await layout.stop()
  }
})
