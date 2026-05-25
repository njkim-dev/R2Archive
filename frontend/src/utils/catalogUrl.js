export const songCatalogHash = (songId) => `#song=${songId}`
export const pmangSongCatalogHash = (songId) => `#pmang-song=${songId}`
export const songCatalogUrl = (songId, origin = window.location.origin) => `${origin}/${songCatalogHash(songId)}`

export function replaceCatalogHash(hash, pathname = window.location.pathname, search = window.location.search) {
  const next = `${pathname}${search}${hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current !== next) {
    window.history.replaceState(window.history.state, '', next)
  }
}

export function clearCatalogHash(pattern) {
  if (!pattern.test(window.location.hash)) return
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
}
