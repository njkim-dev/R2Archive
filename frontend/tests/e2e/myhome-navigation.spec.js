import { test, expect } from '@playwright/test'
import { setup } from './shopFixtures.js'
import { watchLayout } from './layout.js'

for (const width of [1440, 390]) test(`myhome character shortcuts load without moving content and navigate at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page, { characters: [{ id: '1', name: 'A', sex: 'male', ids: ['200'] }, { id: '2', name: 'B', sex: 'female', ids: ['201'] }] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/shop/characters?**', async route => { await gate; await route.fallback() })
  await page.goto('/myhome')
  await expect(page.locator('.shop-character-home h1')).toBeVisible()
  const mobile = width < 801
  const openMenu = async () => { if (mobile) await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click() }
  await openMenu()
  const menu = page.getByRole('navigation', { name: '마이홈 메뉴', exact: true })
  await expect(menu.getByRole('link')).toHaveText(['내 캐릭터', '모든 의상'])
  const watcher = await watchLayout(page, mobile ? ['.archive-mobile-header', '.archive-mobile-bottom', '.shop-character-home h1'] : ['.archive-sidebar .archive-primary-nav', '.shop-header', '.shop-character-home h1'])
  release()
  await expect(menu.getByRole('link')).toHaveText(['내 캐릭터', 'A 의상', 'B 의상', '모든 의상'])
  await watcher.expectStable()
  await watcher.stop()
  for (const [name, id] of [['A', '1'], ['B', '2']]) {
    const link = menu.getByRole('link', { name: `${name} 의상`, exact: true })
    await expect(link.locator('svg')).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/myhome/characters/${id}$`))
    await expect(page.getByRole('heading', { name: `${name}의 마이홈`, exact: true })).toBeVisible()
    if (mobile) await expect(page.getByRole('dialog', { name: '전체 메뉴', exact: true })).toBeHidden()
    await openMenu()
    await expect(menu.getByRole('link', { name: `${name} 의상`, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(menu.getByRole('link', { name: '내 캐릭터', exact: true })).not.toHaveAttribute('aria-current', 'page')
  }
  await menu.getByRole('link', { name: '모든 의상', exact: true }).click()
  await expect(page).toHaveURL(/\/myhome\/characters\/all$/)
  await openMenu()
  await expect(menu.getByRole('link', { name: '모든 의상', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(menu.getByRole('link')).toHaveText(['내 캐릭터', 'A 의상', 'B 의상', '모든 의상'])
  await page.screenshot({ path: test.info().outputPath(`myhome-character-navigation-${width}.png`) })
})
