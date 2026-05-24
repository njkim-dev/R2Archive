const MODE_OVERRIDE = import.meta.env.VITE_R2_SERVER_MODE
const host = window.location.hostname.toLowerCase()

export const SERVER_MODE =
  MODE_OVERRIDE === 'xyx' || host === 'xyx.r2archive.com' || host.startsWith('xyx.')
    ? 'xyx'
    : 'kr'

export const isXyxMode = () => SERVER_MODE === 'xyx'
export const isKrMode = () => SERVER_MODE === 'kr'

export const SERVER_LINKS = {
  kr: 'https://music.r2archive.com',
  xyx: 'https://xyx.r2archive.com',
}

export function apiPath(krPath, xyxPath) {
  return isXyxMode() ? xyxPath : krPath
}
