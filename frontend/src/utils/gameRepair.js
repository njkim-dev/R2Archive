export function parsePatchVersion(text) {
  return text.replace(/^\uFEFF/, '').match(/^\s*version\s*=\s*(\d+)\s*(?:[;#].*)?$/im)?.[1] ?? null
}

export async function inspectInstallation(selectedFiles, manifest, onProgress = () => {}) {
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
  if (!version) throw new Error('PatchInfo/Patch.ini에서 버전을 읽을 수 없습니다.')
  if (version !== manifest.version) return { folder, version, rows: [], mismatch: true }
  if (!entries.has('game.exe') && !entries.has('rnr_script.pak')) {
    throw new Error('게임 설치 폴더를 선택해주세요. Game.exe 또는 rnr_script.pak가 있어야 합니다.')
  }
  const rows = []
  for (const expected of manifest.files) {
    const file = entries.get(expected.name.toLowerCase())
    const size = file?.size ?? null
    const status = !file ? 'missing' : size === expected.size ? 'ok' : 'size'
    rows.push({ ...expected, status, sizeOnDisk: size })
    onProgress(rows.length, manifest.files.length)
  }
  return { folder, version, rows, mismatch: false }
}

export function repairFileUrl(manifest, file) {
  return `/api/game-repair/files/${encodeURIComponent(manifest.snapshot)}/${encodeURIComponent(file.name)}`
}
