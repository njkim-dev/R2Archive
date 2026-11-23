import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { watchLayout } from './layout.js'
import { setup } from './shopFixtures.js'

test.afterEach(async ({ page, context }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.unrouteAll({ behavior: 'ignoreErrors' })
})

async function portalRoute(page, baseURL, gate) {
  await page.route('https://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/game-repair/status') return route.fulfill({ json: { enabled: true, revision: 'initial', message: '' } })
    if (url.pathname === '/api/songs/recent') {
      await gate
      return route.fulfill({ json: [1, 2, 3].map(id => ({ id, name: '신곡 ' + id, artist: '테스트' })) })
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user: null } })
    if (route.request().resourceType() === 'image' && url.pathname.includes('/assets/archive-home/')) await gate
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
}

for (const portrait of [false, true]) {
  test(`portal layout stays stable while artwork loads, portrait=${portrait}`, async ({ page, baseURL }) => {
    if (portrait) await page.setViewportSize({ width: 390, height: 844 })
    let release
    const gate = new Promise(resolve => { release = resolve })
    await portalRoute(page, baseURL, gate)
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /알투비트\s*아카이브/ })).toBeVisible()
    const watcher = await watchLayout(page, ['.archive-portal .masthead', '.portal-albums', '.archive-portal .services', '.archive-portal footer'])
    await watcher.expectStable()
    release()
    await expect.poll(() => page.locator('.masthead img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await watcher.expectStable()
    await watcher.stop()
    await expect(page.locator('.services strong')).toHaveText(['음악 둘러보기', '의상 입어보기', '내 옷장 열기', '게임 복구하기'])
    await expect(page.getByRole('link', { name: /의상 입어보기/ })).toHaveAttribute('href', '/shop')
    await expect(page.getByRole('link', { name: /신곡 1/ })).toHaveAttribute('href', '/music/#song=1')
    await expect(page.getByRole('link', { name: /앙코르 상점 바로 보러 가기/ })).toHaveAttribute('href', '/shop/encore')
    const official = page.getByRole('link', { name: '공식 홈페이지 ↗' })
    await expect(official).toHaveAttribute('href', 'https://vfunkr.valofe.com/library/r2beat-ko')
    await expect(official).toHaveAttribute('target', '_blank')
    await expect(official).toHaveAttribute('rel', 'noopener noreferrer')
    await page.waitForLoadState('load')
    await official.click({ trial: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(await page.locator('.archive-portal').evaluate(node => getComputedStyle(node).backgroundImage.includes('url('))).toBe(false)
    expect(await page.locator('.services').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(page.viewportSize().width <= 800 ? 2 : 4)
    await page.getByRole('link', { name: /게임 복구하기/ }).click()
    await expect(page.getByRole('heading', { name: '게임 설치 파일 검사 및 복구' })).toBeVisible()
    await page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' }).click()
    await expect(page.locator('.repair-guide')).toContainText('경로를 모르면 VLauncher에서 게임 실행 버튼 좌측의 설정 버튼을 클릭하면, 설치 경로를 확인할 수 있습니다.')
    await expect(page.locator('.repair-guide')).not.toContainText('기본 설치 경로')
    await expect(page.locator('.repair-guide')).not.toContainText('SHA-256')
    await expect(page.locator('.repair-heading p')).toHaveText('알투비트의 주요 게임 파일을 검사합니다.')
    await page.unrouteAll({ behavior: 'wait' })
  })
}

test('the home Encore card opens the sales list directly and Back returns home', async ({ page, baseURL }) => {
  if (page.viewportSize().width <= 800) await page.setViewportSize({ width: 390, height: 900 })
  await setup(page, { loggedIn: false, admin: false })
  await page.route('https://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) return route.fallback()
    await route.fulfill({ response: await route.fetch({ url: baseURL + url.pathname + url.search }) })
  })
  await page.goto('https://r2archive.com/')
  const feature = page.getByRole('link', { name: /앙코르 상점 바로 보러 가기/ })
  await feature.click()
  await expect(page).toHaveURL('https://r2archive.com/shop/encore')
  await expect(page.locator('.encore-offer').first()).toBeVisible()
  await page.goBack()
  await expect(feature).toBeVisible()
})

test('recent songs preserve the home layout when the service is unavailable', async ({ page, baseURL }) => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  await portalRoute(page, baseURL)
  await page.route('**/api/songs/recent', async route => { await gate; await route.fulfill({ status: 503 }) })
  await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.portal-albums')).toHaveAttribute('aria-busy', 'true')
  const layout = await watchLayout(page, ['.portal-albums', '.portal-feature', '.archive-portal footer'])
  release()
  await expect(page.getByRole('link', { name: '전체 곡 목록 열기' })).toBeVisible()
  await layout.expectStable()
  await layout.stop()
})

test('guest My Home card starts login and returns to My Home', async ({ page, baseURL }, testInfo) => {
  if (testInfo.project.use.viewport.width <= 768) await page.setViewportSize({ width: 390, height: 900 })
  let releaseAuth, signedIn = false
  const gate = new Promise(resolve => { releaseAuth = resolve })
  await portalRoute(page, baseURL)
  await page.route('**/api/auth/me', async route => {
    await gate
    await route.fulfill({ json: { user: signedIn ? { id: 1, nickname: '테스터', onboarded: true } : null } })
  })
  await page.route('**/api/auth/google/login?*', async route => {
    signedIn = true
    await route.fulfill({ status: 204 })
  })
  await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
  const card = page.getByRole('button', { name: /내 옷장 열기/ })
  await card.scrollIntoViewIfNeeded()
  await expect(card).toBeDisabled()
  const layout = await watchLayout(page, ['.archive-portal .masthead', '.archive-portal .services', '.myhome-service'])
  releaseAuth()
  await expect(card).toBeEnabled()
  await layout.expectStable()
  await card.click()
  const login = page.locator('.login-modal')
  await expect(login).toBeVisible()
  await layout.expectStable()
  await layout.stop()
  await login.getByRole('button', { name: 'Google로 계속하기' }).click()
  await expect.poll(() => signedIn).toBe(true)
  await page.goto('https://r2archive.com/?auth=ok')
  await expect(page).toHaveURL('https://r2archive.com/myhome')
  await expect(page.getByRole('heading', { name: '마이홈', exact: true })).toBeVisible()
  await expect(page.getByText('로그인 후 이용할 수 있습니다.')).toHaveCount(0)
})


test('cache-only reset removes an old permanent redirect and preserves settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1920', 'Same caching behavior at every width')
  let legacy = true
  let redirects = 0
  const server = createServer((request, response) => {
    if (request.url === '/' && legacy) {
      redirects++
      response.writeHead(301, { Location: '/music', 'Cache-Control': 'public, max-age=86400' })
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(request.url === '/?refresh=home' ? { 'Clear-Site-Data': '"cache"' } : {}) })
    response.end(request.url === '/music' ? '<h1>Legacy music</h1>' : '<h1>Portal</h1>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    await page.goto(origin + '/')
    await expect(page).toHaveURL(origin + '/music')
    await page.evaluate(() => { localStorage.setItem('settings', 'keep'); document.cookie = 'session=keep; SameSite=Lax' })
    legacy = false
    await page.goto(origin + '/')
    await expect(page).toHaveURL(origin + '/music')
    expect(redirects).toBe(1)
    await page.goto(origin + '/?refresh=home')
    await expect(page.getByRole('heading', { name: 'Portal' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('settings'))).toBe('keep')
    expect(await page.evaluate(() => document.cookie)).toContain('session=keep')
    await page.goto(origin + '/')
    await expect(page).toHaveURL(origin + '/')
    await expect(page.getByRole('heading', { name: 'Portal' })).toBeVisible()
  } finally { await new Promise(resolve => server.close(resolve)) }
})
