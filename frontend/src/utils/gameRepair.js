import { createFileHasher } from './fileHashWorker.js'

export async function inspectInstallation(selectedFiles, manifest, onProgress = () => {}, { signal, createHasher = createFileHasher, mode = 'launch', onRow = () => {}, now = () => performance.now() } = {}) {
  signal?.throwIfAborted()
  const files = Array.from(selectedFiles)
  const folder = files[0]?.webkitRelativePath.split('/')[0]
  if (!folder) throw new Error('R2beat 설치 폴더를 선택해주세요.')
  const entries = new Map()
  for (const file of files) {
    const parts = file.webkitRelativePath.split('/')
    if (parts.shift() !== folder) throw new Error('게임 설치 폴더 하나만 선택해주세요.')
    const path = parts.join('/').toLowerCase()
    if (!path.includes('/')) entries.set(path, file)
  }
  const targets = repairTargets(manifest, mode)
  if (!targets.length || targets.some(file => !/^[a-f0-9]{64}$/i.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0)) {
    throw new Error('정상 SHA-256 기준 정보가 올바르지 않습니다. 페이지를 새로고침해주세요.')
  }
  if (![...repairTargets(manifest), ...repairTargets(manifest, 'music')].some(file => entries.has(file.name.toLowerCase()))) {
    throw new Error('검사 대상 파일이 없습니다. R2beat 설치 폴더를 선택해주세요.')
  }
  const totalHashBytes = targets.reduce((total, expected) => total + (entries.get(expected.name.toLowerCase())?.size === expected.size ? expected.size : 0), 0)
  let readBytes = 0
  let handledBytes = 0
  let startedAt = null
  const timing = (currentBytes = 0) => ({ bytesRead: readBytes + currentBytes, remainingBytes: Math.max(0, totalHashBytes - handledBytes - currentBytes), elapsedMs: startedAt === null ? 0 : now() - startedAt })
  const rows = []
  let hasher
  try {
    for (const expected of targets) {
      signal?.throwIfAborted()
      const file = entries.get(expected.name.toLowerCase())
      const size = file?.size ?? null
      let status = !file ? 'missing' : 'size'
      let actualSha256 = null
      let currentBytes = 0
      const needsHash = file && size === expected.size
      if (needsHash) startedAt ??= now()
      const progress = bytes => {
        currentBytes = Math.max(currentBytes, Math.min(bytes, expected.size))
        onProgress({ completed: rows.length, total: targets.length, file: expected.name, bytes: currentBytes, size: expected.size, ...timing(currentBytes) })
      }
      progress(0)
      if (needsHash) {
        try {
          hasher ||= createHasher()
          actualSha256 = await hasher.hash(file, progress, signal)
          currentBytes = expected.size
          status = actualSha256 === expected.sha256.toLowerCase() ? 'ok' : 'hash'
        } catch (error) {
          if (signal?.aborted || error.name === 'AbortError' || error.name === 'WorkerError') throw error
          status = 'unreadable'
        }
      }
      readBytes += currentBytes
      if (needsHash) handledBytes += expected.size
      const row = { ...expected, status, sizeOnDisk: size, actualSha256 }
      rows.push(row)
      onRow(row)
      onProgress({ completed: rows.length, total: targets.length, file: expected.name, bytes: 0, size: 0, ...timing() })
    }
  } finally { hasher?.close() }
  signal?.throwIfAborted()
  const musicIssues = mode === 'launch' ? repairTargets(manifest, 'music').filter(expected => entries.get(expected.name.toLowerCase())?.size !== expected.size).map(file => file.name) : []
  return { folder, rows, musicIssues }
}

export function repairFileUrl(manifest, file) {
  return `/api/game-repair/files/${encodeURIComponent(manifest.snapshot)}/${encodeURIComponent(file.name)}`
}
export function repairTargets(manifest, mode = 'launch') {
  return manifest.files.filter(file => {
    const name = file.name.toLowerCase()
    if (mode === 'music') return !/[\\/]/.test(name) && name.startsWith('rnr_music') && name.endsWith('.pak')
    return !/[\\/]/.test(name) && ((name.endsWith('.pak') && !name.startsWith('rnr_music')) || ['game.exe', 'hv.dll', 'steam_api.dll'].includes(name))
  })
}
