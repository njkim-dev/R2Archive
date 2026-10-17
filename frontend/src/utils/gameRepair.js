export function parsePatchVersion(text) {
  return text.replace(/^\uFEFF/, '').match(/^\s*version\s*=\s*(\d+)\s*(?:[;#].*)?$/im)?.[1] ?? null
}

export async function readPatchVersion(directory) {
  const patch = await directory.getDirectoryHandle('PatchInfo')
  const handle = await patch.getFileHandle('Patch.ini')
  const file = await handle.getFile()
  if (file.size > 65536) throw new Error('버전 정보 파일이 올바르지 않습니다.')
  return parsePatchVersion(await file.text())
}

export async function inspectInstallation(directory, manifest, onProgress = () => {}) {
  const version = await readPatchVersion(directory)
  if (!version) throw new Error('PatchInfo/Patch.ini에서 버전을 읽을 수 없습니다.')
  if (version !== manifest.version) return { version, rows: [], mismatch: true }
  const entries = new Map()
  for await (const [name, handle] of directory.entries()) entries.set(name.toLowerCase(), handle)
  if (!entries.has('game.exe') && !entries.has('rnr_script.pak')) {
    throw new Error('게임 설치 폴더를 선택해주세요. Game.exe 또는 rnr_script.pak가 있어야 합니다.')
  }
  const rows = []
  for (const expected of manifest.files) {
    const handle = entries.get(expected.name.toLowerCase())
    let status = 'missing'
    let size = null
    try {
      if (handle?.kind === 'file') {
        size = (await handle.getFile()).size
        status = size === expected.size ? 'ok' : 'size'
      } else if (handle) status = 'unreadable'
    } catch { status = 'unreadable' }
    rows.push({ ...expected, status, sizeOnDisk: size })
    onProgress(rows.length, manifest.files.length)
  }
  return { version, rows, mismatch: false }
}

export function repairFileUrl(manifest, file) {
  return `/api/game-repair/files/${encodeURIComponent(manifest.snapshot)}/${encodeURIComponent(file.name)}`
}

export async function restoreFile(directory, manifest, file, onProgress = () => {}) {
  if (await readPatchVersion(directory) !== manifest.version) throw new Error('게임 버전이 변경되었습니다. 다시 검사해주세요.')
  const response = await fetch(repairFileUrl(manifest, file), { cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`${file.name}: 복구 파일을 다운로드하지 못했습니다.`)
  let existing
  try { existing = await directory.getFileHandle(file.name) } catch (error) {
    if (error.name !== 'NotFoundError') throw error
  }
  if (existing) {
    const original = await existing.getFile()
    const backups = await directory.getDirectoryHandle('R2Archive-backup', { create: true })
    const backup = await backups.getFileHandle(`${Date.now()}-${file.name}`, { create: true })
    await original.stream().pipeTo(await backup.createWritable())
  }
  const handle = existing || await directory.getFileHandle(file.name, { create: true })
  const writable = await handle.createWritable()
  let received = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > file.size) throw new Error('복구 파일 크기가 일치하지 않습니다.')
      await writable.write(value)
      onProgress(received, file.size)
    }
    if (received !== file.size) throw new Error('다운로드가 완전하지 않습니다. 다시 시도해주세요.')
    await writable.close()
  } catch (error) {
    await reader.cancel().catch(() => {})
    await writable.abort().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  if ((await handle.getFile()).size !== file.size) throw new Error('복구 후 파일 크기가 일치하지 않습니다.')
}
