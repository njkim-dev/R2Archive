import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectInstallation, parsePatchVersion, repairFileUrl } from '../src/utils/gameRepair.js'

function file(path, content) {
  const selected = new File([content], path.split('/').at(-1))
  Object.defineProperty(selected, 'webkitRelativePath', { value: `R2beat/${path}` })
  return selected
}
function installation(version = '10659') {
  return [file('PatchInfo/Patch.ini', `[patch]\r\nversion=${version}\r\n`), file('Game.exe', 'game')]
}
const manifest = { version: '10659', snapshot: 'reference', files: [{ name: 'hv.dll', size: 10 }, { name: 'steam_api.dll', size: 20 }, { name: 'Game.exe', size: 4 }] }

test('INI version handles CRLF, BOM, whitespace and comments', () => {
  assert.equal(parsePatchVersion('\uFEFF[patch]\r\n Version = 10659 ; patch\r\n'), '10659')
  assert.equal(parsePatchVersion('otherversion=10659'), null)
})
test('wrong version returns no repair candidates', async () => {
  const result = await inspectInstallation(installation('10658'), manifest)
  assert.equal(result.mismatch, true)
  assert.deepEqual(result.rows, [])
})
test('explicitly selected files support INI and DLL without native filesystem handles', async () => {
  const files = [...installation(), file('HV.DLL', '1234567890'), file('steam_api.dll', 'short')]
  for (const item of files.slice(1)) item.text = () => { throw new Error('game file contents must not be read') }
  const result = await inspectInstallation(files, manifest)
  assert.equal(result.folder, 'R2beat')
  assert.deepEqual(result.rows.map(row => row.status), ['ok', 'size', 'ok'])
})
test('nested files cannot mask missing root files and unrelated contents are never read', async () => {
  const nested = file('nested/hv.dll', '1234567890')
  nested.text = () => { throw new Error('must not read nested files') }
  const result = await inspectInstallation([...installation(), nested], manifest)
  assert.equal(result.rows[0].status, 'missing')
  assert.equal(result.rows[1].status, 'missing')
})
test('missing, oversized and invalid patch information fail closed', async () => {
  await assert.rejects(inspectInstallation([file('Game.exe', 'game')], manifest), /PatchInfo/)
  await assert.rejects(inspectInstallation([file('PatchInfo/Patch.ini', 'x'.repeat(65537))], manifest), /올바르지/)
  await assert.rejects(inspectInstallation([file('PatchInfo/Patch.ini', 'invalid')], manifest), /버전을 읽을/)
  await assert.rejects(inspectInstallation([], manifest), /폴더를 선택/)
})
test('manual recovery links retain the versioned snapshot and filename', () => {
  assert.equal(repairFileUrl(manifest, manifest.files[0]), '/api/game-repair/files/reference/hv.dll')
})
