import { expect, test } from '@playwright/test'
import { watchLayout } from './layout.js'

const manifest = { version: '10659', snapshot: '10659-test', files: [{ name: 'Game.exe', size: 4 }, { name: 'hv.dll', size: 4 }, { name: 'steam_api.dll', size: 4 }] }
async function setup(page, version = '10659', gate = Promise.resolve()) {
  await page.addInitScript(version => {
    window.__scanGate = Promise.resolve()
    window.__files = new Map([['Game.exe', 'game'], ['steam_api.dll', 'bad']])
    const fileHandle = name => ({ kind: 'file', async getFile() { await window.__scanGate; return new File([window.__files.get(name)], name) }, async createWritable() {
      const chunks = []
      return { async write(value) { chunks.push(value) }, async close() { window.__files.set(name, await new Blob(chunks).text()) }, async abort() {} }
    } })
    const backup = { async getFileHandle() { return { async createWritable() { return new WritableStream({ write() {} }) } } } }
    const directory = {
      name: 'R2beat', async requestPermission() { return 'granted' },
      async getDirectoryHandle(name) {
        if (name === 'R2Archive-backup') return backup
        return { async getFileHandle() { return { async getFile() { return new File([`[patch]\nversion=${version}`], 'Patch.ini') } } } }
      },
      async getFileHandle(name, options) {
        if (!window.__files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError')
        if (!window.__files.has(name)) window.__files.set(name, '')
        return fileHandle(name)
      },
      async *entries() { for (const name of window.__files.keys()) yield [name, fileHandle(name)] },
    }
    window.showDirectoryPicker = async () => directory
  }, version)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/game-repair/manifest') { await gate; return route.fulfill({ json: manifest }) }
    if (path.startsWith('/api/game-repair/files/')) return route.fulfill({ body: 'good', contentType: 'application/octet-stream' })
    if (path === '/api/auth/me') return route.fulfill({ json: { user: null } })
    return route.fulfill({ json: [] })
  })
}

test('reference loading, scan and repair preserve toolbar and result geometry', async ({ page }) => {
  let releaseManifest
  const gate = new Promise(resolve => { releaseManifest = resolve })
  await setup(page, '10659', gate)
  await page.goto('/game-repair')
  await expect(page.locator('.repair-results')).toBeVisible()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-results'])
  releaseManifest()
  const scan = page.getByRole('button', { name: '설치 폴더 선택 · 검사' })
  await expect(scan).toBeEnabled()
  await page.evaluate(() => { window.__scanGate = new Promise(resolve => { window.__releaseScan = resolve }) })
  await scan.click()
  await expect(scan).toBeDisabled()
  await watcher.expectStable()
  await page.evaluate(() => window.__releaseScan())
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(2)
  await watcher.expectStable()
  let releaseDownload
  const downloadGate = new Promise(resolve => { releaseDownload = resolve })
  await page.route('**/api/game-repair/files/**', async route => { await downloadGate; await route.fulfill({ body: 'good' }) })
  await page.getByRole('button', { name: '문제 파일 복구', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('복구 준비 중')
  await watcher.expectStable()
  releaseDownload()
  await expect(page.getByRole('status')).toContainText('누락되거나 크기가 다른 파일이 없습니다.')
  await watcher.expectStable()
  await watcher.stop()
  expect(await page.evaluate(() => Object.fromEntries(window.__files))).toEqual({ 'Game.exe': 'game', 'steam_api.dll': 'good', 'hv.dll': 'good' })
})

test('different patch version blocks recovery and reports patch guidance', async ({ page }) => {
  await setup(page, '10658')
  await page.goto('/game-repair')
  await page.getByRole('button', { name: '설치 폴더 선택 · 검사' }).click()
  await expect(page.getByRole('status')).toContainText('런처에서 패치를 받은 후')
  await expect(page.getByRole('button', { name: '문제 파일 복구', exact: true })).toBeDisabled()
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
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
