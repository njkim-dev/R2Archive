import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

const releases = [
  {
    release_date: '2026-09-30',
    notice_url: 'https://www.orvvit.com/page/r2beat/09wol-30il-su-eobdeiteu-annae',
    notice_urls: [
      'https://www.orvvit.com/page/r2beat/09wol-30il-su-eobdeiteu-annae',
      'https://www.orvvit.com/page/r2beat/09wol-30il-sagje-annae',
    ],
    songs: [
      { name: 'ECHOES OF TIME (PREQUEL I)', artist: 'rb free', image: 'rnr_image/img_music/echo.bmp', youtube_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', is_deleted: false, levels: [3, 4.5, 8], variants: [{ id: 101, level: 3 }, { id: 102, level: 4.5 }, { id: 103, level: 8 }] },
      { name: 'NEW WORLD', artist: 'SEED9', image: 'rnr_image/img_music/world.bmp', levels: [6], variants: [{ id: 104, level: 6 }] },
      { name: 'OLD WORLD', artist: 'SEED9', youtube_url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', is_deleted: true, levels: [5.5], variants: [{ id: 105, level: 5.5 }] },
    ],
  },
  {
    release_date: '2026-09-17',
    notice_url: 'https://www.orvvit.com/page/r2beat/09wol-17il-mog-eobdeiteu-annae',
    songs: [{ name: '날개', artist: '아이리제', levels: [7.5] }],
  },
  {
    release_date: '2026-09-10',
    notice_url: 'https://www.orvvit.com/page/r2beat/09wol-10il-eobdeiteu-annae',
    songs: [{ name: 'Another Song', artist: 'Another Artist', levels: [5] }],
  },
  {
    release_date: '2026-08-27',
    notice_url: 'https://www.orvvit.com/page/r2beat/08wol-27il-eobdeiteu-annae',
    songs: [{ name: 'Late Summer', artist: 'Artist', levels: [6.5] }],
  },
  {
    release_date: '2025-12-18',
    notice_url: 'https://www.orvvit.com/page/r2beat/12wol-18il-eobdeiteu-annae',
    songs: [{ name: 'Winter', artist: 'Artist', levels: [5] }],
  },
]

async function mockApis(page, historyData, gate = Promise.resolve()) {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/release-history') {
      await gate
      return route.fulfill({ json: historyData })
    }
    if (path === '/api/meta') {
      return route.fulfill({ json: { total_count: 0, new_count: 0, played_count: 0, change_count: 0, top_artists: [], bpm_min: 0, bpm_max: 300, level_min: 0.5, level_max: 12 } })
    }
    if (path === '/api/auth/me') return route.fulfill({ json: { user: null } })
    if (path.endsWith('/admin-status')) return route.fulfill({ json: { is_admin: false } })
    if (path.includes('/flags')) return route.fulfill({ json: { favorites: [], played: [], played_all: [] } })
    return route.fulfill({ json: [] })
  })
}

test('loading the virtualized history keeps the toolbar and list geometry stable', async ({ page }) => {
  let releaseHistory
  const gate = new Promise(resolve => { releaseHistory = resolve })
  const manyReleases = Array.from({ length: 160 }, (_, index) => {
    const date = new Date(2026, 8, 30 - index * 7)
    const releaseDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
    return {
      release_date: releaseDate,
      notice_url: `https://example.com/notices/${releaseDate}`,
      songs: [{ name: `Song ${index}`, artist: `Artist ${index}`, levels: [5] }],
    }
  })
  await mockApis(page, manyReleases, gate)
  await page.goto('/updates')
  await expect(page.locator('.rh-toolbar')).toBeVisible()
  await expect(page.locator('.rh-list-shell')).toBeVisible()
  const watcher = await watchLayout(page, ['.rh-toolbar', '.rh-list-shell'])
  releaseHistory()
  await expect(page.locator('.rh-release-card').first()).toBeVisible()
  await watcher.expectStable()
  await watcher.stop()
  expect(await page.locator('.rh-release-card').count()).toBeLessThan(manyReleases.length)
})

test('date picker enables release days and supports year and month selection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single interaction coverage')
  await mockApis(page, releases)
  await page.goto('/updates')
  await expect(page.locator('.rh-release-card').first()).toBeVisible()

  await page.locator('.rh-date-trigger').click()
  await expect(page.getByRole('button', { name: '2026년 9월 16일, 업데이트 없음' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '2026년 9월 17일 업데이트 선택' })).toBeEnabled()

  await page.getByRole('button', { name: '연도 선택: 2026년' }).click()
  await expect(page.getByRole('button', { name: '2025년으로 이동' })).toBeVisible()
  await page.getByRole('button', { name: '2025년으로 이동' }).click()
  await expect(page.getByRole('button', { name: '11월로 이동' })).toBeDisabled()
  await page.getByRole('button', { name: '12월로 이동' }).click()
  await page.getByRole('button', { name: '2025년 12월 18일 업데이트 선택' }).click()

  await expect(page.locator('.rh-date-trigger')).toContainText('2025.12.18')
  await expect(page.locator('.rh-release-card')).toHaveCount(1)
  await expect(page.locator('.rh-release-card')).toContainText('Winter')

  await page.locator('.rh-date-trigger').click()
  await page.getByRole('button', { name: '전체 날짜 보기' }).click()
  const notice = page.locator('.rh-notice-link').first()
  await expect(notice).toHaveAttribute('target', '_blank')
  await expect(notice).toHaveAttribute('href', releases[0].notice_url)
})

test('expanded songs show album art and level colors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single visual coverage')
  await mockApis(page, releases)
  await page.goto('/updates')

  const firstSong = page.locator('.rh-song-row').first()
  await expect(firstSong.locator('.rh-song-art img')).toHaveAttribute('src', /\/static\/rnr_image\/img_music\/echo\.bmp$/)
  await expect(firstSong.locator('.rh-levels button')).toHaveCount(3)
  expect(await firstSong.locator('.rh-levels button').first().evaluate(element => element.style.getPropertyValue('--lv-bar'))).toContain('oklch')
})

test('deletion events share the date card and songs expose direct preview links', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single interaction coverage')
  await mockApis(page, releases)
  await page.goto('/updates')

  const firstCard = page.locator('.rh-release-card').first()
  await expect(page.locator('.rh-release-card')).toHaveCount(5)
  await expect(firstCard.locator('.rh-notice-link')).toHaveCount(2)
  await expect(firstCard.locator('.rh-notice-link').nth(0)).toHaveAttribute('href', releases[0].notice_urls[0])
  await expect(firstCard.locator('.rh-notice-link').nth(1)).toHaveAttribute('href', releases[0].notice_urls[1])

  const deletedRow = firstCard.locator('.rh-song-row').filter({ hasText: 'OLD WORLD' })
  await expect(deletedRow.locator('.rh-delete-tag')).toHaveText('삭제')
  await expect(deletedRow.getByRole('link', { name: 'YouTube에서 듣기' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb')
  const previewLink = firstCard.locator('.rh-song-row').first().getByRole('link', { name: 'YouTube에서 듣기' })
  await expect(previewLink).toHaveText('♪')
  await expect(previewLink).toHaveClass(/song-youtube-icon/)
  await expect(previewLink).toHaveAttribute('target', '_blank')
})

test('entries without an official notice URL are omitted', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single behavior coverage')
  await mockApis(page, [
    releases[0],
    { release_date: '2026-09-24', notice_url: null, notice_urls: [], songs: [{ name: 'NO NOTICE', artist: 'Unknown', levels: [5] }] },
  ])
  await page.goto('/updates')

  await expect(page.locator('.rh-release-card')).toHaveCount(1)
  await expect(page.getByText('NO NOTICE')).toHaveCount(0)
})

test('clicking the release row toggles its songs without hijacking the notice link', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single interaction coverage')
  await mockApis(page, releases)
  await page.goto('/updates')

  const firstCard = page.locator('.rh-release-card').first()
  const firstHead = firstCard.locator('.rh-card-head')
  await expect(firstCard.locator('.rh-card-body')).toBeVisible()
  await firstHead.click({ position: { x: 20, y: 20 } })
  await expect(firstCard.locator('.rh-card-body')).toBeHidden()
  await firstHead.click({ position: { x: 20, y: 20 } })
  await expect(firstCard.locator('.rh-card-body')).toBeVisible()

  const notice = firstCard.locator('.rh-notice-link').first()
  await notice.evaluate(element => element.addEventListener('click', event => event.preventDefault(), { once: true }))
  await notice.click()
  await expect(firstCard.locator('.rh-card-body')).toBeVisible()
})

test('song row opens the highest difficulty and level buttons open their own catalog', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single interaction coverage')
  await mockApis(page, releases)
  await page.goto('/updates')

  const firstSong = page.locator('.rh-song-row').first()
  await firstSong.click({ position: { x: 100, y: 20 } })
  await expect(page).toHaveURL(/\/updates#song=103$/)
  await expect(page.getByRole('complementary', { name: 'ECHOES OF TIME (PREQUEL I) 곡 상세' })).toBeVisible()
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page).toHaveURL(/\/updates$/)

  await firstSong.getByRole('button', { name: '난이도 4.5 카탈로그 열기' }).click()
  await expect(page).toHaveURL(/\/updates#song=102$/)
  await expect(page.getByRole('complementary', { name: 'ECHOES OF TIME (PREQUEL I) 곡 상세' })).toBeVisible()
})

test('desktop and mobile navigation place update history between songs and rankings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'single navigation coverage')
  await mockApis(page, releases)
  await page.goto('/')

  const desktopLinks = page.locator('.side .page-nav-item')
  await expect(desktopLinks.nth(0)).toHaveText('곡 목록')
  await expect(desktopLinks.nth(1)).toHaveText('업데이트 내역')
  await expect(desktopLinks.nth(2)).toHaveText('개인 성과')
  await desktopLinks.nth(1).click()
  await expect(page).toHaveURL(/\/updates$/)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobileLinks = page.locator('.rh-mobile-head .mob-pnav-item')
  await expect(mobileLinks.nth(0)).toHaveText('곡')
  await expect(mobileLinks.nth(1)).toHaveText('업데이트 내역')
  await expect(mobileLinks.nth(2)).toHaveText('성과')
  await expect(mobileLinks.nth(1)).toHaveClass(/\bon\b/)
})
