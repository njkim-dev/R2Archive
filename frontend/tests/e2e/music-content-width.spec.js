import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = { id: 1, name: 'Centered Catalog', artist: 'Test', level: 8, bpm: 160, combo: 700, time: '2:00', image: '', youtube_url: '', file_order: 1, aliases: [], artist_aliases: [], user_level_votes: 0 }

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

for (const width of [2560, 1920, 1024, 390]) test(`music content stays centered and capped with a left anchored menu at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let releaseSongs, releaseDetail, detailRequested = false
  const songsGate = new Promise(resolve => { releaseSongs = resolve })
  const detailGate = new Promise(resolve => { releaseDetail = resolve })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let json = []
    if (path === '/api/songs') { await songsGate; json = [song] }
    else if (path === '/api/songs/1') { detailRequested = true; await detailGate; json = { ...song, bpm_timeline: [], play_count_week: 0 } }
    else if (path === '/api/meta') json = { total_count: 1, level_min: .5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') json = { user: null }
    else if (path.endsWith('/admin-status')) json = { is_admin: false }
    else if (path.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
    else if (path.endsWith('/perceived/mine')) json = {}
    else if (path.endsWith('/perceived/stats')) json = { avg: null, total: 0, distribution: [], mine: null }
    await route.fulfill({ json })
  })
  await page.goto('/')
  const mobile = width < 768
  const content = page.locator(mobile ? '.app-mobile' : '.app>.main')
  await expect(content).toBeVisible()
  const before = await content.boundingBox()
  const expectedWidth = mobile ? width : Math.min(1600, width - 208)
  expect(before.width).toBeCloseTo(expectedWidth, 1)
  expect(before.x).toBeCloseTo(mobile ? 0 : 208 + (width - 208 - expectedWidth) / 2, 1)
  if (!mobile) expect((await page.locator('.app>.archive-sidebar').boundingBox()).x).toBe(0)
  const loading = await watchLayout(page, mobile ? ['.app-mobile', '.mob-top', '.archive-mobile-bottom'] : ['.app>.main', '.topbar', '.app>.archive-sidebar'])
  await loading.expectStable()
  releaseSongs()
  await expect(page.locator('[data-song-id="1"]')).toBeVisible()
  await loading.expectStable()
  await loading.stop()
  expect(await content.boundingBox()).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  if (mobile) return
  await page.locator('[data-song-id="1"]').click()
  const panel = page.getByRole('complementary', { name: song.name + ' 곡 상세' })
  await expect(panel).toBeVisible()
  await expect.poll(() => detailRequested).toBe(true)
  await panel.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)))
  const mainBox = await content.boundingBox(), panelBox = await panel.boundingBox()
  expect(mainBox.width).toBeLessThanOrEqual(1600)
  expect(mainBox.x + mainBox.width).toBeCloseTo(panelBox.x, 1)
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width)
  if (width > 1100) expect((await page.locator('.app>.archive-sidebar').boundingBox()).x).toBe(0)
  const pending = await watchLayout(page, ['.app>.main', '.topbar', '.table-wrap', '.song-catalog-panel'])
  await pending.expectStable()
  releaseDetail()
  await expect(panel.locator('.m-stats')).toBeVisible()
  await pending.expectStable()
  await pending.stop()
  await panel.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(panel).toHaveCount(0)
  expect(await content.boundingBox()).toEqual(before)
  expect((await page.locator('.app>.archive-sidebar').boundingBox()).x).toBe(0)
  await page.screenshot({ path: test.info().outputPath(`centered-music-${width}.png`) })
})
