import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { inspectInstallation, repairFileUrl, repairTargets } from '../src/utils/gameRepair.js'
import { hashFileChunks, HASH_CHUNK_BYTES } from '../src/utils/fileSha256.js'

const digest = content => createHash('sha256').update(content).digest('hex')
const entry = (name, content) => ({ name, size: Buffer.byteLength(content), sha256: digest(content) })
const manifest = { version: '10659', snapshot: 'reference', files: [entry('hv.dll', 'good'), entry('steam_api.dll', 'good'), entry('Game.exe', 'game'), entry('rnr_boost_mode.pak', 'good'), entry('rnr_music1.pak', 'music'), entry('other.dll', 'other')] }
const options = { createHasher: () => ({ hash: hashFileChunks, close() {} }) }
function file(path, content) {
  const selected = new File([content], path.split('/').at(-1))
  Object.defineProperty(selected, 'webkitRelativePath', { value: `R2beat/${path}` })
  return selected
}
function installation(version = '10659') {
  return [file('PatchInfo/Patch.ini', `[patch]\r\nversion=${version}\r\n`), file('Game.exe', 'game')]
}
const inspect = (files, m = manifest, callback) => inspectInstallation(files, m, callback, options)

test('target selection includes Game.exe, two DLLs and non-music packs only', () => {
  const names = ['Game.exe', 'hv.dll', 'STEAM_API.DLL', 'rnr_boost_mode.pak', 'another.PAK', 'rnr_music.pak', 'rnr_musicMod2.pak', 'RNR_MUSIC99.PAK', 'other.dll', 'config.ini', 'sub/nested.pak']
  assert.deepEqual(repairTargets({ files: names.map(name => ({ name })) }).map(f => f.name), names.slice(0, 5))
})
test('INI files are not read or required regardless of version or contents', async () => {
  for (const content of ['version=1', 'invalid', 'x'.repeat(65537)]) {
    const ignored = file('PatchInfo/Patch.ini', content)
    ignored.text = ignored.arrayBuffer = ignored.slice = () => { throw new Error('must not read INI') }
    const result = await inspect([ignored, file('Game.exe', 'game')])
    assert.equal(result.rows.find(row => row.name === 'Game.exe').status, 'ok')
  }
  assert.equal((await inspect([file('Game.exe', 'game')])).rows.find(row => row.name === 'Game.exe').status, 'ok')
})

test('same-size corruption is detected, excluded files are never read, and only root files count', async () => {
  const ignored = [file('rnr_music1.pak', 'wrong'), file('other.dll', 'wrong'), file('nested/hv.dll', 'good')]
  for (const selected of ignored) selected.slice = () => { throw new Error('excluded file must not be hashed') }
  const result = await inspect([...installation(), file('steam_api.dll', 'bad'), file('rnr_boost_mode.pak', 'evil'), ...ignored])
  assert.deepEqual(result.rows.map(row => row.status), ['missing', 'size', 'ok', 'hash'])
  assert.equal(result.rows[3].actualSha256, digest('evil'))
})
test('Game.exe content is checked even when its size matches', async () => {
  const result = await inspect([file('PatchInfo/Patch.ini', 'version=10659'), file('Game.exe', 'evil')])
  assert.equal(result.rows.find(row => row.name === 'Game.exe').status, 'hash')
})
test('missing Game.exe is reported rather than preventing inspection', async () => {
  const result = await inspect([file('hv.dll', 'good')])
  assert.equal(result.rows.find(row => row.name === 'Game.exe').status, 'missing')
})
test('invalid or missing target hashes cannot produce a normal result', async () => {
  await assert.rejects(inspect(installation(), { ...manifest, files: [{ name: 'hv.dll', size: 4 }] }), /SHA-256 기준/)
  await assert.rejects(inspect(installation(), { ...manifest, files: [] }), /SHA-256 기준/)
})
test('read failures stay distinct from content differences and the hasher is closed', async () => {
  let closed = false
  const result = await inspectInstallation(installation(), manifest, undefined, { createHasher: () => ({ async hash() { throw new Error('file changed') }, close() { closed = true } }) })
  assert.equal(result.rows.find(row => row.name === 'Game.exe').status, 'unreadable')
  assert.equal(closed, true)
})
test('cancellation rejects partial results and closes the worker', async () => {
  const controller = new AbortController()
  let closed = false
  const hashing = inspectInstallation(installation(), manifest, undefined, { signal: controller.signal, createHasher: () => ({ async hash(file, progress, signal) { controller.abort(); signal.throwIfAborted() }, close() { closed = true } }) })
  await assert.rejects(hashing, error => error.name === 'AbortError')
  assert.equal(closed, true)
})
test('incremental SHA-256 matches Node crypto across chunk boundaries and bounds reads', async () => {
  for (const length of [0, 3, HASH_CHUNK_BYTES + 137]) {
    const content = Buffer.alloc(length, 0x61)
    const blob = new Blob([content])
    const reads = []
    const bounded = { size: blob.size, slice(start, end) { reads.push(end - start); return blob.slice(start, end) }, arrayBuffer() { throw new Error('whole-file read forbidden') } }
    assert.equal(await hashFileChunks(bounded), digest(content))
    assert.ok(reads.every(size => size <= HASH_CHUNK_BYTES))
  }
})
test('empty selections and folders without target files are rejected', async () => {
  await assert.rejects(inspect([]), /폴더를 선택/)
  await assert.rejects(inspect([file('PatchInfo/Patch.ini', 'version=10659')]), /검사 대상 파일이 없습니다/)
})

test('manual recovery links retain the versioned snapshot and filename', () => {
  assert.equal(repairFileUrl(manifest, manifest.files[0]), '/api/game-repair/files/reference/hv.dll')
})
