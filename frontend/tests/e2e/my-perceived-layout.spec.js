import { expect, test } from '@playwright/test'
import { waitForFrames, watchLayout } from './layout.js'

const songs = [1, 2].map(id => ({
  id, name: `Song ${id}`, artist: 'Test Artist', level: 8, bpm: 160,
  combo: 700, time: '2:00', image: '', youtube_url: '', is_new: false,
  file_order: 3 - id, user_level_avg: 8.5, user_level_votes: 2,
  aliases: [], artist_aliases: [], play_count: 0, is_ai: false,
}))
const layoutTargets = ['.topbar', '.search-field', '.search-options-row', '.table-wrap', '.tbl-header', '.tbl-row']

async function mockCatalog(page, loggedIn = true) {
  const pending = []
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/songs/perceived/mine') {
      pending.push(route)
      return
    }
    let data = []
    if (path === '/api/songs') data = songs
    else if (path === '/api/meta') data = { total_count: 2, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') data = { user: loggedIn ? { id: 1, nickname: 'Test', onboarded: true } : null }
    else if (path.endsWith('/admin-status')) data = { is_admin: false }
    else if (path.includes('flags')) data = { favorites: [], played: [], played_all: [] }
    else if (path.includes('/analytics/')) data = { ok: true }
    await route.fulfill({ json: data })
  })
  await page.goto('/')
  await expect(page.locator('.tbl-row')).toHaveCount(2)
  const toggle = page.getByRole('checkbox', { name: '내 체감 난이도로 표시', exact: true })
  if (loggedIn) await expect(toggle).toBeEnabled()
  return { pending, toggle }
}

async function expectPersonalValues(page, value) {
  if (await page.locator('.th-my-perceived').count()) {
    await expect(page.locator('[data-song-id="1"] .user-lv')).toHaveText(value)
    await expect(page.locator('[data-song-id="2"] .user-lv-empty')).toHaveCount(1)
  }
}

test('personal difficulty loading, completion and toggling do not move the catalog', async ({ page }) => {
  const { pending, toggle } = await mockCatalog(page)
  const layout = await watchLayout(page, layoutTargets)
  await toggle.check()
  await expect.poll(() => pending.length).toBe(1)
  await layout.expectStable()
  await expect(page.getByText('내 체감 난이도 불러오는 중', { exact: false })).toHaveCount(0)
  await pending.shift().fulfill({ json: { 1: 9.5 } })
  await expectPersonalValues(page, '9.5')
  await layout.expectStable()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('r2b_show_my_perceived'))).toBe('1')

  await toggle.uncheck()
  await expect(page.locator('.th-my-perceived')).toHaveCount(0)
  await layout.expectStable()
  await toggle.check()
  await expect.poll(() => pending.length).toBe(1)
  await layout.expectStable()
  await pending.shift().fulfill({ json: {} })
  await layout.expectStable()
  await expect(page.locator('.user-lv')).toHaveCount(0)
  await layout.stop()
})

test('turning the option off during loading ignores the late response without moving the table', async ({ page }) => {
  const { pending, toggle } = await mockCatalog(page)
  const layout = await watchLayout(page, layoutTargets)
  await toggle.check()
  await expect.poll(() => pending.length).toBe(1)
  await layout.expectStable()
  await toggle.uncheck()
  await pending.shift().fulfill({ json: { 1: 9.5 } })
  await layout.expectStable()
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.th-my-perceived')).toHaveCount(0)
  await layout.stop()
})

test('personal difficulty errors still offer a working retry', async ({ page }) => {
  const { pending, toggle } = await mockCatalog(page)
  await toggle.check()
  await expect.poll(() => pending.length).toBe(1)
  await pending.shift().fulfill({ status: 500, json: { detail: 'Test error' } })
  const alert = page.locator('.search-personal-status[role="alert"]')
  await expect(alert).toContainText('내 체감 난이도를 불러오지 못했습니다.')
  await alert.getByRole('button', { name: '재시도' }).click()
  await expect.poll(() => pending.length).toBe(1)
  await expect(alert).toHaveCount(0)
  await expect(page.getByText('내 체감 난이도 불러오는 중', { exact: false })).toHaveCount(0)
  await pending.shift().fulfill({ json: { 1: 9.5 } })
  await expectPersonalValues(page, '9.5')
})

test('anonymous visitors still cannot request personal difficulty', async ({ page }) => {
  const { pending, toggle } = await mockCatalog(page, false)
  await expect(toggle).toBeDisabled()
  await waitForFrames(page)
  expect(pending).toHaveLength(0)
})
