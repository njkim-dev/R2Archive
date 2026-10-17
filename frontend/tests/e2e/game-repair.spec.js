import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { watchLayout } from './layout.js'

const manifest = { version: '10659', snapshot: '10659-test', files: [{ name: 'Game.exe', size: 4 }, { name: 'hv.dll', size: 4 }, { name: 'steam_api.dll', size: 4 }] }
async function fixture(testInfo, version = '10659', includePatch = true) {
  const root = testInfo.outputPath('R2beat')
  await mkdir(path.join(root, 'PatchInfo'), { recursive: true })
  await mkdir(path.join(root, 'nested'), { recursive: true })
  if (includePatch) await writeFile(path.join(root, 'PatchInfo', 'Patch.ini'), `[patch]\r\nversion=${version}\r\n`)
  await writeFile(path.join(root, 'Game.exe'), 'game')
  await writeFile(path.join(root, 'steam_api.dll'), 'bad')
  await writeFile(path.join(root, 'nested', 'hv.dll'), 'good')
  return root
}
async function setup(page, gate = Promise.resolve()) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw new TypeError("Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle': Name is not allowed.") }
    window.__scanGate = Promise.resolve()
    window.__readFiles = []
    const original = File.prototype.text
    File.prototype.text = async function () {
      window.__readFiles.push(this.webkitRelativePath)
      await window.__scanGate
      return original.call(this)
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

test('real directory input reads INI and DLL metadata despite blocked native handles, with stable layout', async ({ page }, testInfo) => {
  let releaseManifest
  const gate = new Promise(resolve => { releaseManifest = resolve })
  await setup(page, gate)
  const root = await fixture(testInfo)
  await page.goto('/game-repair')
  await expect(page.locator('.repair-results')).toBeVisible()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-results'])
  releaseManifest()
  const scan = page.getByRole('button', { name: '설치 폴더 선택 · 검사' })
  await expect(scan).toBeEnabled()
  await page.evaluate(() => { window.__scanGate = new Promise(resolve => { window.__releaseScan = resolve }) })
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(scan).toBeDisabled()
  await watcher.expectStable()
  await page.evaluate(() => window.__releaseScan())
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(2)
  await expect(page.getByRole('status')).toContainText('확인이 필요한 파일 2개')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'hv.dll' })).toContainText('누락')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'steam_api.dll' })).toContainText('크기 다름')
  expect(await page.evaluate(() => window.__readFiles)).toEqual(['R2beat/PatchInfo/Patch.ini'])
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'hv.dll' }).getByRole('link', { name: '파일 받기' }))
    .toHaveAttribute('href', '/api/game-repair/files/10659-test/hv.dll')
  await watcher.expectStable()
  await writeFile(path.join(root, 'hv.dll'), 'good')
  await writeFile(path.join(root, 'steam_api.dll'), 'good')
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.getByRole('status')).toContainText('누락되거나 크기가 다른 파일이 없습니다.')
  await watcher.expectStable()
  await watcher.stop()
})

test('different patch version blocks recovery and reports patch guidance', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo, '10658'))
  await expect(page.getByRole('status')).toContainText('런처에서 패치를 받은 후')
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '파일 받기' })).toHaveCount(0)
})

test('missing patch INI explains the folder problem without offering downloads', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/game-repair')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo, '10659', false))
  await expect(page.getByRole('status')).toContainText('PatchInfo/Patch.ini가 없습니다.')
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
