import { test, expect } from '@playwright/test'
import { watchLayout } from './layout.js'

test.use({ storageState: { cookies: [], origins: [] } })
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
const oldKey = 'r2archive:notice:nginx-http2-2026-11-19'
const nginxKey = 'r2archive:notice:nginx-traefik-2026-11-20'
const jdkKey = 'r2archive:notice:CVE-2026-114938'
const paragraphs = [
  'R2 Archive는 2026년 11월 19일 공개된 NGINX HTTP/2 보안 취약점에 대응하여, 웹사이트의 외부 접속을 처리하는 리버스 프록시를 NGINX에서 Traefik으로 전환했습니다.',
  'R2Archive는 안심하고 이용할 수 있도록 앞으로도 보안 취약점 발생 시 신속히 대응하겠습니다.',
]
const dialog = page => page.getByRole('dialog', { name: '보안 이슈 안내', exact: true })

async function enter(page, baseURL, keys = [], time = '2026-11-20T02:30:00+09:00', gate) {
  await page.clock.setFixedTime(new Date(time))
  await page.route('https://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user: null } })
    if (route.request().resourceType() === 'image') await gate
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.goto('https://r2archive.com/?auth=notice-test', { waitUntil: 'domcontentloaded' })
  await page.evaluate(keys => keys.forEach(key => localStorage.setItem(key, '1')), keys)
  await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
  return dialog(page)
}
const stored = page => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [oldKey, nginxKey, jdkKey])

test('paginates unread notices with stable layout during pending artwork and navigation', async ({ page, baseURL }, info) => {
  if (info.project.use.viewport.width <= 768) await page.setViewportSize({ width: 390, height: 844 })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const notice = await enter(page, baseURL, [], undefined, gate)
  await expect(notice.locator('section')).toHaveCount(1)
  await expect(notice.getByRole('heading', { name: 'NGINX 보안 취약점 안내', exact: true })).toBeVisible()
  await expect(notice.locator('section p')).toHaveText(paragraphs)
  await expect(notice).not.toContainText('OpenJDK')
  await expect(notice.getByRole('button', { name: '확인', exact: true })).toBeFocused()
  const link = notice.getByRole('link', { name: 'NGINX 공식 보안 공지 보기' })
  await expect(link).toHaveAttribute('href', 'https://nginx.org/en/security_advisories.html')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.locator('.masthead')).toBeVisible()
  await expect(page.locator('.services')).toBeVisible()
  await expect(page.locator('.archive-portal footer')).toBeVisible()
  const layout = await watchLayout(page, ['.masthead', '.services', '.archive-portal footer'])
  await layout.expectStable()
  await notice.getByRole('button', { name: '다음', exact: true }).click()
  await expect(notice.locator('section')).toHaveCount(1)
  await expect(notice).toContainText('OpenJDK 보안 이슈 안내')
  await expect(notice).not.toContainText('NGINX')
  await expect(notice.getByRole('link', { name: 'KISA 보안 공지 보기' })).toHaveAttribute('href', /nttId=72313/)
  await layout.expectStable()
  await notice.getByRole('button', { name: '이전', exact: true }).click()
  await expect(notice.locator('section p')).toHaveText(paragraphs)
  await layout.expectStable()
  release()
  await expect.poll(() => page.locator('.masthead img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  await layout.expectStable()
  await notice.getByRole('button', { name: '확인', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await layout.expectStable()
  await layout.stop()
  expect(await stored(page)).toEqual([null, '1', '1'])
  await page.reload()
  await expect(notice).toHaveCount(0)
})

for (const keys of [[jdkKey], [jdkKey, oldKey]]) {
  test(`preserves OpenJDK acknowledgement and repeats only new NGINX: ${keys.length}`, async ({ page, baseURL }) => {
    const notice = await enter(page, baseURL, keys)
    await expect(notice.locator('section p')).toHaveText(paragraphs)
    await expect(notice).not.toContainText('OpenJDK')
    await expect(notice.getByRole('button', { name: '다음', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    expect(await stored(page)).toEqual([keys.includes(oldKey) ? '1' : null, '1', '1'])
    await page.reload()
    await expect(notice).toHaveCount(0)
  })
}

test('old NGINX acknowledgement preserves the new notice and unseen OpenJDK', async ({ page, baseURL }) => {
  const notice = await enter(page, baseURL, [oldKey])
  await expect(notice.locator('section p')).toHaveText(paragraphs)
  await expect(notice.getByRole('button', { name: '다음', exact: true })).toBeVisible()
  await notice.getByRole('button', { name: '확인', exact: true }).click()
  expect(await stored(page)).toEqual(['1', '1', null])
  await page.reload()
  await expect(notice).toContainText('OpenJDK')
  await expect(notice).not.toContainText('NGINX')
  await page.keyboard.press('Escape')
  expect(await stored(page)).toEqual(['1', '1', '1'])
})

test('Escape acknowledges only pages actually visited', async ({ page, baseURL }) => {
  const notice = await enter(page, baseURL)
  await page.keyboard.press('Escape')
  expect(await stored(page)).toEqual([null, '1', null])
  await page.reload()
  await expect(notice).toContainText('OpenJDK')
  await page.keyboard.press('Escape')
  expect(await stored(page)).toEqual([null, '1', '1'])
})

test('unread OpenJDK remains available through Next during the new NGINX campaign', async ({ page, baseURL }) => {
  const notice = await enter(page, baseURL, [], '2026-11-25T00:00:00+09:00')
  await expect(notice).toContainText('NGINX')
  await notice.getByRole('button', { name: '다음', exact: true }).click()
  await expect(notice).toContainText('OpenJDK')
  await page.keyboard.press('Escape')
  expect(await stored(page)).toEqual([null, '1', '1'])
})

test('expired notices remain available manually with previous and next navigation', async ({ page, baseURL }) => {
  const notice = await enter(page, baseURL, [], '2026-11-27T00:00:00+09:00')
  await expect(notice).toHaveCount(0)
  expect(await stored(page)).toEqual([null, null, null])
  await page.getByRole('button', { name: '보안 안내', exact: true }).click()
  await expect(notice).toContainText('NGINX')
  await notice.getByRole('button', { name: '다음', exact: true }).click()
  await expect(notice).toContainText('OpenJDK')
  await notice.getByRole('button', { name: '이전', exact: true }).click()
  await expect(notice).toContainText('NGINX')
  await page.keyboard.press('Escape')
})

test('manual reopening includes acknowledged pages', async ({ page, baseURL }) => {
  const notice = await enter(page, baseURL, [nginxKey, jdkKey])
  await expect(notice).toHaveCount(0)
  await page.getByRole('button', { name: '보안 안내', exact: true }).click()
  await expect(notice).toContainText('NGINX')
  await notice.getByRole('button', { name: '다음', exact: true }).click()
  await expect(notice).toContainText('OpenJDK')
  await page.keyboard.press('Escape')
})

test('direct shop entry repeats only NGINX for acknowledged OpenJDK visitors', async ({ page, baseURL }) => {
  await enter(page, baseURL, [jdkKey])
  await page.goto('https://r2archive.com/shop', { waitUntil: 'domcontentloaded' })
  await expect(dialog(page)).toContainText('NGINX')
  await expect(dialog(page)).not.toContainText('OpenJDK')
  await page.keyboard.press('Escape')
  await page.goto('https://r2archive.com/', { waitUntil: 'domcontentloaded' })
  await expect(dialog(page)).toHaveCount(0)
})

test('storage failures permit pagination and dismissal', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Denied', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError') }
  })
  const notice = await enter(page, baseURL)
  await expect(notice).toContainText('NGINX')
  await notice.getByRole('button', { name: '다음', exact: true }).click()
  await expect(notice).toContainText('OpenJDK')
  await page.keyboard.press('Escape')
  await expect(notice).toHaveCount(0)
})
