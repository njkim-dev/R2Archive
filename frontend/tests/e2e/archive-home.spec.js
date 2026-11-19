import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { watchLayout } from './layout.js'

async function portalRoute(page, baseURL, gate) {
  await page.route('https://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/game-repair/status') return route.fulfill({ json: { enabled: true, revision: 'initial', message: '' } })
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
    await expect(page.getByRole('heading', { name: '함께 즐기는, 알투비트의 모든 순간.' })).toBeVisible()
    const watcher = await watchLayout(page, ['.archive-portal .masthead', '.archive-portal .intro', '.archive-portal .services', '.archive-portal footer'])
    await watcher.expectStable()
    release()
    await expect.poll(() => page.locator('.artwork img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await watcher.expectStable()
    await watcher.stop()
    await expect(page.locator('.music p')).toHaveText('예전 서비스 음악부터 새로운 음악까지,알투비트 곡들을 만나보세요.')
    await expect(page.getByRole('link', { name: '아이템 상점 둘러보기', exact: true })).toHaveAttribute('href', '/shop')
    await expect(page.locator('.shop-service')).not.toContainText('ADMIN')
    await expect(page.locator('.repair p')).toHaveText('게임이 튕기시나요?게임 파일을 검사하고 복구하세요.')
    await expect(page.locator('.game-logo image')).toHaveAttribute('href', /r2beat-logo-transparent/)
    const official = page.getByRole('link', { name: '공식 홈페이지 ↗' })
    await expect(official).toHaveAttribute('href', 'https://vfunkr.valofe.com/library/r2beat-ko')
    await expect(official).toHaveAttribute('target', '_blank')
    await expect(official).toHaveAttribute('rel', 'noopener noreferrer')
    await page.waitForLoadState('load')
    await official.click({ trial: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(await page.locator('.archive-portal').evaluate(node => getComputedStyle(node).backgroundImage.includes('url('))).toBe(false)
    if (portrait) {
      expect(await page.locator('.artwork img').evaluate(image => image.currentSrc)).toContain('r2beat-aquarium-portrait')
      expect(await page.locator('.services').evaluate(node => node.getBoundingClientRect().left > innerWidth / 2)).toBe(true)
    }
    await expect(page.locator('.archive-portal .lead')).toHaveText('좋아하는 음악을 들으며 추억을 쌓아요.')
    await page.locator('.repair').click()
    await expect(page.getByRole('heading', { name: '게임 설치 파일 검사 및 복구' })).toBeVisible()
    await page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' }).click()
    await expect(page.locator('.repair-guide')).toContainText('경로를 모르면 VLauncher에서 게임 실행 버튼 좌측의 설정 버튼을 클릭하면, 설치 경로를 확인할 수 있습니다.')
    await expect(page.locator('.repair-guide')).not.toContainText('기본 설치 경로')
    await expect(page.locator('.repair-guide')).not.toContainText('SHA-256')
    await expect(page.locator('.repair-heading p')).toHaveText('알투비트의 주요 게임 파일을 검사합니다.')
    await page.unrouteAll({ behavior: 'wait' })
  })
}

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
  const card = page.getByRole('button', { name: '로그인하고 마이홈 열기' })
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

test.describe('security notices', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows once, keeps the portal stable and can be reopened after expiry', async ({ page, baseURL }, testInfo) => {
    if (testInfo.project.use.viewport.width <= 768) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+09:00'))
    let releaseArtwork
    const gate = new Promise(resolve => { releaseArtwork = resolve })
    await portalRoute(page, baseURL, gate)
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })

    const notice = page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('CVE-2026-114938')
    await expect(notice.locator('section').first().locator('p')).toHaveText([
      'R2 Archive는 2026년 11월 19일 공개된 NGINX HTTP/2 보안 취약점에 대응하여 HTTP/2를 일시적으로 비활성화했습니다.',
      '이미지가 많은 화면의 초기 로딩이 평소보다 느려질 수 있습니다.',
      '해당 조치는 공식 수정 패치 적용 여부를 확인할 때까지 유지합니다.',
      '앞으로도 필요한 보안 이슈에 대해 신속히 대응하겠습니다.',
    ])
    await expect(notice.getByRole('heading', { name: '보안 이슈 안내', exact: true })).toBeInViewport()
    await expect(notice.locator('section').first()).toContainText('웹 서버 보안 대응 안내 — 11월 19일')
    await expect(notice.locator('p').last()).toHaveText('앞으로도 R2 Archive를 안심하고 이용하실 수 있도록 운영 환경을 꾸준히 점검하고, 필요한 보안 업데이트를 신속히 적용하겠습니다.')
    await expect(notice.getByRole('link', { name: 'KISA 보안 공지 보기' })).toHaveAttribute('href', /nttId=72313/)
    const nginxSource = notice.getByRole('link', { name: 'NGINX 공식 보안 공지 보기' })
    await expect(nginxSource).toHaveAttribute('href', 'https://nginx.org/en/security_advisories.html')
    await expect(nginxSource).toHaveAttribute('target', '_blank')
    await expect(nginxSource).toHaveAttribute('rel', 'noopener noreferrer')
    const confirm = notice.getByRole('button', { name: '확인' })
    await expect(confirm).toBeFocused()
    const layout = await watchLayout(page, ['.masthead', '.services', '.archive-portal footer'])
    await layout.expectStable()
    releaseArtwork()
    await expect.poll(() => page.locator('.artwork img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await layout.expectStable()
    await confirm.click()
    await expect(notice).toHaveCount(0)
    await layout.expectStable()
    await layout.stop()

    await page.reload()
    const noticeLink = page.getByRole('button', { name: '보안 안내', exact: true })
    await expect(noticeLink).toBeVisible()
    await expect(notice).toHaveCount(0)
    await page.evaluate(() => {
      localStorage.removeItem('r2archive:notice:CVE-2026-114938')
      localStorage.removeItem('r2archive:notice:nginx-http2-2026-11-19')
    })
    await page.clock.setFixedTime(new Date('2026-11-26T00:00:00+09:00'))
    await page.reload()
    await expect(noticeLink).toBeVisible()
    await expect(notice).toHaveCount(0)
    await noticeLink.click()
    await expect(notice).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(notice).toHaveCount(0)
  })

  test('appears on direct shop entry and Escape dismisses it across pages', async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+09:00'))
    await portalRoute(page, baseURL)
    await page.goto('https://r2archive.com/shop', { waitUntil: 'domcontentloaded' })
    const notice = page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })
    await expect(notice).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(notice).toHaveCount(0)
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '보안 안내', exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
  })

  test('previously acknowledged OpenJDK visitors see only the new notice without moving the portal', async ({ page, baseURL }, testInfo) => {
    if (testInfo.project.use.viewport.width <= 768) await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+09:00'))
    let releaseArtwork
    const gate = new Promise(resolve => { releaseArtwork = resolve })
    await portalRoute(page, baseURL, gate)
    await page.goto('https://r2archive.com/?auth=notice-test', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('r2archive:notice:CVE-2026-114938', '1'))
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
    const notice = page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })
    await expect(notice).toBeVisible()
    await expect(notice.locator('section')).toHaveCount(1)
    await expect(notice).toContainText('NGINX HTTP/2 보안 취약점')
    await expect(notice).toContainText('앞으로도 필요한 보안 이슈에 대해 신속히 대응하겠습니다.')
    await expect(notice).not.toContainText('OpenJDK')
    await expect(notice.getByRole('link', { name: 'KISA 보안 공지 보기' })).toHaveCount(0)
    const layout = await watchLayout(page, ['.masthead', '.services', '.archive-portal footer'])
    await layout.expectStable()
    releaseArtwork()
    await expect.poll(() => page.locator('.artwork img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await layout.expectStable()
    await notice.getByRole('button', { name: '확인', exact: true }).click()
    await expect(notice).toHaveCount(0)
    await layout.expectStable()
    await layout.stop()
    expect(await page.evaluate(() => [localStorage.getItem('r2archive:notice:CVE-2026-114938'), localStorage.getItem('r2archive:notice:nginx-http2-2026-11-19')])).toEqual(['1', '1'])
    await page.reload()
    await expect(page.getByRole('button', { name: '보안 안내', exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
    await page.getByRole('button', { name: '보안 안내', exact: true }).click()
    await expect(notice.locator('section')).toHaveCount(2)
    await expect(notice).toContainText('OpenJDK')
    await expect(notice).toContainText('NGINX')
  })

  test('acknowledges only the unread notice and preserves the other acknowledgement', async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+09:00'))
    await portalRoute(page, baseURL)
    await page.goto('https://r2archive.com/?auth=notice-test', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('r2archive:notice:nginx-http2-2026-11-19', '1'))
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
    const notice = page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })
    await expect(notice.locator('section')).toHaveCount(1)
    await expect(notice).toContainText('OpenJDK')
    await expect(notice).not.toContainText('NGINX')
    await page.keyboard.press('Escape')
    await expect(notice).toHaveCount(0)
    expect(await page.evaluate(() => [localStorage.getItem('r2archive:notice:CVE-2026-114938'), localStorage.getItem('r2archive:notice:nginx-http2-2026-11-19')])).toEqual(['1', '1'])
  })

  test('expires notices independently and does not acknowledge hidden expired notices', async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date('2026-11-25T00:00:00+09:00'))
    await portalRoute(page, baseURL)
    await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
    const notice = page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })
    await expect(notice.locator('section')).toHaveCount(1)
    await expect(notice).toContainText('NGINX')
    await expect(notice).not.toContainText('OpenJDK')
    await notice.getByRole('button', { name: '확인', exact: true }).click()
    expect(await page.evaluate(() => [localStorage.getItem('r2archive:notice:CVE-2026-114938'), localStorage.getItem('r2archive:notice:nginx-http2-2026-11-19')])).toEqual([null, '1'])
    await page.reload()
    await expect(page.getByRole('button', { name: '보안 안내', exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
  })
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
