import { expect, test } from '@playwright/test'

const song = {
  id: 1,
  name: 'Speed Song',
  artist: 'Test Artist',
  level: 8,
  bpm: 160,
  combo: 500,
  time: '2:30',
  image: null,
  youtube_url: '',
  is_new: false,
  file_order: 1,
  play_count: 0,
  favorite_count: 0,
  is_change: false,
  aliases: [],
  artist_aliases: [],
}

async function mockRankings(page) {
  const rankingSpeeds = []
  const manualWrites = []
  const recordWrites = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    let json = []

    if (path === '/api/songs') json = [song]
    else if (path === '/api/meta') {
      json = { total_count: 1, level_min: 1, level_max: 12, bpm_min: 160, bpm_max: 160, top_artists: [] }
    } else if (path === '/api/auth/me') json = { user: { id: 1, nickname: 'Tester', onboarded: true } }
    else if (path.endsWith('/admin-status')) json = { is_admin: false }
    else if (path === '/api/rankings/songs') {
      const speed = url.searchParams.get('speed') || 'all'
      rankingSpeeds.push(speed)
      json = [{
        song_id: 1,
        top: {
          user_id: 1,
          nickname: 'Tester',
          judgment_percent: speed === 'normal' ? 91 : speed === 'fast' ? 95 : 99,
          is_mine: true,
          visibility: 'public',
          speed: speed === 'all' ? 'ultra' : speed,
        },
        total_records: 1,
        group_top: null,
      }]
    } else if (path === '/api/users/me/records' && request.method() === 'GET') {
      json = { records: [
        { song_id: 1, judgment_percent: 91, is_manual: true, youtube_url: null, speed: 'normal' },
        { song_id: 1, judgment_percent: 95, is_manual: true, youtube_url: null, speed: 'fast' },
        { song_id: 1, judgment_percent: 99, is_manual: true, youtube_url: null, speed: 'ultra' },
      ] }
    } else if (path === '/api/users/me/records/manual' && request.method() === 'PUT') {
      manualWrites.push(request.postDataJSON())
      json = { ok: true, inserted: 0, updated: 1, deleted: 0 }
    } else if (path === '/api/users/me/screenshot-filenames') json = { filenames: [] }
    else if (path === '/api/parse-screenshot' && request.method() === 'POST') json = { judgment_percent: 98.5 }
    else if (path === '/api/songs/1/records' && request.method() === 'POST') {
      recordWrites.push(request.postDataJSON())
      json = { id: 77, created_at: new Date().toISOString() }
    } else if (path === '/api/records/77/screenshot' && request.method() === 'POST') json = { ok: true }
    else if (path.includes('/flags')) json = { favorites: [], played: [], played_all: [] }

    await route.fulfill({ json })
  })

  await page.goto('/rankings')
  try {
    await expect(page.locator('.tbl-row:visible, .mob-rk-card:visible').first()).toBeVisible()
  } catch (error) {
    throw new Error(`${error.message}\nPage errors: ${errors.join(' | ')}`)
  }
  return { rankingSpeeds, manualWrites, recordWrites }
}

test('ranking speed filters are available on desktop and mobile', async ({ page }) => {
  const { rankingSpeeds } = await mockRankings(page)

  await expect(page.getByRole('button', { name: '전체 보기' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '보통만 보기' }).click()
  await expect.poll(() => rankingSpeeds.at(-1)).toBe('normal')
  await expect(page.locator('.judge:visible').filter({ hasText: '91.000' }).first()).toBeVisible()
})

test('edit mode writes to the selected speed record', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'desktop interaction coverage')
  const { manualWrites } = await mockRankings(page)

  await page.locator('.edit-toggle input').click()
  await expect(page.getByRole('dialog', { name: '편집할 속도 선택' })).toBeVisible()
  await page.getByRole('dialog', { name: '편집할 속도 선택' }).getByRole('button', { name: /^고속 / }).click()
  await expect(page.locator('.edit-toggle')).toContainText('고속')

  const judgment = page.locator('input[data-edit-col="judgment"]').first()
  await expect(judgment).toHaveValue('95.000')
  await judgment.fill('96.123')
  await page.getByRole('button', { name: /저장 \(1\)/ }).click()
  await expect.poll(() => manualWrites.length).toBe(1)
  expect(manualWrites[0].entries[0]).toMatchObject({ song_id: 1, judgment_percent: 96.123, speed: 'fast' })
})

test('screenshot registration sends the selected speed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'desktop interaction coverage')
  const { recordWrites } = await mockRankings(page)

  await page.getByRole('button', { name: '성과 등록' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'result.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aemkAAAAASUVORK5CYII=', 'base64'),
  })
  await page.getByRole('button', { name: '시작 →' }).click()
  await page.locator('.rr-speed-options').getByRole('button', { name: '보통' }).click()
  await page.getByPlaceholder('곡명으로 검색…').fill('Speed Song')
  await page.locator('.rr-song-item').first().click()
  await page.getByRole('button', { name: '등록', exact: true }).click()

  await expect.poll(() => recordWrites.length).toBe(1)
  expect(recordWrites[0]).toMatchObject({ judgment_percent: 98.5, speed: 'normal' })
})
