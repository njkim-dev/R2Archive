import { expect, test } from '@playwright/test'
import { DEFAULT_TITLE, KR_ORIGIN, getPageSeo } from '../../src/utils/seo.js'

test('metadata follows client-side navigation without stale or duplicate canonicals', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let data = []
    if (path.endsWith('/meta')) data = { total_count: 0, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') data = { user: { id: 1, nickname: 'Test', onboarded: true } }
    else if (path.endsWith('/admin-status')) data = { is_admin: false }
    else if (path.includes('flags')) data = { favorites: [], played: [], played_all: [] }
    else if (path.includes('/analytics/')) data = { ok: true }
    await route.fulfill({ json: data })
  })
  await page.goto('/')
  await expect(page).toHaveTitle(getPageSeo('/').title)
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', KR_ORIGIN + '/')
  await page.locator('a[href="/pmang-songs"]').first().click()
  await expect(page).toHaveTitle(getPageSeo('/pmang-songs').title)
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', KR_ORIGIN + '/pmang-songs')
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', getPageSeo('/pmang-songs').description)
  await page.locator('a[href="/personal-categories"]').first().click()
  await expect(page).toHaveTitle(DEFAULT_TITLE)
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  await page.goBack()
  await expect(page).toHaveTitle(getPageSeo('/pmang-songs').title)
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
})
