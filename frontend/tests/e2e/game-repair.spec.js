import { expect, test } from '@playwright/test'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
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
async function setup(page, gate = Promise.resolve(), reference = manifest) {
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
    if (urlPath === '/api/game-repair/manifest') { await gate; return route.fulfill({ json: reference }) }
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
  await page.goto('/game-repair?mode=launch')
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
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  await watcher.expectStable()
  releaseHash()
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(3)
  await expect(page.locator('.repair-status')).toContainText('확인이 필요한 파일 3개')
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
  await expect(page.locator('.repair-status')).toContainText('검사 대상 파일의 SHA-256이 모두 일치합니다.')
  await watcher.expectStable()
  await watcher.stop()
})

test('cancelling a pending worker never reports a partially scanned installation as normal', async ({ page }, testInfo) => {
  await setup(page)
  let releaseHash
  const gate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await gate; await route.continue().catch(() => {}) })
  await page.goto('/game-repair?mode=launch')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-results'])
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo))
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  await page.getByRole('button', { name: '검사 취소' }).click()
  await expect(page.locator('.repair-status')).toContainText('검사를 취소했습니다.')
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
  await watcher.expectStable()
  await watcher.stop()
  releaseHash()
})

test('Game.exe is hashed and not accepted merely because its size matches', async ({ page }, testInfo) => {
  await setup(page)
  const root = await fixture(testInfo)
  await writeFile(path.join(root, 'Game.exe'), 'evil')
  await page.goto('/game-repair?mode=launch')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'Game.exe' })).toContainText('불일치')
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'rnr_music' })).toHaveCount(0)
})

test('different or invalid INI values do not prevent hashing or downloads', async ({ page }, testInfo) => {
  await setup(page)
  const root = await fixture(testInfo, '10658')
  await writeFile(path.join(root, 'PatchInfo', 'Patch.ini'), 'unrelated invalid version information')
  await page.goto('/game-repair?mode=launch')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('확인이 필요한 파일 3개')
  expect(await page.evaluate(() => window.__readFiles)).toEqual([])
})

test('installations without Patch.ini can be inspected', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/game-repair?mode=launch')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo, '10659', false))
  await expect(page.locator('.repair-status')).toContainText('확인이 필요한 파일 3개')
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
  await expect(page.getByRole('link', { name: '게임 복구 파일 검사 시작' })).toBeVisible()
  await expect(page.getByRole('link', { name: '음악 아카이브 둘러보기' })).toHaveAttribute('href', 'https://music.r2archive.com')
  await page.getByRole('link', { name: '게임 복구 파일 검사 시작' }).click()
  await expect(page).toHaveURL('http://r2archive.com/game-repair')
  await expect(page.getByRole('heading', { name: '게임 설치 파일 검사 및 복구' })).toBeVisible()
})

test('single bulk link uses native ZIP download and includes only issues', async ({ page, baseURL }, testInfo) => {
  await setup(page)
  await page.addInitScript(() => { window.showSaveFilePicker = () => { throw new Error('Save picker must not be used') } })
  let names
  const server = createServer(async (request, response) => {
    if (request.url.startsWith('/api/game-repair/archive/')) {
      names = new URL(request.url, 'http://localhost').searchParams.getAll('name')
      response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="R2beat-repair.zip"' })
      response.end('ZIP test bytes')
      return
    }
    try {
      const upstream = await fetch(baseURL + request.url)
      const headers = Object.fromEntries([...upstream.headers].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)))
      response.writeHead(upstream.status, headers)
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch { response.writeHead(502); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  await page.route('**/api/game-repair/archive/**', route => route.continue())
  try {
  await page.goto(`http://127.0.0.1:${server.address().port}/game-repair?mode=launch`)
  const bulk = page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })
  await expect(bulk).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: '문제 파일만' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '문제 파일 일괄 받기 (ZIP)' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '다운로드 취소' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-download-toolbar', '.repair-results'])
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo))
  await expect(bulk).toBeEnabled()
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(3)
  const event = page.waitForEvent('download')
  await bulk.click()
  const download = await event
  expect(await download.failure()).toBeNull()
  expect(download.suggestedFilename()).toBe('R2beat-repair.zip')
  expect(names).toEqual(['hv.dll', 'steam_api.dll', 'rnr_boost_mode.pak'])
  await watcher.expectStable()
  await watcher.stop()
  } finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) }
})

test('repair entry offers both flows and resets results when changing type', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/game-repair')
  await expect(page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' })).toBeVisible()
  await expect(page.getByRole('link', { name: '특정 노래가 튕기시나요?' })).toBeVisible()
  await expect(page.locator('.repair-results')).toHaveCount(0)
  await page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' }).click()
  await expect(page).toHaveURL(/mode=launch/)
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  await page.getByLabel('게임 설치 폴더').setInputFiles(await fixture(testInfo))
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(3)
  await page.getByRole('link', { name: '문제 유형 선택' }).click()
  await page.getByRole('link', { name: '특정 노래가 튕기시나요?' }).click()
  await expect(page).toHaveURL(/mode=music/)
  await expect(page.locator('.repair-status')).toContainText('검사 대상 1개')
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeDisabled()
})

test('music mode hashes only music packs and keeps pending scan and download layout stable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: testInfo.project.name.endsWith('768') ? 390 : 1440, height: 900 })
  let releaseManifest
  await setup(page, new Promise(resolve => { releaseManifest = resolve }))
  const root = await fixture(testInfo)
  let releaseHash
  const hashGate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await hashGate; await route.continue().catch(() => {}) })
  await page.goto('/game-repair')
  await page.getByRole('link', { name: '특정 노래가 튕기시나요?' }).click()
  const scan = page.getByRole('button', { name: '설치 폴더 선택 · 검사' })
  await expect(scan).toBeDisabled()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-download-toolbar', '.repair-results'])
  releaseManifest()
  await expect(scan).toBeEnabled()
  await watcher.expectStable()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  await watcher.expectStable()
  releaseHash()
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(1)
  const row = page.locator('.repair-results tbody tr')
  await expect(row).toContainText('rnr_music1.pak')
  await expect(row).toContainText('불일치')
  await expect(row.getByRole('link', { name: '파일 받기' })).toHaveAttribute('href', '/api/game-repair/files/10659-test/rnr_music1.pak')
  const archive = page.getByRole('link', { name: '문제 파일 일괄 받기' })
  expect(new URL(await archive.getAttribute('href'), 'http://localhost').searchParams.getAll('name')).toEqual(['rnr_music1.pak'])
  await watcher.expectStable()
  await writeFile(path.join(root, 'rnr_music1.pak'), 'good')
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('검사 대상 파일의 SHA-256이 모두 일치합니다.')
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(0)
  await watcher.expectStable()
  await unlink(path.join(root, 'rnr_music1.pak'))
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-results tbody tr')).toHaveCount(1)
  await expect(page.locator('.repair-results tbody tr')).toContainText('누락')
  await watcher.expectStable()
  await watcher.stop()
})

for (const mode of ['launch', 'music']) {
  test(`${mode} shows completed issues during a later hash and gates downloads until full completion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: testInfo.project.name.endsWith('768') ? 390 : 1440, height: 1000 })
    const reference = { ...manifest, files: [...manifest.files, entry('rnr_music_missing.pak', 'good'), entry('rnr_music2.pak', 'good')] }
    await setup(page, Promise.resolve(), reference)
    const heldName = mode === 'launch' ? 'rnr_boost_mode.pak' : 'rnr_music2.pak'
    const expected = mode === 'launch' ? ['Game.exe', 'hv.dll', 'steam_api.dll'] : ['rnr_music1.pak', 'rnr_music_missing.pak']
    const root = await fixture(testInfo)
    await writeFile(path.join(root, 'Game.exe'), 'evil')
    await writeFile(path.join(root, 'rnr_music2.pak'), 'good')
    await page.addInitScript(({ heldName }) => {
      window.__holdHash = true
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        postMessage(message, ...args) {
          if (window.__holdHash && message.file?.name === heldName) {
            window.__releaseHash = () => { window.__holdHash = false; super.postMessage(message, ...args) }
          } else super.postMessage(message, ...args)
        }
      }
    }, { heldName })
    await page.goto(`/game-repair?mode=${mode}`)
    await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
    const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-download-toolbar', '.repair-results'])
    const assertPending = async () => {
      await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
      await expect(page.locator('.repair-results tbody tr td:first-child')).toHaveText(expected)
      await expect(page.locator('.repair-results tbody tr').first()).toContainText('불일치')
      await expect(page.locator('.repair-results tbody tr').nth(1)).toContainText('누락')
      await expect(page.locator('.repair-results')).toHaveAttribute('aria-busy', 'true')
      await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeDisabled()
      await expect(page.locator('.repair-download-toolbar a')).toHaveAttribute('aria-disabled', 'true')
      await expect(page.locator('.repair-download-toolbar a')).not.toHaveAttribute('href', /./)
      for (const link of await page.getByRole('link', { name: '파일 받기' }).all()) {
        await expect(link).toHaveAttribute('aria-disabled', 'true')
        await expect(link).not.toHaveAttribute('href', /./)
      }
      await watcher.expectStable()
    }
    await page.getByLabel('게임 설치 폴더').setInputFiles(root)
    await assertPending()
    await expect(page.getByLabel('예상 남은 시간')).toContainText(/약 .*남음/, { timeout: 7000 })
    await watcher.expectStable()
    await page.evaluate(() => window.__releaseHash())
    await expect(page.locator('.repair-status')).toContainText('검사 완료')
    await expect(page.getByLabel('예상 남은 시간')).toHaveText('예상 남은 시간: 0초')
    await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeEnabled()
    for (const link of await page.getByRole('link', { name: '파일 받기' }).all()) {
      await expect(link).toHaveAttribute('aria-disabled', 'false')
      await expect(link).toHaveAttribute('href', /\/api\/game-repair\/files\//)
    }
    await watcher.expectStable()
    await page.evaluate(() => { window.__holdHash = true })
    await page.getByLabel('게임 설치 폴더').setInputFiles(root)
    await assertPending()
    await page.getByRole('button', { name: '검사 취소' }).click()
    await expect(page.locator('.repair-status')).toContainText('검사를 취소했습니다.')
    await expect(page.getByLabel('예상 남은 시간')).toHaveText('예상 남은 시간: —')
    await expect(page.locator('.repair-results tbody tr td:first-child')).toHaveText(expected)
    await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeDisabled()
    for (const link of await page.getByRole('link', { name: '파일 받기' }).all()) await expect(link).not.toHaveAttribute('href', /./)
    await watcher.expectStable()
    await page.getByLabel('게임 설치 폴더').setInputFiles(root)
    await assertPending()
    await expect(page.getByLabel('예상 남은 시간')).toContainText('계산 중')
    await page.evaluate(() => window.__releaseHash())
    await expect(page.locator('.repair-status')).toContainText('검사 완료')
    await expect(page.getByLabel('예상 남은 시간')).toHaveText('예상 남은 시간: 0초')
    await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeEnabled()
    await watcher.expectStable()
    await watcher.stop()
  })
}

test('launch completion alerts for missing or different-size music only, after hashing finishes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: testInfo.project.name.endsWith('768') ? 390 : 1440, height: 1000 })
  await setup(page, Promise.resolve(), { ...manifest, files: [...manifest.files, entry('rnr_music.pak', 'good')] })
  const root = await fixture(testInfo)
  await writeFile(path.join(root, 'rnr_music1.pak'), 'bad')
  await page.addInitScript(() => {
    const slice = File.prototype.slice
    File.prototype.slice = function (...args) {
      if (/^rnr_music.*\.pak$/i.test(this.name)) throw new Error('launch music check must not read bytes')
      return slice.apply(this, args)
    }
  })
  const messages = []
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.accept() })
  let releaseHash
  const gate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await gate; await route.continue().catch(() => {}) })
  await page.goto('/game-repair')
  await page.getByRole('link', { name: '게임 실행이 안되거나 게임이 튕기시나요?' }).click()
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeEnabled()
  const watcher = await watchLayout(page, ['.repair-toolbar', '.repair-download-toolbar', '.repair-results'])
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  expect(messages).toEqual([])
  await page.getByRole('button', { name: '검사 취소' }).click()
  await expect(page.locator('.repair-status')).toContainText('검사를 취소했습니다.')
  expect(messages).toEqual([])
  await watcher.expectStable()
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  expect(messages).toEqual([])
  releaseHash()
  const warning = '음악 파일도 일부 문제가 발견되었습니다.\n복구 완료 후, 음악 파일 복구도 진행해주세요'
  await expect.poll(() => messages).toEqual([warning])
  await expect(page.locator('.repair-status')).toContainText('검사 완료')
  await expect(page.getByRole('link', { name: '문제 파일 일괄 받기', exact: true })).toBeEnabled()
  await expect(page.locator('.repair-results tbody tr').filter({ hasText: 'rnr_music' })).toHaveCount(0)
  expect(new URL(await page.locator('.repair-download-toolbar a').getAttribute('href'), 'http://localhost').searchParams.getAll('name')).toEqual(['hv.dll', 'steam_api.dll', 'rnr_boost_mode.pak'])
  await watcher.expectStable()
  await writeFile(path.join(root, 'rnr_music.pak'), 'good')
  await writeFile(path.join(root, 'rnr_music1.pak'), 'evil')
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect(page.locator('.repair-status')).toContainText('검사 완료')
  await watcher.expectStable()
  expect(messages).toEqual([warning])
  await unlink(path.join(root, 'rnr_music1.pak'))
  await page.getByLabel('게임 설치 폴더').setInputFiles(root)
  await expect.poll(() => messages).toEqual([warning, warning])
  await expect(page.locator('.repair-status')).toContainText('검사 완료')
  await watcher.expectStable()
  await watcher.stop()
})
