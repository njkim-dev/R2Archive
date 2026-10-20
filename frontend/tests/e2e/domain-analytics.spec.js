import { test, expect } from '@playwright/test'
import { watchLayout, waitForFrames } from './layout.js'

function summary(days, count = 5) {
  return { days, totals: { today_visitors: count, today_pageviews: 9, visitors: count, pageviews: 9 }, series: [{ day: '2026-10-20', pageviews: 9, visitors: count }], domains: [
    { domain: 'r2archive.com', visitors: count, pageviews: 8 },
    { domain: 'music.r2archive.com', visitors: count + 1, pageviews: 12 },
    { domain: 'unknown', visitors: 50, pageviews: 90 },
  ], main_to_music: { visitors: count - 1 }, pages: Array.from({ length: count }, (_, i) => ({ path: `/page-${i}`, visitors: 1, pageviews: 2 })), servers: [], devices: [], referrers: [], recent: Array.from({ length: count }, (_, i) => ({ at: `2026-10-20 10:00:0${i}`, path: '/', server: 'kr', device: 'desktop' })) }
}

async function apiData(path, admin = false) {
  if (path === '/api/auth/me') return { user: admin ? { id: 1, nickname: 'Admin', onboarded: true } : null }
  if (path.endsWith('/admin-status')) return { is_admin: admin }
  if (path.endsWith('/meta')) return { total_count: 0, level_min: .5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
  if (path.endsWith('/flags')) return { favorites: [], played: [], played_all: [] }
  if (path.includes('/analytics/')) return { ok: true }
  return []
}

test('domain statistics preserve layout through initial load, range refresh, stale response and error', async ({ page }, testInfo) => {
  if (testInfo.project.name.endsWith('768')) await page.setViewportSize({ width: 390, height: 900 })
  const pending = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/admin/analytics/summary') { pending.push(route); return }
    await route.fulfill({ json: await apiData(url.pathname, true) })
  })
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: '도메인별 접속', exact: true })).toBeVisible()
  await expect.poll(() => pending.length).toBeGreaterThan(0)
  await expect(page.locator('.ana-status')).toBeVisible()
  const watcher = await watchLayout(page, ['.ana-head', '.ana-status', '.ana-domains', '.ana-domain-table', '.ana-grid', '.ana-recent'])
  await Promise.all(pending.splice(0).map(route => route.fulfill({ json: summary(30) })))
  await expect(page.locator('.ana-domain-table tbody tr').filter({ hasText: 'music.r2archive.com' })).toContainText('6')
  await expect(page.locator('.ana-transition strong')).toHaveText('4명')
  await expect(page.locator('.ana-domain-table')).toContainText('도메인 미구분')
  await watcher.expectStable()
  await page.getByRole('button', { name: '7일', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  const late = pending.shift()
  await expect(page.locator('.ana-status')).toContainText('이전 조회 결과')
  await watcher.expectStable()
  await page.getByRole('button', { name: '90일', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await pending.shift().fulfill({ json: summary(90, 12) })
  await expect(page.locator('.ana-transition strong')).toHaveText('11명')
  await late.fulfill({ json: summary(7, 2) }).catch(() => {})
  await waitForFrames(page)
  await expect(page.locator('.ana-transition strong')).toHaveText('11명')
  await watcher.expectStable()
  await page.getByRole('button', { name: '30일', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await pending.shift().fulfill({ status: 503, json: { detail: '통계를 잠시 불러올 수 없습니다.' } })
  await expect(page.locator('.ana-status')).toContainText('통계를 잠시 불러올 수 없습니다.')
  await expect(page.locator('.ana-status')).toBeVisible()
  await expect(page.locator('.ana-transition strong')).toHaveText('11명')
  await watcher.expectStable()
  await watcher.stop()
})

test('cross-domain entry keeps the referring main domain but SPA navigation uses the previous music URL', async ({ page, baseURL }) => {
  const events = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['r2archive.com', 'music.r2archive.com'].includes(url.hostname)) return route.continue()
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/analytics/pageview') events.push({ host: url.hostname, ...route.request().postDataJSON() })
      return route.fulfill({ json: await apiData(url.pathname) })
    }
    const response = await route.fetch({ url: baseURL + url.pathname + url.search })
    await route.fulfill({ response })
  })
  await page.goto('https://r2archive.com/')
  await expect.poll(() => events.filter(row => row.host === 'r2archive.com').length).toBe(1)
  await page.getByRole('link', { name: '음악 아카이브 둘러보기' }).click()
  await expect.poll(() => events.filter(row => row.host === 'music.r2archive.com').length).toBe(1)
  const entry = events.find(row => row.host === 'music.r2archive.com')
  expect(new URL(entry.referrer).hostname).toBe('r2archive.com')
  await page.locator('a[href="/updates"]').first().click()
  await expect(page).toHaveURL('https://music.r2archive.com/updates')
  await expect.poll(() => events.some(row => row.path === '/updates')).toBe(true)
  const navigation = events.find(row => row.path === '/updates')
  expect(navigation.referrer).toBe('https://music.r2archive.com/')
  await page.unrouteAll({ behavior: 'wait' })
})
