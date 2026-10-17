import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { watchLayout } from './layout.js'

async function portalRoute(page, baseURL, gate) {
  await page.route('http://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
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
    await page.goto('http://r2archive.com/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '함께 즐기는, 알투비트의 모든 순간.' })).toBeVisible()
    const watcher = await watchLayout(page, ['.archive-portal .masthead', '.archive-portal .intro', '.archive-portal .services', '.archive-portal footer'])
    await watcher.expectStable()
    release()
    await expect.poll(() => page.locator('.artwork img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await watcher.expectStable()
    await watcher.stop()
    await expect(page.locator('.music p')).toHaveText('예전 서비스 음악부터 새로운 음악까지,알투비트 곡들을 만나보세요.')
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
    await page.locator('.repair').click()
    await expect(page.getByRole('heading', { name: '게임 설치 파일 검사 및 복구' })).toBeVisible()
    await page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' }).click()
    await expect(page.locator('.repair-guide')).toContainText('경로를 모르면 VLauncher에서 게임 실행 버튼 좌측의 설정 버튼을 클릭하면, 설치 경로를 확인할 수 있습니다.')
    await expect(page.locator('.repair-guide')).not.toContainText('기본 설치 경로')
    await expect(page.locator('.repair-guide')).not.toContainText('SHA-256')
    await expect(page.locator('.repair-heading p')).toHaveText('알투비트의 주요 게임 파일을 검사합니다.')
  })
}

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
