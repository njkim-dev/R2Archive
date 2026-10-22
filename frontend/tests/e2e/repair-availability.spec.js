import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { watchLayout } from './layout.js'

const manifest = { snapshot: 'test', version: '1', files: ['Game.exe', 'hv.dll'].map(name => ({ name, size: 4, sha256: createHash('sha256').update('good').digest('hex') })) }
const closedMessage = '게임 점검 중입니다. 기준 파일을 확인한 후 다시 열겠습니다.'
async function mock(page, state, admin = false, hold = null) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (hold && await hold(route, url)) return
    let json = []
    if (url.pathname === '/api/game-repair/status') json = { ...state, message: state.enabled ? '' : closedMessage }
    else if (url.pathname === '/api/game-repair/manifest') json = manifest
    else if (url.pathname === '/api/auth/me') json = { user: admin ? { id: 1, nickname: 'Admin', onboarded: true } : null }
    else if (url.pathname.endsWith('/admin-status')) json = { is_admin: admin }
    else if (url.pathname.endsWith('/meta')) json = { total_count: 0, level_min: .5, level_max: 12, bpm_min: 60, bpm_max: 400, top_artists: [] }
    else if (url.pathname.includes('flags')) json = { favorites: [], played: [], played_all: [] }
    else if (url.pathname.includes('/analytics/')) json = { ok: true }
    await route.fulfill({ json })
  })
}

test('administrator can close and reopen with stable loading, saving and error states', async ({ page }, info) => {
  if (info.project.name.endsWith('768')) await page.setViewportSize({ width: 390, height: 900 })
  const state = { enabled: true, revision: 'a' }
  let loading = true
  const reads = [], writes = []
  await mock(page, state, true, async (route, url) => {
    if (url.pathname === '/api/game-repair/status' && loading) { reads.push(route); return true }
    if (url.pathname === '/api/game-repair/admin/status') { writes.push(route); return true }
    return false
  })
  await page.goto('/game-repair/admin')
  await expect(page.getByRole('button', { name: '복구 기능 닫기', exact: true })).toBeDisabled()
  const watcher = await watchLayout(page, ['.repair-heading', '.repair-guide', '.repair-admin-status', '.repair-toolbar', '.repair-admin-message'])
  loading = false
  await Promise.all(reads.splice(0).map(route => route.fulfill({ json: state })))
  const close = page.getByRole('button', { name: '복구 기능 닫기', exact: true })
  const open = page.getByRole('button', { name: '복구 기능 열기', exact: true })
  await expect(close).toBeEnabled()
  await watcher.expectStable()
  await close.click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].request().postDataJSON()).toEqual({ enabled: false })
  await expect(open).toBeDisabled()
  await expect(close).toBeDisabled()
  await watcher.expectStable()
  Object.assign(state, { enabled: false, revision: 'b' })
  await writes.shift().fulfill({ json: state })
  await expect(page.locator('.repair-admin-status')).toHaveText('현재 상태: 닫힘')
  await expect(open).toBeEnabled()
  await watcher.expectStable()
  await open.click()
  await expect.poll(() => writes.length).toBe(1)
  await writes.shift().fulfill({ status: 503, json: { detail: '저장 실패' } })
  await expect(page.locator('.repair-admin-message')).toHaveText('저장 실패')
  await expect(page.locator('.repair-admin-status')).toHaveText('현재 상태: 닫힘')
  await watcher.expectStable()
  await open.click()
  await expect.poll(() => writes.length).toBe(1)
  Object.assign(state, { enabled: true, revision: 'c' })
  await writes.shift().fulfill({ json: state })
  await expect(page.locator('.repair-admin-status')).toHaveText('현재 상태: 열림')
  await watcher.expectStable()
  await watcher.stop()
})

test('closed or unavailable status blocks both repair flows and non-admin management', async ({ page }) => {
  let manifests = 0
  const state = { enabled: false, revision: 'closed' }
  await mock(page, state, false, async (route, url) => {
    if (url.pathname === '/api/game-repair/manifest') manifests++
    return false
  })
  await page.goto('/game-repair')
  await expect(page.locator('.repair-availability')).toContainText(closedMessage)
  await expect(page.locator('.repair-choices a')).toHaveCount(2)
  for (const link of await page.locator('.repair-choices a').all()) await expect(link).toHaveAttribute('aria-disabled', 'true')
  for (const mode of ['launch', 'music']) {
    await page.goto('/game-repair?mode=' + mode)
    await expect(page.locator('.repair-availability')).toContainText(closedMessage)
    await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeDisabled()
    await expect(page.getByRole('link', { name: '문제 파일 일괄 받기' })).toHaveAttribute('aria-disabled', 'true')
  }
  expect(manifests).toBe(0)
  await page.route('**/api/game-repair/status', route => route.fulfill({ status: 503, json: {} }))
  await page.goto('/game-repair?mode=launch')
  await expect(page.locator('.repair-availability')).toContainText('운영 상태를 확인하지 못했습니다')
  await expect(page.getByRole('button', { name: '설치 폴더 선택 · 검사' })).toBeDisabled()
  await page.goto('/game-repair/admin')
  await expect(page.getByRole('heading', { name: '관리자만 이용할 수 있습니다.' })).toBeVisible()
  await expect(page.getByRole('button', { name: '복구 기능 열기' })).toHaveCount(0)
})

test('polling closes an active hash scan and reopening requires a new complete scan', async ({ page }, info) => {
  if (info.project.name.endsWith('768')) await page.setViewportSize({ width: 390, height: 900 })
  const state = { enabled: true, revision: 'a' }
  await mock(page, state)
  let releaseHash
  const gate = new Promise(resolve => { releaseHash = resolve })
  await page.route('**/fileHash.worker.js*', async route => { await gate; await route.continue().catch(() => {}) })
  const folder = info.outputPath('R2beat')
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, 'Game.exe'), 'good')
  await writeFile(path.join(folder, 'hv.dll'), 'evil')
  await page.goto('/game-repair?mode=launch')
  const scan = page.getByRole('button', { name: '설치 폴더 선택 · 검사' })
  await expect(scan).toBeEnabled()
  const watcher = await watchLayout(page, ['.repair-availability', '.repair-toolbar', '.repair-status', '.repair-results'])
  await page.getByLabel('게임 설치 폴더').setInputFiles(folder)
  await expect(page.locator('.repair-status')).toContainText('SHA-256 검사 중')
  Object.assign(state, { enabled: false, revision: 'b' })
  await expect(page.locator('.repair-availability')).toContainText(closedMessage, { timeout: 15000 })
  await expect(scan).toBeDisabled()
  await expect(page.getByRole('link', { name: '문제 파일 일괄 받기' })).toHaveAttribute('aria-disabled', 'true')
  releaseHash()
  await watcher.expectStable()
  Object.assign(state, { enabled: true, revision: 'c' })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(scan).toBeEnabled()
  await expect(page.getByRole('link', { name: '문제 파일 일괄 받기' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByLabel('게임 설치 폴더').setInputFiles(folder)
  await expect(page.locator('.repair-status')).toContainText('검사 완료')
  await expect(page.getByRole('link', { name: '문제 파일 일괄 받기' })).toHaveAttribute('aria-disabled', 'false')
  await watcher.expectStable()
  await watcher.stop()
})
