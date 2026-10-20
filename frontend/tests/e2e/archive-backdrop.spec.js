import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = { id: 1, name: '배경 가독성 확인', artist: 'Test', level: 8, bpm: 160, combo: 100, time: '1:00', image: '', youtube_url: '', file_order: 1, aliases: [], artist_aliases: [], user_level_votes: 0 }
for (const host of ['music.r2archive.com', 'xyx.r2archive.com']) {
  test(`${host} artwork stays behind opaque content without moving the loading catalog`, async ({ page, baseURL }, testInfo) => {
    const width = testInfo.project.name.endsWith('768') ? 390 : testInfo.project.use.viewport.width
    await page.setViewportSize({ width, height: 900 })
    const mobile = width < (host.startsWith('xyx') ? 1100 : 768)
    let releaseImage, releaseCatalog
    const imageGate = new Promise(resolve => { releaseImage = resolve })
    const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
    await page.route(`http://${host}/**`, async route => {
      const url = new URL(route.request().url())
      const pathname = url.pathname.replace('/api/xyx/', '/api/')
      if (pathname.startsWith('/api/')) {
        let json = []
        if (pathname === '/api/songs') { await catalogGate; json = [song] }
        else if (pathname === '/api/meta') json = { total_count: 1, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
        else if (pathname === '/api/auth/me') json = { user: null }
        else if (pathname.endsWith('/admin-status')) json = { is_admin: false }
        else if (pathname.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
        return route.fulfill({ json })
      }
      if (route.request().resourceType() === 'image' && url.pathname.includes('r2beat-aquarium')) await imageGate
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    })
    await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' })
    const layer = page.locator('.archive-backdrop')
    await expect(layer).toHaveCount(1)
    await expect(layer).toHaveAttribute('aria-hidden', 'true')
    const panel = mobile ? '.app-mobile' : '.app > .main'
    await expect(page.locator(panel)).toBeVisible()
    const watcher = await watchLayout(page, mobile ? ['.mob-top', '.app-mobile'] : ['.side', '.topbar', '.main'])
    const style = await layer.evaluate(node => { const s = getComputedStyle(node); return { position: s.position, zIndex: s.zIndex, pointerEvents: s.pointerEvents, image: s.backgroundImage } })
    expect(style.position).toBe('fixed')
    expect(style.zIndex).toBe('-1')
    expect(style.pointerEvents).toBe('none')
    expect(style.image).toContain(width / 900 <= 4 / 3 ? 'aquarium-portrait' : 'aquarium-wide')
    const alpha = await page.locator(panel).evaluate(node => Number(getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1))
    expect(alpha).toBeGreaterThanOrEqual(.85)
    releaseImage()
    await layer.evaluate(async node => {
      const image = new Image()
      image.src = getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1]
      await image.decode()
    })
    await watcher.expectStable()
    releaseCatalog()
    await expect(page.locator(mobile ? '.mob-card' : '.tbl-row')).toHaveCount(1)
    await watcher.expectStable()
    await watcher.stop()
    await expect(page.getByText(song.name, { exact: true })).toBeVisible()
    await page.goto(`http://${host}/personal-categories`)
    await expect(layer).toHaveCount(1)
    await expect(page.locator('.app > .main, .app-mobile')).toBeVisible()
    await expect(layer).toHaveCSS('position', 'fixed')
    await page.unrouteAll({ behavior: 'wait' })
  })
}
