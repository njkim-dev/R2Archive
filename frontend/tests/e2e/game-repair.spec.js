import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { watchLayout } from './layout.js'

const entry = (name, content) => ({ name, size: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') })
const manifest = { version: '10659', snapshot: '10659-test', files: [entry('Game.exe', 'game'), entry('hv.dll', 'good'), entry('steam_api.dll', 'good'), entry('rnr_boost_mode.pak', 'good'), entry('rnr_music1.pak', 'good'), entry('other.dll', 'good')] }
async function fixture(testInfo, version = '10659', includePatch = true) {
  const root = testInfo.outputPath('R2beat')
  await mkdir(path.join(root, 'PatchInfo'), { recursive: true })
  await mkdir(path.join(root, 'nested'), { recursive: true })
  if (includePatch) await writeFile(path.join(root, 'PatchInfo', 'Patch.ini'), `[patch]\r\nversion=${version}\r\n`)
  await writeFile(path.join(root, 'Game.exe'), 'game')
  await writeFile(path.join(root, 'steam_api.dll'), 'bad')
  await writeFile(path.join(root, 'rnr_boost_mode.pak'), 'evil')
  await writeFile(path.join(root, 'rnr_music1.pak'), 'evil')
  await writeFile(path.join(root, 'other.dll'), 'evil')
  await writeFile(path.join(root, 'nested', 'hv.dll'), 'good')
  return root
}
async function setup(page, gate = Promise.resolve()) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw new TypeError("Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle': Name is not allowed.") }
    window.__readFiles = []
    File.prototype.text = async function () {
      window.__readFiles.push(this.webkitRelativePath)
      throw new Error('INI and game file text must not be read')
    }
  })
  await page.context().route('**/api/**', async route => {
    const urlPath = new URL(route.request().url()).pathname
    if (!urlPath.startsWith('/api/')) return route.continue()
    if (urlPath === '/api/game-repair/manifest') { await gate; return route.fulfill({ json: manifest }) }
    if (urlPath.startsWith('/api/game-repair/files/')) return route.fulfill({ body: 'good', contentType: 'application/octet-stream' })
    if (urlPath === '/api/auth/me') return route.fulfill({ json: { user: null } })
    return route.fulfill({ json: [] })
  })
}

test('worker SHA-256 detects equal-size pack corruption and excludes music, with stable layout', async ({ page }, testInfo) => {
  let releaseManifest
  const gate = new Promise(resolve => { releaseManifest = resolve })
  await setup(page, gate)
  const root = await fixture(testInfo)
  let releaseHash
  const hashGate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await hashGate; await route.continue().catch(() => {}) })
  await page.goto('/game-repair')
  await expect(page.locator('.repair-results')).toBeVisible()
  await expect(page.locator('.repair-results th')).toHaveText(['파일', '상태', '다운로드'])
  await expect(page.locator('.repair-guide')).not.toContainText('최상위')
  await expect(page.locator('.repair-guide')).not.toContainText('rnr_music')
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-results'])
  releaseManifest()
  const scan = page.getByRole('button', { name: '설치 폴더 선택 · 검사' })
  await expect(scan).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(scan).toBeDisabled()
  await watcher.expectStable()
  await expect(page.getByRole('status')).toContainText('SHA-256 검사 중')
  await watcher.expectStable()
  releaseHash()
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(3)
  await expect(page.getByRole('status')).toContainText('확인이 필요한 파일 3개')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'hv.dll' })).toContainText('누락')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'steam_api.dll' })).toContainText('불일치')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'rnr_boost_mode.pak' })).toContainText('불일치')
  await expect(page.locator('.repair-status')).toContainText('검사 대상 4개')
  expect(await page.evaluate(() => window.__readFiles)).toEqual([])
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'hv.dll' }).getByRole('link', { name: '파일 받기' }))
    .toHaveAttribute('href', '/api/game-repair/files/10659-test/hv.dll')
  await watcher.expectStable()
  await writeFile(path.join(root, 'hv.dll'), 'good')
  await writeFile(path.join(root, 'steam_api.dll'), 'good')
  await writeFile(path.join(root, 'rnr_boost_mode.pak'), 'good')
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.getByRole('status')).toContainText('검사 대상 파일의 SHA-256이 모두 일치합니다.')
  await watcher.expectStable()
  await watcher.stop()
})

test('cancelling a pending worker never reports a partially scanned installation as normal', async ({ page }, testInfo) => {
  await setup(page)
  let releaseHash
  const gate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await gate; await route.continue().catch(() => {}) })
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-results'])
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo))
  await expect(page.getByRole('status')).toContainText('SHA-256 검사 중')
  await page.getByRole('button', { name: '검사 취소' }).click()
  await expect(page.getByRole('status')).toContainText('검사를 취소했습니다.')
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
  await watcher.expectStable()
  await watcher.stop()
  releaseHash()
})

test('Game.exe is hashed and not accepted merely because its size matches', async ({ page }, testInfo) => {
  await setup(page)
  const root = await fixture(testInfo)
  await writeFile(path.join(root, 'Game.exe'), 'evil')
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'Game.exe' })).toContainText('불일치')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'rnr_music' })).toHaveCount(0)
})

test('different or invalid INI values do not prevent hashing or downloads', async ({ page }, testInfo) => {
  await setup(page)
  const root = await fixture(testInfo, '10658')
  await writeFile(path.join(root, 'PatchInfo', 'Patch.ini'), 'unrelated invalid version information')
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.getByRole('status')).toContainText('확인이 필요한 파일 3개')
  expect(await page.evaluate(() => window.__readFiles)).toEqual([])
})

test('installations without Patch.ini can be inspected', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo, '10659', false))
  await expect(page.getByRole('status')).toContainText('확인이 필요한 파일 3개')
  expect(await page.evaluate(() => window.__readFiles)).toEqual([])
})

test('root domain opens the portal and its repair button without redirecting to music', async ({ page, baseURL }) => {
  await setup(page)
  await page.route('http://r2archive.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user: null } })
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.goto('http://r2archive.com/')
  await expect(page.getByRole('link', { name: '게임 복구 시스템' })).toBeVisible()
  await expect(page.getByRole('link', { name: '음악 아카이브' })).toHaveAttribute('href', 'https://music.r2archive.com')
  await page.getByRole('link', { name: '게임 복구 시스템' }).click()
  await expect(page).toHaveURL('http://r2archive.com/game-repair')
  await expect(page.getByRole('heading', { name: '게임 설치 파일 검사 · 복구' })).toBeVisible()
})
