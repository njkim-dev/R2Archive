import { expect, test } from '@playwright/test'
import { watchLayout } from './layout'

for (const width of [1440, 390]) {
  test(`group feed only offers available screenshots and stays stable while loading at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const user = { id: 7, nickname: 'Tester', provider: 'google', onboarded: true }
    const group = { id: 10, name: 'Test Group', description: 'Group feed', my_role: 'member', members: [], applications: [], created_at: '2026-10-20T00:00:00Z' }
    const score = { kind: 'score', at: '2026-10-23T00:00:00Z', user_id: 8, nickname: 'Owner', song_id: 11, judgment_percent: 98.123, youtube_url: null }
    let releaseImage
    const imagePending = new Promise(resolve => { releaseImage = resolve })
    let imageRequested = false
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (!path.startsWith('/api/')) return route.continue()
      let data = []
      if (path === '/api/auth/me') data = { user }
      else if (path === '/api/auth/admin-status') data = { is_admin: false }
      else if (path === '/api/meta') data = { total_count: 0, level_min: 0.5, level_max: 12, bpm_min: 40, bpm_max: 300, top_artists: [] }
      else if (path === '/api/users/me/flags') data = { favorites: [], played: [], played_all: [] }
      else if (path === '/api/groups/10') data = group
      else if (path === '/api/groups/10/feed') data = [
        { ...score, record_id: 1, song_name: 'Hidden attachment', screenshot_url: null },
        { ...score, record_id: 2, song_name: 'Shared attachment', screenshot_url: '/api/records/2/screenshot' },
        { ...score, user_id: 7, record_id: 3, song_name: 'Own attachment', screenshot_url: '/api/records/3/screenshot' },
      ]
      else if (path === '/api/records/2/screenshot') {
        imageRequested = true
        await imagePending
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="white"/></svg>' })
      }
      await route.fulfill({ json: data })
    })
    await page.goto('/groups/10')
    await page.getByRole('button', { name: '활동 피드', exact: true }).click()
    const hidden = page.locator('.gd-feed-item').filter({ hasText: 'Hidden attachment' })
    await expect(hidden).toBeVisible()
    await expect(hidden.getByTitle('스크린샷 보기')).toHaveCount(0)
    await expect(page.getByTitle('스크린샷 보기')).toHaveCount(2)
    const layout = await watchLayout(page, ['.gd-tabs', '.gd-feed'])
    await page.locator('.gd-feed-item').filter({ hasText: 'Shared attachment' }).getByTitle('스크린샷 보기').click()
    await expect.poll(() => imageRequested).toBe(true)
    await layout.expectStable()
    releaseImage()
    const image = page.locator('.ss-viewer img')
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true)
    await layout.expectStable()
    await page.locator('.ss-viewer-close').click()
    await layout.expectStable()
    await layout.stop()
  })
}
