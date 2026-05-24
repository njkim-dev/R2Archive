import { SERVER_MODE } from './serverMode'

const STORAGE_PREFIX = 'r2b:list-state:v1'
export const RESTORE_LIST_PARAM = 'restoreList'

let currentListScrollOffset = 0

function normalizeListPath(pathname = window.location.pathname) {
  return pathname === '/removed-songs' ? '/removed-songs' : '/'
}

function storageKey(pathname = window.location.pathname) {
  return `${STORAGE_PREFIX}:${SERVER_MODE}:${normalizeListPath(pathname)}`
}

export function setCurrentListScrollOffset(offset) {
  currentListScrollOffset = Math.max(0, Number(offset) || 0)
}

export function shouldRestoreListState() {
  try {
    return new URLSearchParams(window.location.search).get(RESTORE_LIST_PARAM) === '1'
  } catch {
    return false
  }
}

export function withRestoreListParam(url) {
  try {
    const next = new URL(url, window.location.href)
    next.searchParams.set(RESTORE_LIST_PARAM, '1')
    return next.toString()
  } catch {
    return url
  }
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

export function saveCurrentListState(state, pathname = window.location.pathname) {
  if (!state) return
  const payload = {
    search: state.search || '',
    searchMode: state.searchMode || 'both',
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
