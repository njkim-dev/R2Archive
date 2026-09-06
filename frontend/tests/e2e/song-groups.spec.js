import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = (id, level, name = 'Shared Song', artist = 'Test Artist') => ({
  id, name, artist, level, bpm: 160, real_bpm: 159.8, combo: 200 + id,
  time: '2:00', image: 'test-art.png', youtube_url: '', is_new: false,
  file_order: 1000 - id, user_level_avg: 8.5, user_level_votes: 2,
  aliases: [], artist_aliases: [], play_count: 123, favorite_count: 2, is_ai: false,
})
const songs = [song(1, 8), song(4, 7, 'Separate Song'), song(2, 2), song(3, 5),
  song(5, 7, 'Shared Song', 'Other Artist'), song(6, 8, 'Shared Song_EX')]
const merged = page => page.locator('.tbl-song-group').filter({ has: page.locator('[data-song-id="1"]') })

async function mockCatalog(page, data = songs, { holdPlays = false } = {}) {
  const pending = []
  const pendingPlays = []
  const writes = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('r2b:detailed-filters:v1:kr', JSON.stringify({ version: 1, filters: { category: null } }))
    localStorage.setItem('r2b:detailed-filters:v1:xyx', JSON.stringify({ version: 1, filters: { category: null } }))
  })
  await page.route('**/static/test-art.png', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aemkAAAAASUVORK5CYII=', 'base64'),
  }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/xyx/', '/api/')
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/songs/perceived/mine') { pending.push(route); return }
    if (route.request().method() !== 'GET') writes.push({ path, body: route.request().postDataJSON() })
    if (holdPlays && path.endsWith('/play')) { pendingPlays.push(route); return }
    let json = []
    const detail = path.match(/^\/api\/songs\/(\d+)$/)
    if (path === '/api/songs') json = data
    else if (detail) json = { ...data.find(song => song.id === +detail[1]), bpm_timeline: [], play_count_week: 0 }
    else if (path === '/api/meta') json = { total_count: data.length, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') json = { user: { id: 1, nickname: 'Test', onboarded: true } }
    else if (path.endsWith('/admin-status')) json = { is_admin: false }
    else if (path.includes('flags')) json = { favorites: [], played: [], played_all: [] }
    else if (path.endsWith('/perceived/stats')) json = { avg: null, total: 0, distribution: [], mine: null }
    else if (path.includes('/analytics/')) json = { ok: true }
    await route.fulfill({ json })
  })
  await page.goto('/')
  await expect(merged(page)).toBeVisible()
  return { pending, pendingPlays, writes, errors }
}

test('all-channel rows merge only shared values and retain filter/sort behavior', async ({ page }, testInfo) => {
  await mockCatalog(page)
  const group = merged(page)
  await expect(group.locator('.tbl-row')).toHaveCount(3)
  await expect(group.locator('.title-main')).toHaveText(['Shared Song'])
  await expect(group.locator('.title-thumb img')).toHaveCount(1)
  await expect(group.locator('.new-tag, .song-youtube-icon')).toHaveCount(0)
  await expect.poll(() => group.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  await expect(group.locator('[data-column="artist"] .group-shared-value')).toHaveText(await page.locator('.th').filter({ hasText: /^아티스트/ }).count() ? ['Test Artist'] : [])
  const plays = group.locator('[data-column="play_count"] .group-shared-value')
  if (await plays.count()) await expect(plays).toHaveText('123')
  expect(await group.locator('.tbl-row').evaluateAll(rows => rows.map(row => row.dataset.songId))).toEqual(['2', '3', '1'])
  await expect(page.locator('[data-song-group]')).toHaveCount(4)
  const boxes = await group.locator('.tbl-row').evaluateAll(rows => rows.map(row => {
    const { top, height } = row.getBoundingClientRect(); return { top, height }
  }))
  expect(boxes.map(box => box.height)).toEqual([44, 44, 44])
  expect(boxes[2].top - boxes[0].top).toBe(88)
  await page.screenshot({ path: testInfo.outputPath('grouped-list.png') })

  await page.getByRole('columnheader', { name: /^난이도 기준/ }).click()
  expect(await page.locator('[data-song-group]').first().locator('.title-main').textContent()).toBe('Shared Song')
  await page.getByRole('columnheader', { name: /^난이도 기준/ }).click()
  await expect(group.locator('.tbl-row')).toHaveCount(3)
  await page.getByRole('spinbutton', { name: '난이도 최솟값' }).fill('1')
  const layout = await watchLayout(page, ['.topbar', '.table-wrap', '.tbl-header'])
  await page.getByRole('spinbutton', { name: '난이도 최솟값' }).fill('4')
  await expect(group.locator('.tbl-row')).toHaveCount(2)
  await layout.expectStable()
  await layout.stop()

  await page.getByRole('group', { name: '난이도 카테고리' }).getByRole('button', { name: /별/ }).click()
  await expect(page.locator('.tbl-song-group')).toHaveCount(0)
  await expect(page.locator('.tbl-row')).toHaveCount(1)
  await expect(page.locator('.title-main')).toHaveText(['Shared Song'])
})

test('play counts use a compact aligned column in grouped and ordinary rows', async ({ page }, testInfo) => {
  const { errors } = await mockCatalog(page, songs.map(song => ({
    ...song, play_count: song.id === 4 ? 9999 : song.id === 5 ? 0 : song.play_count,
  })))
  const header = page.getByRole('columnheader', { name: /^재생 기준/ })
  const cells = page.locator('[data-column="play_count"]')
  const checkColumn = async () => {
    if (!await header.count()) {
      await expect(cells).toHaveCount(0)
      return
    }
    const headerBox = await header.boundingBox()
    expect(headerBox.width).toBeCloseTo(60, 1)
    const metrics = await cells.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect()
      const timeBox = node.previousElementSibling.getBoundingClientRect()
      return {
        x: box.x, width: box.width, timeWidth: timeBox.width,
        gap: box.left - timeBox.right, align: getComputedStyle(node).textAlign,
      }
    }))
    expect(metrics.length).toBeGreaterThan(0)
    for (const metric of metrics) {
      expect(metric.x).toBeCloseTo(headerBox.x, 1)
      expect(metric.width).toBeCloseTo(60, 1)
      expect(metric.timeWidth).toBeCloseTo(68, 1)
      expect(metric.gap).toBeCloseTo(0, 1)
      expect(metric.align).toBe('right')
    }
    await expect(page.locator('[data-song-id="4"] [data-column="play_count"]')).toHaveText('9,999')
    await expect(page.locator('[data-song-id="5"] [data-column="play_count"]')).toHaveText('\u2014')
  }
  if (testInfo.project.use.viewport.width === 1920) await expect(header).toBeVisible()
  await checkColumn()
  await page.getByRole('group', { name: '난이도 카테고리' }).getByRole('button', { name: /해/ }).click()
  await expect(page.locator('.tbl-song-group')).toHaveCount(0)
  await checkColumn()
  if (await header.count()) {
    const layout = await watchLayout(page, ['.topbar', '.table-wrap', '.tbl-header'])
    await header.click()
    await checkColumn()
    await layout.expectStable()
    await layout.stop()
  }
  await page.screenshot({ path: testInfo.outputPath('compact-play-column.png') })
  expect(errors).toEqual([])
})

test('each chart still opens its own catalog from a merged title or difficulty cell', async ({ page }, testInfo) => {
  const { errors } = await mockCatalog(page)
  const title = await merged(page).locator('.group-shared-title').boundingBox()
  await page.mouse.click(title.x + 90, title.y + 65)
  await expect(page).toHaveURL(/#song=3$/)
  await expect(page.locator('[data-song-id="3"].is-catalog-active')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('grouped-catalog.png') })
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/#song=/)
  const row = page.locator('[data-song-id="1"].tbl-row')
  await row.locator('.level-cell').click()
  await expect(page).toHaveURL(/#song=1$/)
  await page.keyboard.press('Escape')
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#song=1$/)
  expect(errors).toEqual([])
})

test('pending personal difficulty and favorite changes do not shift merged rows', async ({ page }) => {
  const { pending, writes } = await mockCatalog(page)
  const layout = await watchLayout(page, ['.topbar', '.table-wrap', '.tbl-header', '.tbl-song-group', '.group-shared-title'])
  const toggle = page.getByRole('checkbox', { name: '내 체감 난이도로 표시', exact: true })
  await toggle.check()
  await expect.poll(() => pending.length).toBe(1)
  await layout.expectStable()
  await pending.shift().fulfill({ json: { 1: 9, 2: 3, 3: 5.5 } })
  await layout.expectStable()
  if (await page.locator('.th-my-perceived').count()) {
    await expect(merged(page).locator('.user-lv')).toHaveText(['3.0', '5.5', '9.0'])
  }
  const fav = page.locator('[data-song-id="3"] .fav-btn')
  if (await fav.count()) {
    await page.locator('[data-song-id="3"]').hover()
    await fav.click()
    await expect(fav).toHaveClass(/on/)
    expect(writes.some(write => write.path.includes('favorites'))).toBe(true)
    await expect(page.locator('[data-song-id="1"] .fav-btn')).not.toHaveClass(/on/)
    await layout.expectStable()
  }
  await layout.stop()
})

test('group virtualization supports PageDown, PageUp, bottom scrolling and regrouping', async ({ page }) => {
  const large = Array.from({ length: 180 }, (_, i) => [
    song(i * 3 + 1, 8, `Track ${i}`),
    ...(i % 2 === 0 ? [song(i * 3 + 2, 2, `Track ${i}`)] : []),
    song(i * 3 + 3, 5, `Track ${i}`),
  ]).flat()
  await mockCatalog(page, large)
  const scroller = page.locator('.song-list-scroll')
  const before = await scroller.evaluate(node => node.scrollTop)
  await page.keyboard.press('PageDown')
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(before)
  await page.keyboard.press('PageUp')
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBe(0)
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(page.locator('[data-song-id="540"].tbl-row')).toBeVisible()
  expect(await page.locator('.tbl-row').count()).toBeLessThan(90)
  const bottomOffset = await scroller.evaluate(node => node.scrollTop)
  await page.locator('[data-song-id="540"] .level-cell').click()
  await expect(page).toHaveURL(/#song=540$/)
  await page.keyboard.press('Escape')
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeCloseTo(bottomOffset, 0)
  await page.getByRole('group', { name: '난이도 카테고리' }).getByRole('button', { name: /별/ }).click()
  await expect(page.locator('.tbl-song-group')).toHaveCount(0)
  expect(await page.locator('.tbl-row').count()).toBeGreaterThan(0)
  expect(await scroller.evaluate(node => node.scrollTop <= node.scrollHeight - node.clientHeight)).toBe(true)
})

test('exact and fuzzy matches remain separate groups', async ({ page }) => {
  await mockCatalog(page, [...songs, song(7, 5, 'Shored Song'), song(8, 8, 'Shored Song')])
  await page.getByPlaceholder('검색어 입력, 검색어가 여러 개면 쉼표 사용 가능').fill('Shared Song')
  await expect(page.getByText('혹시 이런 곡을 찾으셨나요?', { exact: true })).toBeVisible()
  await expect(merged(page).locator('.tbl-row')).toHaveCount(3)
  const fuzzyGroup = page.locator('.tbl-song-group').filter({ has: page.locator('[data-song-id="7"]') })
  await expect(fuzzyGroup.locator('.tbl-row')).toHaveCount(2)
  await expect(fuzzyGroup.locator('.title-main')).toHaveText('Shored Song')
})

test('mobile cards are unchanged when the channel is all', async ({ page }, testInfo) => {
  await mockCatalog(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.tbl-song-group')).toHaveCount(0)
  await expect(page.locator('.mob-card')).toHaveCount(songs.length)
  await expect(page.locator('.mob-card-name', { hasText: /^Shared Song$/ })).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('mobile-list.png') })
})

test('NEW and listening are shared while favorites still target individual charts', async ({ page }, testInfo) => {
  const sharedUrl = 'https://www.youtube.com/watch?v=bbbbbbbbbbb'
  const data = songs.map(song => song.id === 1
    ? { ...song, is_new: true, youtube_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }
    : song.id === 3 ? { ...song, youtube_url: sharedUrl } : song)
  await page.addInitScript(() => {
    window.__openedMusic = []
    window.open = (...args) => { window.__openedMusic.push(args); return null }
  })
  const { pendingPlays, writes, errors } = await mockCatalog(page, data, { holdPlays: true })
  const group = merged(page)
  const indexCells = group.locator('[data-column="file_order"]')
  if (await indexCells.count()) {
    await expect(indexCells).toHaveCount(3)
    await expect(indexCells.first()).toHaveAttribute('aria-rowspan', '3')
    await expect(indexCells.locator('.new-tag')).toHaveText(['NEW'])
    await expect(indexCells.locator('.fav-btn')).toHaveCount(0)
    expect(await indexCells.evaluateAll(cells => cells.map(cell => getComputedStyle(cell).borderBottomWidth))).toEqual(['0px', '0px', '0px'])
    const badge = await group.locator('.new-tag').boundingBox()
    const thumb = await group.locator('.title-thumb').boundingBox()
    expect(Math.abs(badge.y + badge.height / 2 - thumb.y - thumb.height / 2)).toBeLessThan(1)
  }
  const listen = group.getByRole('button', { name: 'YouTube에서 듣기' })
  await expect(listen).toHaveCount(1)
  await expect(listen).toBeVisible()
  const layout = await watchLayout(page, ['.topbar', '.table-wrap', '.tbl-header', '.tbl-song-group', '.group-shared-title'])
  await listen.click()
  await expect.poll(() => pendingPlays.length).toBe(1)
  await expect.poll(() => page.evaluate(() => window.__openedMusic)).toEqual([[sharedUrl, '_blank', 'noopener,noreferrer']])
  expect(writes.filter(write => write.path.endsWith('/play')).map(write => write.path)).toEqual(['/api/songs/3/play'])
  await expect(page).not.toHaveURL(/#song=/)
  await layout.expectStable()
  await pendingPlays.shift().fulfill({ json: { ok: true } })
  await layout.expectStable()
  await listen.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => pendingPlays.length).toBe(1)
  await expect.poll(() => page.evaluate(() => window.__openedMusic.length)).toBe(2)
  await expect(page).not.toHaveURL(/#song=/)
  await pendingPlays.shift().fulfill({ json: { ok: true } })
  await layout.expectStable()

  if (await indexCells.count()) {
    const row = group.locator('[data-song-id="1"]')
    await row.hover()
    const fav = row.locator('[data-column="name"] .fav-btn')
    await fav.click()
    await expect(fav).toHaveClass(/on/)
    expect(writes.some(write => /favorites\/1$/.test(write.path))).toBe(true)
    await expect(group.locator('[data-song-id="3"] .fav-btn')).not.toHaveClass(/on/)
    await layout.expectStable()
  }
  await page.screenshot({ path: testInfo.outputPath('shared-new-and-listen.png') })
  await layout.stop()
  await group.locator('[data-song-id="1"] .level-cell').click()
  await expect(page).toHaveURL(/#song=1$/)
  await expect(group.getByRole('button', { name: 'YouTube에서 듣기' })).toHaveCount(1)
  await expect(group.getByRole('button', { name: 'YouTube에서 듣기' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('spinbutton', { name: '난이도 최댓값' }).fill('2')
  await expect(page.locator('.tbl-row')).toHaveCount(1)
  await expect(page.locator('.tbl-song-group, .new-tag, .song-youtube-icon')).toHaveCount(0)
  expect(errors).toEqual([])
})
