import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = { id: 1, name: 'Home Link Test', artist: 'Test', level: 8, bpm: 160, combo: 100, time: '1:00', image: '', youtube_url: '', file_order: 1, aliases: [], artist_aliases: [], user_level_votes: 0 }

for (const host of ['music.r2archive.com', 'xyx.r2archive.com']) {
  test(`${host} sidebar places the main home link above server buttons with stable loading`, async ({ page, baseURL }, testInfo) => {
    const width = testInfo.project.use.viewport.width
    const mobile = width < (host.startsWith('xyx') ? 1100 : 768)
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route(`http://${host}/**`, async route => {
      const url = new URL(route.request().url())
      const pathname = url.pathname.replace('/api/xyx/', '/api/')
      if (pathname.startsWith('/api/')) {
        let json = []
        if (pathname === '/api/songs') { await gate; json = [song] }
        else if (pathname === '/api/meta') json = { total_count: 1, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
        else if (pathname === '/api/auth/me') json = { user: null }
        else if (pathname.endsWith('/admin-status')) json = { is_admin: false }
        else if (pathname.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
        return route.fulfill({ json })
      }
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    })
    await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' })
    if (mobile) {
      await expect(page.locator('.mob-top .main-home-link')).toBeHidden()
      await expect(page.getByRole('button', { name: '한국 서버', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '중국 서버', exact: true })).toBeVisible()
      release()
      return
    }
    const home = page.getByRole('link', { name: '메인 홈페이지', exact: true })
    await expect(home).toBeVisible()
    await expect(home).toHaveAttribute('href', 'https://r2archive.com/?refresh=home')
    const homeBox = await home.boundingBox()
    for (const label of ['한국 서버', '중국 서버']) {
      const buttonBox = await page.getByRole('button', { name: label, exact: true }).boundingBox()
      expect(homeBox.y + homeBox.height).toBeLessThanOrEqual(buttonBox.y)
    }
    const watcher = await watchLayout(page, ['.side .server-switcher', '.topbar', '.main'])
    await watcher.expectStable()
    release()
    await expect(page.locator('.tbl-row')).toHaveCount(1)
    await watcher.expectStable()
    await watcher.stop()
    await page.route('https://r2archive.com/?refresh=home', route => route.fulfill({ contentType: 'text/html', body: '<h1>Main homepage</h1>' }))
    await home.click()
    await expect(page).toHaveURL('https://r2archive.com/?refresh=home')
    await expect(page.getByRole('heading', { name: 'Main homepage' })).toBeVisible()
  })
}
