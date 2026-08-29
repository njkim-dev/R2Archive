import { SERVER_MODE } from './serverMode'

const STORAGE_PREFIX = 'r2b:list-state:v1'
export const RESTORE_LIST_PARAM = 'restoreList'
const RESTORE_LIST_HASH = '#restoreList'
const RESTORE_LIST_HASH_PREFIX = `${RESTORE_LIST_HASH}:`

let currentListScrollOffset = 0

function normalizeListPath(pathname = window.location.pathname) {
  return pathname === '/removed-songs' ? '/removed-songs' : '/'
}

function storageKey(pathname = window.location.pathname) {
  return `${STORAGE_PREFIX}:${SERVER_MODE}:${normalizeListPath(pathname)}`
}

function isRestoreListHash(hash = window.location.hash) {
  return hash === RESTORE_LIST_HASH || hash.startsWith(RESTORE_LIST_HASH_PREFIX)
}

function encodeRestoreState(state) {
  try {
    return encodeURIComponent(JSON.stringify(state))
  } catch {
    return ''
  }
}

function decodeRestoreState(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function setCurrentListScrollOffset(offset) {
  currentListScrollOffset = Math.max(0, Number(offset) || 0)
}

export function shouldRestoreListState() {
  try {
    return isRestoreListHash() ||
      new URLSearchParams(window.location.search).get(RESTORE_LIST_PARAM) === '1'
  } catch {
    return false
  }
}

export function clearRestoreListParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    const hasRestoreParam = params.has(RESTORE_LIST_PARAM)
    const hasRestoreHash = isRestoreListHash()
    if (!hasRestoreParam && !hasRestoreHash) return
    params.delete(RESTORE_LIST_PARAM)
    const search = params.toString()
    const hash = hasRestoreHash ? '' : window.location.hash
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${hash}`,
    )
  } catch {}
}

export function withRestoreListParam(url, restoreState = null) {
  try {
    const next = new URL(url, window.location.href)
    next.searchParams.delete(RESTORE_LIST_PARAM)
    const encoded = restoreState ? encodeRestoreState(restoreState) : ''
    next.hash = encoded ? `${RESTORE_LIST_HASH_PREFIX}${encoded}` : RESTORE_LIST_HASH
    return next.toString()
  } catch {
    return url
  }
}

export function makeSearchRestoreState(state) {
  if (!state) return null
  const search = typeof state.search === 'string' ? state.search : ''
  const searchMode = ['both', 'name', 'artist'].includes(state.searchMode) ? state.searchMode : 'both'
  const category = ['star', 'moon', 'sun'].includes(state.category) ? state.category : null
  return {
    search,
    searchMode,
    excludeSearch: !!state.excludeSearch && !!search.trim(),
    levelMin: state.levelMin,
    levelMax: state.levelMax,
    category,
    scrollOffset: 0,
    savedAt: Date.now(),
  }
}

export function readRestoreListHashState() {
  const hash = window.location.hash
  if (!hash.startsWith(RESTORE_LIST_HASH_PREFIX)) return null
  return decodeRestoreState(hash.slice(RESTORE_LIST_HASH_PREFIX.length))
}

export function readSavedListState(pathname = window.location.pathname) {
  try {
    const raw = localStorage.getItem(storageKey(pathname))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function readRestorableListState(pathname = window.location.pathname) {
  const saved = readSavedListState(pathname)
  const transferred = readRestoreListHashState()
  if (!transferred) return saved
  return { ...(saved || {}), ...transferred }
}

export function saveCurrentListState(state, pathname = window.location.pathname) {
  if (!state) return
  const payload = {
    search: state.search || '',
    searchMode: state.searchMode || 'both',
    excludeSearch: !!state.excludeSearch,
    levelMin: state.levelMin,
    levelMax: state.levelMax,
    bpmMin: state.bpmMin,
    bpmMax: state.bpmMax,
    category: state.category ?? null,
    quick: state.quick || 'all',
    flagNew: !!state.flagNew,
    flagVariants: !!state.flagVariants,
    flagFavorite: !!state.flagFavorite,
    flagMyPlayed: !!state.flagMyPlayed,
    artists: Array.from(state.artists || []),
    sort: state.sort || { key: null, dir: 'desc' },
    scrollOffset: currentListScrollOffset,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(storageKey(pathname), JSON.stringify(payload))
  } catch {}
}
