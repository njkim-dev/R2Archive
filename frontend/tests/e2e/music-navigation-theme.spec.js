import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

const songs = [2, 5, 8].map((level, index) => ({ id: index + 1, name: `Theme ${index + 1}`, artist: 'Test', level, bpm: 160, combo: 700, time: '2:00', file_order: index + 1, aliases: [], artist_aliases: [], user_level_votes: 0 }))

for (const width of [1440, 390]) test(`music navigation shares the archive theme while category colors stay distinct at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let json = []
    if (path === '/api/songs') { await gate; json = songs }
    else if (path === '/api/meta') json = { total_count: 3, level_min: .5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') json = { user: null }
    else if (path.endsWith('/admin-status')) json = { is_admin: false }
    else if (path.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
    await route.fulfill({ json })
  })
  await page.goto('/')
  const mobile = width < 768
  const selectors = mobile ? ['.app-mobile', '.mob-top', '.archive-mobile-bottom'] : ['.main', '.topbar', '.archive-sidebar .archive-primary-nav']
  await expect(page.locator(selectors[0])).toBeVisible()
  const loading = await watchLayout(page, selectors)
  release()
  await expect(page.locator('[data-song-id="3"]')).toBeVisible()
  await loading.expectStable()
  await loading.stop()
  const primary = page.getByRole('link', { name: '한국 서버 음악', exact: true })
  const color = await primary.evaluate(node => getComputedStyle(node).color)
  const semantic = []
  for (const [index, key] of ['star', 'moon', 'sun'].entries()) {
    const category = page.locator(mobile ? `.mob-chip[data-channel="${key}"]` : `.archive-sidebar .cat-btn[data-channel="${key}"]`)
    await category.scrollIntoViewIfNeeded()
    const transition = await watchLayout(page, selectors)
    await category.click()
    await expect(category).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(`[data-song-id="${index + 1}"]`)).toBeVisible()
    await category.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))))
    semantic.push(await category.evaluate(node => getComputedStyle(node).color))
    await transition.expectStable()
    await transition.stop()
    if (mobile) await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click()
    const current = page.getByRole('link', { name: '곡 목록', exact: true })
    await expect(current).toBeVisible()
    expect(await current.evaluate(node => getComputedStyle(node).color)).toBe(color)
    if (!mobile) {
      const quick = page.locator('.archive-sidebar .nav button.active')
      expect(await quick.evaluate(node => getComputedStyle(node).color)).toBe(color)
      expect(await current.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(await primary.evaluate(node => getComputedStyle(node).backgroundColor))
      expect(await current.evaluate(node => getComputedStyle(node, '::before').display)).toBe('none')
    }
    if (mobile) await page.keyboard.press('Escape')
  }
  expect(new Set(semantic).size).toBe(3)
  await page.getByRole('button', { name: /^상세 필터/ }).click()
  const dialog = page.getByRole('dialog', { name: '상세 필터', exact: true })
  await expect(dialog).toBeVisible()
  expect(await dialog.locator('input[type="radio"]').first().evaluate(node => getComputedStyle(node).accentColor)).toBe(color)
  await page.screenshot({ path: test.info().outputPath(`music-filter-theme-${width}.png`) })
  await dialog.getByRole('button', { name: '상세 필터 닫기', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click()
  else await page.locator('.archive-sidebar').evaluate(node => { node.scrollTop = 0 })
  await page.screenshot({ path: test.info().outputPath(`music-navigation-theme-${width}.png`) })
})
