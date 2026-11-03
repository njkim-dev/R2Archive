import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

const song = { id: 1, name: 'Home Link Test', artist: 'Test', level: 8, bpm: 160, combo: 100, time: '1:00', image: '', youtube_url: '', file_order: 1, aliases: [], artist_aliases: [], user_level_votes: 0 }

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

for (const width of [1440, 1024]) test(`sidebar scrolls as one column without clipping filters at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 700 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let json = []
    if (path === '/api/songs') json = [song]
    else if (path === '/api/meta') json = { total_count: 1, level_min: .5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (path === '/api/auth/me') { await gate; json = { user: { id: 1, nickname: '관리자', onboarded: true } } }
    else if (path.endsWith('/admin-status')) json = { is_admin: true }
    else if (path.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
    await route.fulfill({ json })
  })
  await page.goto('/')
  const sidebar = page.getByRole('complementary', { name: '사이트 탐색' })
  const context = sidebar.locator('.archive-sidebar-context')
  await expect(sidebar.getByLabel('BPM 최댓값')).toBeAttached()
  await expect.poll(() => context.evaluate(node => getComputedStyle(node).overflowY)).toBe('visible')
  expect(await context.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  const watcher = await watchLayout(page, ['.main', '.topbar', '.table-wrap'])
  await sidebar.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(sidebar.getByLabel('BPM 최댓값')).toBeInViewport()
  await expect(sidebar.locator('.archive-account')).toBeInViewport()
  expect(await sidebar.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  expect(await context.evaluate(node => node.scrollTop)).toBe(0)
  await watcher.expectStable()
  release()
  await expect(sidebar.getByRole('button', { name: '로그아웃', exact: true })).toBeEnabled()
  await expect(sidebar.getByRole('link', { name: '관리자 도구', exact: true })).toBeAttached()
  await sidebar.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(sidebar.getByRole('button', { name: '로그아웃', exact: true })).toBeInViewport()
  await expect(sidebar.getByLabel('BPM 최댓값')).toBeInViewport()
  await watcher.expectStable()
  await watcher.stop()
  await sidebar.evaluate(node => { node.scrollTop = 0 })
  await expect(sidebar.getByRole('link', { name: '한국 서버 음악', exact: true })).toBeInViewport()
})

for (const archive of ['music','xyx']) for(const loggedIn of [false,true]) {
  const host='r2archive.com'
  test(`${archive} uses ordered shared server menus with stable loading loggedIn=${loggedIn}`, async ({ page, baseURL }, testInfo) => {
    const width = testInfo.project.use.viewport.width
    const mobile = width < (archive==='xyx' ? 1100 : 768)
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route(/^https?:\/\/r2archive\.com\//, async route => {
      const url = new URL(route.request().url())
      const pathname = url.pathname.replace('/api/xyx/', '/api/')
      if (pathname.startsWith('/api/')) {
        let json = []
        if (pathname === '/api/songs') { await gate; json = [song] }
        else if (pathname === '/api/meta') json = { total_count: 1, level_min: 0.5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
        else if (pathname === '/api/auth/me') json = { user: loggedIn?{id:1,nickname:'테스터',onboarded:true}:null }
        else if (pathname.endsWith('/admin-status')) json = { is_admin: false }
        else if (pathname.endsWith('/flags')) json = { favorites: [], played: [], played_all: [] }
        return route.fulfill({ json })
      }
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    })
    await page.goto(`http://${host}/${archive}/`, { waitUntil: 'domcontentloaded' })
    const shop=page.getByRole('link',{name:'상점',exact:true}),myhome=page.getByRole('button',{name:'마이홈',exact:true})
    await expect(shop).toHaveAttribute('href','https://r2archive.com/shop');if(loggedIn)await expect(myhome).toBeEnabled();else await expect(myhome).toBeDisabled();await expect(myhome).not.toHaveAttribute('title',/.+/)
    const primary = page.getByRole('navigation', { name: '주요 페이지' })
    await expect(primary.locator('.archive-primary-item')).toHaveText(['한국 서버 음악', '중국 서버 음악', '상점', '마이홈'])
    await expect(page.locator('.server-switcher,.main-home-link')).toHaveCount(0)
    const current = primary.getByRole('link', { name: archive === 'music' ? '한국 서버 음악' : '중국 서버 음악', exact: true })
    await expect(current).toHaveAttribute('aria-current', 'page')
    const other = primary.getByRole('link', { name: archive === 'music' ? '중국 서버 음악' : '한국 서버 음악', exact: true })
    await expect(other).toHaveAttribute('href', archive === 'music' ? 'https://r2archive.com/xyx/' : 'https://r2archive.com/music/')
    if(!loggedIn){await myhome.locator('..').hover();await expect(page.getByRole('tooltip')).toHaveText('로그인하세요');await page.mouse.move(1,1);await expect(page.getByRole('tooltip')).toHaveCount(0)}
    const home = page.getByRole('link', { name: 'R2 Archive 메인 홈페이지', exact: true })
    await expect(home).toBeVisible()
    await expect(home).toHaveAttribute('href', 'https://r2archive.com/?refresh=home')
    if (!mobile) {
      const homeBox = await home.boundingBox(), serverBox = await current.boundingBox()
      expect(homeBox.y + homeBox.height).toBeLessThanOrEqual(serverBox.y)
    }
    const watcher = await watchLayout(page, mobile ? ['.archive-mobile-bottom', '.archive-mobile-header', '.app-mobile'] : ['.side .archive-primary-nav', '.topbar', '.main'])
    await watcher.expectStable()
    release()
    if (!mobile) await expect(page.locator('.tbl-row')).toHaveCount(1)
    else await expect(page.getByText(song.name, { exact: true })).toBeVisible()
    await watcher.expectStable()
    await watcher.stop()
    if (loggedIn) {
      await page.getByPlaceholder('검색어 입력, 검색어가 여러 개면 쉼표 사용 가능').fill('Home Link')
      await other.click()
      await expect(page).toHaveURL(new RegExp('/' + (archive === 'music' ? 'xyx' : 'music') + '/'))
      await expect(page.getByPlaceholder('검색어 입력, 검색어가 여러 개면 쉼표 사용 가능')).toHaveValue('Home Link')
      await expect(other).toHaveAttribute('aria-current', 'page')
    }
    await page.route('https://r2archive.com/?refresh=home', route => route.fulfill({ contentType: 'text/html', body: '<h1>Main homepage</h1>' }))
    await home.click()
    await expect(page).toHaveURL('https://r2archive.com/?refresh=home')
    await expect(page.getByRole('heading', { name: 'Main homepage' })).toBeVisible()
  })
}
