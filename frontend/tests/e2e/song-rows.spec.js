import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = (id, level, name = 'Shared Song', artist = 'Test Artist') => ({
  id, name, artist, level, bpm: 160, real_bpm: 159.8, combo: 200 + id,
  time: '2:00', image: 'test-art.png', youtube_url: '', is_new: false,
  file_order: 1000 - id, user_level_avg: 8.5, user_level_votes: 2,
  aliases: [], artist_aliases: [], play_count: 123, favorite_count: 2, is_ai: false,
})

const songs = [
  song(1, 8),
  song(4, 7, 'Separate Song'),
  song(2, 2),
  song(3, 5),
  song(5, 7, 'Shared Song', 'Other Artist'),
  song(6, 8, 'Shared Song_EX'),
]

async function mockCatalog(page, data = songs, {
  isAdmin = false,
  personalCategories = [],
  currentUser = { id: 1, nickname: 'Test', onboarded: true },
  removedSongs = [],
  deferRemoved = false,
  clearDefaultCategory = true,
} = {}) {
  const writes = []
  const errors = []
  let notifyRemovedRequest
  let releaseRemovedRequest
  const removedRequestStarted = new Promise(resolve => { notifyRemovedRequest = resolve })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/static/test-art.png', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aemkAAAAASUVORK5CYII=', 'base64'),
  }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/xyx/', '/api/')
    if (!path.startsWith('/api/')) return route.continue()
    if (route.request().method() !== 'GET') {
      writes.push({ path, method: route.request().method(), body: route.request().postDataJSON() })
    }
    let json = []
    const detail = path.match(/^\/api\/songs\/(\d+)$/)
    if (path === '/api/songs') {
      const includeRemoved = url.searchParams.get('include_removed') === 'true'
      if (includeRemoved) {
        notifyRemovedRequest()
        if (deferRemoved) await new Promise(resolve => { releaseRemovedRequest = resolve })
      }
      json = includeRemoved ? [...data, ...removedSongs] : data
    }
    else if (detail) {
      const matchedSong = [...data, ...removedSongs].find(item => item.id === +detail[1])
      json = {
        ...matchedSong,
        bpm_timeline: [],
        play_count_week: 0,
        game_release_date: Object.hasOwn(matchedSong || {}, 'game_release_date')
          ? matchedSong.game_release_date
          : (+detail[1] === 1 ? '2024-07-11' : '2011-02-03'),
        game_delete_date: matchedSong?.game_delete_date ?? null,
      }
    }
    else if (path === '/api/meta') json = { total_count: data.length, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') json = { user: currentUser }
    else if (path === '/api/personal-categories/filters' || path === '/api/xyx-categories/filters') json = personalCategories
    else if (path.endsWith('/admin-status')) json = { is_admin: isAdmin }
    else if (path.includes('flags')) json = { favorites: [], played: [], played_all: [] }
    else if (path.endsWith('/perceived/mine')) json = {}
    else if (path.endsWith('/perceived/stats')) json = { avg: null, total: 0, distribution: [], mine: null }
    else if (path.includes('/analytics/')) json = { ok: true }
    await route.fulfill({ json })
  })
  await page.goto('/')
  await expect(page.locator('[data-song-id="1"]')).toBeVisible()
  if (clearDefaultCategory) await page.locator('.cat-group .cat-btn').filter({ hasText: '해' }).click()
  return {
    writes,
    errors,
    waitForRemovedRequest: () => removedRequestStarted,
    releaseRemovedRequest: () => releaseRemovedRequest?.(),
  }
}

test('a visible personal category filters the song list from the detailed filter', async ({ page }) => {
  await mockCatalog(page, songs, {
    personalCategories: [{ id: 41, name: '연습곡', is_public: false, is_owner: true, owner_nickname: 'Test', song_count: 1, song_ids: [4] }],
  })
  await page.getByRole('button', { name: '상세 필터' }).click()
  await page.getByLabel('내 카테고리 필터').selectOption('41')
  await expect(page.locator('[data-song-id="4"]')).toBeVisible()
  await expect(page.locator('[data-song-id="1"]')).toHaveCount(0)
  await page.getByRole('button', { name: '상세 필터 닫기' }).click()
  await expect(page.locator('.active-filters .pill')).toContainText('연습곡')
})

test('personal category filter shares the condition column and exposes category creation', async ({ page }) => {
  const artistSongs = Array.from({ length: 12 }, (_, index) => song(100 + index, 8, `Artist Track ${index}`, `Artist ${index}`))
  await mockCatalog(page, [...songs, ...artistSongs], {
    personalCategories: [
      { id: 41, name: '내 연습곡', is_public: false, is_owner: true, owner_nickname: 'Test', song_count: 1, song_ids: [4] },
      { id: 42, name: '공개 추천곡', is_public: true, is_owner: false, owner_nickname: 'Other', song_count: 2, song_ids: [1, 2] },
    ],
  })
  await page.getByRole('button', { name: '상세 필터' }).click()

  const selector = page.getByLabel('내 카테고리 필터')
  await expect(selector.locator('option')).toHaveText([
    '전체',
    '내 연습곡 - 내 카테고리 - 1곡',
    '공개 추천곡 - 공개 카테고리 - 2곡',
    '카테고리 추가',
  ])
  const categoryWidth = (await page.locator('.detailed-personal-category-section').boundingBox()).width
  const channelWidth = (await page.locator('.detailed-channels').boundingBox()).width
  expect(Math.abs(categoryWidth - channelWidth)).toBeLessThan(2)
  await expect(page.locator('.detailed-artist-list > div')).toHaveCSS('height', '400px')

  await selector.selectOption('__create__')
  await expect(page.locator('.grp-modal')).toBeVisible()
  await expect(page.getByRole('heading', { name: '카테고리 만들기' })).toBeVisible()
})

test('anonymous category creation waits for login', async ({ page }) => {
  await mockCatalog(page, songs, { currentUser: null })
  await page.getByRole('button', { name: '상세 필터' }).click()
  await page.getByLabel('내 카테고리 필터').selectOption('__create__')

  await expect(page.locator('.login-modal')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('r2b_pending_category_create'))).toBe('filter')
})

test('pending category creation resumes after login', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('r2b_pending_category_create', 'filter'))
  await mockCatalog(page, songs, { clearDefaultCategory: false })

  await expect(page.locator('.grp-modal')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('r2b_pending_category_create'))).toBeNull()
})

test('song category labels are optional, per-row, and persisted without resizing rows', async ({ page }) => {
  await mockCatalog(page, songs, {
    personalCategories: [
      { id: 41, name: '내 연습곡', is_public: false, is_owner: true, owner_nickname: 'Test', song_count: 1, song_ids: [1] },
      { id: 42, name: '공개 추천곡', is_public: true, is_owner: false, owner_nickname: 'Other', song_count: 2, song_ids: [2, 4] },
    ],
  })
  const toggle = page.getByLabel('등록된 카테고리 리스트 표시')
  const rowHeights = () => page.locator('.tbl-row').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))

  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.song-category-list')).toHaveCount(0)
  const before = await rowHeights()

  await toggle.check()
  await expect(page.locator('[data-song-id="1"] .song-category-list')).toHaveText('내 연습곡')
  await expect(page.locator('[data-song-id="2"] .song-category-list')).toHaveText('공개 추천곡')
  await expect(page.locator('[data-song-id="4"] .song-category-list')).toHaveText('공개 추천곡')
  expect(await rowHeights()).toEqual(before)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('r2b_show_song_categories'))).toBe('1')

  await page.reload()
  await expect(toggle).toBeChecked()
  await expect(page.locator('[data-song-id="1"] .song-category-list')).toBeVisible()
})

test('released removed songs can be shown without shifting the catalog', async ({ page }) => {
  const removedSong = { ...song(90, 8, 'Removed Song'), is_removed: true }
  const control = await mockCatalog(page, songs, {
    removedSongs: [removedSong],
    deferRemoved: true,
  })
  const excludeBox = await page.getByLabel('입력한 검색어만 제외하기').boundingBox()
  const dividerBox = await page.locator('.search-options-divider').boundingBox()
  const displayOptionsBox = await page.locator('.search-display-options').boundingBox()
  const layout = await watchLayout(page, ['.tbl-header', '[data-song-id="1"]'])

  expect(excludeBox.y + excludeBox.height).toBeLessThanOrEqual(dividerBox.y)
  expect(dividerBox.y + dividerBox.height).toBeLessThanOrEqual(displayOptionsBox.y)
  await expect(page.getByLabel('삭제된 곡 표시')).toHaveCount(0)
  await page.getByRole('button', { name: '상세 필터' }).click()
  const showRemoved = page.getByLabel('삭제된 곡 표시')
  const onlyRemoved = page.getByLabel('삭제된 곡만 표시')
  const excludeRemoved = page.getByLabel('삭제된 곡 제외')
  await expect(excludeRemoved).toBeChecked()
  await showRemoved.check()
  await control.waitForRemovedRequest()
  await expect(page.locator('[data-song-id="90"]')).toHaveCount(0)
  await layout.expectStable()

  control.releaseRemovedRequest()
  await expect(page.locator('[data-song-id="90"]')).toBeVisible()
  await layout.expectStable()
  await layout.stop()
  await onlyRemoved.check()
  await expect(page.locator('[data-song-id="1"]')).toHaveCount(0)
  await expect(page.locator('[data-song-id="90"]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('r2b:detailed-filters:v1:kr'))).toBeNull()

  await page.reload()
  await expect(page.locator('[data-song-id="1"]')).toBeVisible()
  await expect(page.locator('[data-song-id="90"]')).toHaveCount(0)
  await page.getByRole('button', { name: '상세 필터' }).click()
  await expect(page.getByLabel('삭제된 곡 제외')).toBeChecked()
})

test('searching for a removed song offers the detailed filter shortcut', async ({ page }) => {
  const removedSong = { ...song(90, 5, 'Deleted Secret'), is_removed: true }
  await mockCatalog(page, songs, { removedSongs: [removedSong] })

  await page.getByRole('textbox', { name: '곡명 + 아티스트 검색' }).fill('Deleted Secret')
  await expect(page.getByText('삭제된 곡입니다. 상세필터에서 삭제된 곡 보기 옵션을 켜보세요.')).toBeVisible()
  await page.getByRole('button', { name: '상세필터 열기' }).click()
  await expect(page.getByRole('dialog', { name: '상세 필터' })).toBeVisible()
  await expect(page.getByLabel('삭제된 곡 제외')).toBeChecked()
  const removedSection = page.locator('.detailed-removed-section')
  await expect(removedSection).toHaveClass(/is-highlighted/)
  await expect(removedSection).toBeFocused()
  expect(await removedSection.evaluate(element => getComputedStyle(element).animationDuration)).toBe('5s')
})

test('original BPM option follows the available table width', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 })
  await mockCatalog(page)
  const toggle = page.getByLabel('음악 원 BPM 표시')

  await expect(toggle).toBeEnabled()
  await toggle.check()
  await expect(page.getByRole('columnheader', { name: /^원 BPM 기준/ })).toBeVisible()

  await page.setViewportSize({ width: 900, height: 900 })
  await expect(toggle).toBeDisabled()
  await expect(toggle).toBeChecked()
  await expect(page.getByRole('columnheader', { name: /^원 BPM 기준/ })).toHaveCount(0)

  await page.setViewportSize({ width: 1920, height: 900 })
  await expect(toggle).toBeEnabled()
  await expect(toggle).toBeChecked()
  await expect(page.getByRole('columnheader', { name: /^원 BPM 기준/ })).toBeVisible()
})

test('Korean song catalog shows the release date and service era', async ({ page }) => {
  await mockCatalog(page)

  await page.locator('[data-song-id="1"] .title-main').click()
  await expect(page.locator('.m-release-date')).toHaveText('2024-07-11 벨로프 출시')
  await page.getByRole('button', { name: '닫기' }).click()

  await page.locator('[data-song-id="2"] .title-main').click()
  await expect(page.locator('.m-release-date')).toHaveText('2011-02-03 이전 서비스 출시')
})

test('removed song catalog shows release and deletion dates, or deletion date only', async ({ page }) => {
  const removedSongs = [
    { ...song(90, 5.5, 'Deleted With Release'), is_removed: true, game_release_date: '2024-07-11', game_delete_date: '2026-06-18' },
    { ...song(91, 6, 'Deleted Without Release'), is_removed: true, game_release_date: null, game_delete_date: '2024-05-09' },
  ]
  await mockCatalog(page, songs, { removedSongs })
  await page.getByRole('button', { name: '상세 필터' }).click()
  await page.getByLabel('삭제된 곡 표시').check()
  await page.getByRole('button', { name: '상세 필터 닫기' }).click()

  await page.locator('[data-song-id="90"] .title-main').click()
  await expect(page.locator('.m-release-date')).toHaveText('2024-07-11 벨로프 출시2026-06-18 삭제')
  await page.getByRole('button', { name: '닫기' }).click()

  await page.locator('[data-song-id="91"] .title-main').click()
  await expect(page.locator('.m-release-date')).toHaveText('2024-05-09 삭제')
  await expect(page.locator('.m-release-date')).not.toContainText('출시')
})

test('same-title difficulty rows keep independent cells and actions', async ({ page }) => {
  const data = songs.map(item => item.id === 1
    ? { ...item, is_new: true, youtube_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }
    : item.id === 3 ? { ...item, youtube_url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' } : item)
  const { writes, errors } = await mockCatalog(page, data)

  await expect(page.locator('.tbl-song-group')).toHaveCount(0)
  const levelHeader = page.getByRole('columnheader', { name: /^난이도 기준/ })
  const nameHeader = page.getByRole('columnheader', { name: /^곡명 기준/ })
  const levelHeaderBox = await levelHeader.boundingBox()
  const nameHeaderBox = await nameHeader.boundingBox()
  expect(levelHeaderBox.x).toBeLessThan(nameHeaderBox.x)
  const artistVisible = await page.getByRole('columnheader', { name: /^아티스트/ }).count() > 0
  for (const id of [1, 2, 3]) {
    const row = page.locator(`[data-song-id="${id}"]`)
    await expect(row.locator('.title-main')).toHaveText('Shared Song')
    await expect(row.locator('.title-thumb img')).toHaveCount(1)
    if (artistVisible) await expect(row.locator('.artist-cell')).toHaveText('Test Artist')
    else await expect(row.locator('.artist-cell')).toHaveCount(0)
    await expect(row.locator('.fav-btn')).toHaveCount(1)
    const levelBox = await row.locator('[data-column="level"]').boundingBox()
    const nameBox = await row.locator('[data-column="name"]').boundingBox()
    expect(levelBox.x).toBeLessThan(nameBox.x)
  }
  const indexVisible = await page.locator('[data-song-id="1"] [data-column="file_order"]').count() > 0
  const newRow = page.locator('[data-song-id="1"]')
  if (indexVisible) {
    const newTag = newRow.locator('.new-tag')
    const favorite = newRow.locator('.fav-btn')
    await expect(newTag).toHaveText('NEW')
    await expect(newTag).toHaveCSS('opacity', '1')
    await expect(favorite).toHaveCSS('opacity', '0')
    await newRow.hover()
    await expect(newTag).toHaveCSS('opacity', '0')
    await expect(favorite).toHaveCSS('opacity', '1')
    await favorite.click()
    await expect(favorite).toHaveClass(/on/)
    expect(writes.some(write => write.path.endsWith('/favorites/1'))).toBe(true)
  } else {
    await expect(newRow.locator('.new-tag')).toHaveCount(0)
  }
  await expect(page.locator('[data-song-id="2"] .new-tag')).toHaveCount(0)
  await expect(page.locator('[data-song-id="1"] .song-youtube-icon')).toHaveCount(1)
  await expect(page.locator('[data-song-id="2"] .song-youtube-icon')).toHaveCount(0)
  await expect(page.locator('[data-song-id="3"] .song-youtube-icon')).toHaveCount(1)

  const favorite = page.locator('[data-song-id="2"] .fav-btn')
  await page.locator('[data-song-id="2"]').hover()
  await favorite.click()
  await expect(favorite).toHaveClass(/on/)
  if (indexVisible) {
    await expect(page.locator('[data-song-id="1"] .fav-btn')).toHaveClass(/on/)
  } else {
    await expect(page.locator('[data-song-id="1"] .fav-btn')).not.toHaveClass(/on/)
  }
  expect(writes.some(write => write.path.endsWith('/favorites/2'))).toBe(true)
  expect(errors).toEqual([])
})
