import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectInstallation, parsePatchVersion, restoreFile } from '../src/utils/gameRepair.js'

function directory(version, entries = []) {
  return {
    async getDirectoryHandle(name) {
      assert.equal(name, 'PatchInfo')
      return { async getFileHandle() { return { async getFile() { return new File([`[patch]\r\nversion=${version}\r\n`], 'Patch.ini') } } } }
    },
    async *entries() { yield* entries },
  }
}
const manifest = { version: '10659', files: [{ name: 'hv.dll', size: 10 }, { name: 'steam_api.dll', size: 20 }, { name: 'Game.exe', size: 30 }] }
test('INI version handles CRLF, BOM, whitespace and comments', () => {
  assert.equal(parsePatchVersion('\uFEFF[patch]\r\n Version = 10659 ; patch\r\n'), '10659')
  assert.equal(parsePatchVersion('otherversion=10659'), null)
})
test('wrong version blocks file enumeration and repair', async () => {
  const root = directory('10658')
  root.entries = () => { throw new Error('must not enumerate') }
  assert.equal((await inspectInstallation(root, manifest)).mismatch, true)
  await assert.rejects(restoreFile(root, manifest, manifest.files[0]), /버전이 변경/)
})
test('only root metadata is inspected and missing, size and unreadable stay distinct', async () => {
  const file = size => ({ kind: 'file', async getFile() { return { size } } })
  const root = directory('10659', [['HV.DLL', file(10)], ['Game.exe', file(29)], ['subfolder', { kind: 'directory' }]])
  const result = await inspectInstallation(root, manifest)
  assert.deepEqual(result.rows.map(row => row.status), ['ok', 'missing', 'size'])
  root.entries = async function* () { yield ['Game.exe', file(30)]; yield ['hv.dll', { kind: 'file', async getFile() { throw new Error('locked') } }] }
  assert.equal((await inspectInstallation(root, manifest)).rows[0].status, 'unreadable')
})
test('truncated download aborts the write instead of committing it', async () => {
  const originalFetch = globalThis.fetch
  let closed = false
  let aborted = false
  const root = directory('10659')
  root.getFileHandle = async () => ({ async getFile() { return new File([], 'hv.dll') }, async createWritable() {
    return { async write() {}, async close() { closed = true }, async abort() { aborted = true } }
  } })
  let lookup = 0
  const target = root.getFileHandle
  root.getFileHandle = async () => { if (!lookup++) throw Object.assign(new Error(), { name: 'NotFoundError' }); return target() }
  globalThis.fetch = async () => new Response('short')
  try { await assert.rejects(restoreFile(root, manifest, manifest.files[0]), /완전하지/); assert.equal(aborted, true); assert.equal(closed, false) }
  finally { globalThis.fetch = originalFetch }
})
