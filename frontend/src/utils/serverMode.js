const MODE_OVERRIDE = import.meta.env?.VITE_R2_SERVER_MODE
const host = globalThis.window?.location?.hostname?.toLowerCase()||''
export const ARCHIVE_BASE=/^\/(music|xyx)(?:\/|$)/.exec(globalThis.window?.location?.pathname||'/')?.[0].replace(/\/$/,'')||''
export const archivePath=path=>ARCHIVE_BASE&&!(path===ARCHIVE_BASE||path.startsWith(ARCHIVE_BASE+'/'))?ARCHIVE_BASE+(path.startsWith('/')?path:'/'+path):path

export const SERVER_MODE =
  MODE_OVERRIDE === 'xyx' || ARCHIVE_BASE==='/xyx' || host === 'xyx.r2archive.com' || host.startsWith('xyx.')
    ? 'xyx'
    : 'kr'

export const isXyxMode = () => SERVER_MODE === 'xyx'
export const isKrMode = () => SERVER_MODE === 'kr'

export const SERVER_LINKS = {
  kr: 'https://r2archive.com/music/',
  xyx: 'https://r2archive.com/xyx/',
}

export function apiPath(krPath, xyxPath) {
  return isXyxMode() ? xyxPath : krPath
}
