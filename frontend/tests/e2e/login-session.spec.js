import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = {
  id: 1,
  name: 'Login Test Song',
  artist: 'Test Artist',
  level: 8,
  bpm: 160,
  combo: 700,
  time: '2:00',
  image: '',
  youtube_url: '',
  is_new: false,
  file_order: 1,
  user_level_avg: 8.5,
  user_level_votes: 2,
  aliases: [],
  artist_aliases: [],
  play_count: 0,
  is_ai: false,
}

async function mockCatalog(page, loginUrls) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/naver/login') {
      loginUrls.push(url)
      return route.fulfill({ status: 204 })
    }

    let data = []
    if (path === '/api/songs') data = [song]
    else if (path === '/api/meta') data = { total_count: 1, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') data = { user: null }
    else if (path === '/api/auth/admin-status') data = { is_admin: false }
    else if (path === '/api/users/me/flags') data = { favorites: [], played: [], played_all: [] }
    else if (path === '/api/personal-categories/filters') data = []
    else if (path === '/api/analytics/pageview') data = { ok: true }
    await route.fulfill({ json: data })
  })
}

async function openLogin(page) {
  await page.locator('button.login-btn:visible').click()
  const modal = page.locator('.login-modal')
  await expect(modal).toBeVisible()
  return modal
}

test('login persistence is selected by default and remains optional without shifting the catalog', async ({ page }) => {
  const loginUrls = []
  await mockCatalog(page, loginUrls)
  await page.goto('/')
  await expect(page.locator('.tbl-row')).toHaveCount(1)

  const layout = await watchLayout(page, ['.topbar', '.table-wrap', '.tbl-header', '.tbl-row'])
  let modal = await openLogin(page)
  let remember = modal.getByRole('checkbox', { name: '로그인 상태 유지' })
  await expect(remember).toBeChecked()
  await layout.expectStable()

  await modal.getByRole('button', { name: '네이버로 계속하기' }).click()
  await expect.poll(() => loginUrls.length).toBe(1)
  expect(loginUrls[0].searchParams.get('remember')).toBe('1')
  await layout.stop()

  await page.goto('/')
  await expect(page.locator('.tbl-row')).toHaveCount(1)
  modal = await openLogin(page)
  remember = modal.getByRole('checkbox', { name: '로그인 상태 유지' })
  await remember.uncheck()
  await expect(remember).not.toBeChecked()
  await modal.getByRole('button', { name: '네이버로 계속하기' }).click()
  await expect.poll(() => loginUrls.length).toBe(2)
  expect(loginUrls[1].searchParams.get('remember')).toBe('0')
})
