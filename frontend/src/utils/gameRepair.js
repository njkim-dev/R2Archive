import { createFileHasher } from './fileHashWorker.js'

export function parsePatchVersion(text) {
  return text.replace(/^\uFEFF/, '').match(/^\s*version\s*=\s*(\d+)\s*(?:[;#].*)?$/im)?.[1] ?? null
}

export async function inspectInstallation(selectedFiles, manifest, onProgress = () => {}, { signal, createHasher = createFileHasher } = {}) {
  signal?.throwIfAborted()
  const files = Array.from(selectedFiles)
  const folder = files[0]?.webkitRelativePath.split('/')[0]
  if (!folder) throw new Error('R2beat 설치 폴더를 선택해주세요.')
  const entries = new Map()
  for (const file of files) {
    const parts = file.webkitRelativePath.split('/')
    if (parts.shift() !== folder) throw new Error('게임 설치 폴더 하나만 선택해주세요.')
    const path = parts.join('/').toLowerCase()
    if (!path.includes('/') || path === 'patchinfo/patch.ini') entries.set(path, file)
  }
  const patch = entries.get('patchinfo/patch.ini')
  if (!patch) throw new Error('PatchInfo/Patch.ini가 없습니다. R2beat 설치 폴더를 선택해주세요.')
  if (patch.size > 65536) throw new Error('버전 정보 파일이 올바르지 않습니다.')
  const version = parsePatchVersion(await patch.text())
  signal?.throwIfAborted()
  if (!version) throw new Error('PatchInfo/Patch.ini에서 버전을 읽을 수 없습니다.')
  if (version !== manifest.version) return { folder, version, rows: [], mismatch: true }
  const targets = repairTargets(manifest)
  if (!targets.length || targets.some(file => !/^[a-f0-9]{64}$/i.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0)) {
    throw new Error('정상 SHA-256 기준 정보가 올바르지 않습니다. 페이지를 새로고침해주세요.')
  }
  const rows = []
  let hasher
  try {
    for (const expected of targets) {
      signal?.throwIfAborted()
      const file = entries.get(expected.name.toLowerCase())
      const size = file?.size ?? null
      let status = !file ? 'missing' : 'size'
      let actualSha256 = null
      const progress = bytes => onProgress({ completed: rows.length, total: targets.length, file: expected.name, bytes, size: expected.size })
      progress(0)
      if (file && size === expected.size) {
        try {
          hasher ||= createHasher()
          actualSha256 = await hasher.hash(file, progress, signal)
          status = actualSha256 === expected.sha256.toLowerCase() ? 'ok' : 'hash'
        } catch (error) {
          if (signal?.aborted || error.name === 'AbortError' || error.name === 'WorkerError') throw error
          status = 'unreadable'
        }
      }
      rows.push({ ...expected, status, sizeOnDisk: size, actualSha256 })
      onProgress({ completed: rows.length, total: targets.length, file: expected.name, bytes: 0, size: 0 })
    }
  } finally { hasher?.close() }
  return { folder, version, rows, mismatch: false }
}

export function repairFileUrl(manifest, file) {
  return `/api/game-repair/files/${encodeURIComponent(manifest.snapshot)}/${encodeURIComponent(file.name)}`
}
export function repairTargets(manifest) {
  return manifest.files.filter(file => {
    const name = file.name.toLowerCase()
    return !/[\\/]/.test(name) && ((name.endsWith('.pak') && !name.startsWith('rnr_music')) || ['game.exe', 'hv.dll', 'steam_api.dll'].includes(name))
  })
}
