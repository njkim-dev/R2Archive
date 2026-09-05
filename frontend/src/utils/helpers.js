export function getAnonId() {
  let id = localStorage.getItem('r2b_anon_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('r2b_anon_id', id)
  }
  return id
}


// 서버는 곡과 세션 조합으로 중복 재생을 제거한다.
export function getSessionId() {
  let id = sessionStorage.getItem('r2b_session_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('r2b_session_id', id)
  }
  return id
}

export function levelBarColor(lv) {
  if (lv >= 9.5) return 'oklch(0.68 0.22 350)'
  if (lv >= 9)   return 'oklch(0.70 0.22 5)'
  if (lv >= 8)   return 'oklch(0.75 0.18 30)'
  if (lv >= 7)   return 'oklch(0.80 0.16 55)'
  if (lv >= 6)   return 'oklch(0.82 0.14 85)'
  if (lv >= 4)   return 'oklch(0.80 0.11 135)'
  return 'oklch(0.78 0.09 160)'
}

export function categoryFromLevel(lv) {
  const level = Number(lv)
  if (!Number.isFinite(level)) return null
  if (level >= 7) return 'sun'
  if (level >= 4) return 'moon'
  return 'star'
}

export function artworkBg(id) {
  const h1 = (id * 37) % 360
  const h2 = (h1 + 40 + (id * 13) % 80) % 360
  return `linear-gradient(135deg, oklch(0.72 0.18 ${h1}), oklch(0.55 0.22 ${h2}))`
}

export function staticUrl(path) {
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  const cleanPath = String(path ?? '').replace(/^\/+/, '').replace(/^static\//, '')
  return `${base}/static/${cleanPath}`
}

export function artworkThumbnailUrl(path) {
  const sourcePath = String(path ?? '')
  if (!/\.(?:bmp|png|jpe?g)$/i.test(sourcePath)) return staticUrl(sourcePath)
  return staticUrl(sourcePath.replace(/\.(?:bmp|png|jpe?g)$/i, '.webp'))
}

export function bpmWaveBars(bpm, count = 14) {
  const dur = `${(60 / bpm).toFixed(3)}s`
  return Array.from({ length: count }, (_, i) => {
    const phase = (i * 0.618) % 1
    const delay = `-${(phase * (60 / bpm)).toFixed(3)}s`
    const height = `${25 + Math.sin(i * 1.3 + bpm * 0.03) * 35 + 40}%`
    return { '--dur': dur, animationDelay: delay, height }
  })
}

export const fmt = n => (n ?? 0).toLocaleString()

export const fmtBpm = bpm => {
  const n = Number(bpm)
  if (!Number.isFinite(n)) return String(bpm ?? '')
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export function timeToSec(t) {
  if (!t) return 0
  const [m, s] = t.split(':').map(Number)
  return m * 60 + (s || 0)
}

import Fuse from 'fuse.js'

const _fuseCache = new Map()
const SEARCH_NORMALIZE_RE = /[^\p{L}\p{N}]+/gu

export function normalizeSearchText(value) {
  return String(value ?? '').replace(SEARCH_NORMALIZE_RE, '').toLowerCase()
}

function getSearchTerms(value) {
  const seen = new Set()
  return String(value ?? '')
    .split(',')
    .map(normalizeSearchText)
    .filter(term => {
      if (!term || seen.has(term)) return false
      seen.add(term)
      return true
    })
}

function getFuse(songs, mode = 'both') {
  const cached = _fuseCache.get(mode)
  if (cached && cached.songs === songs) return cached.fuse
  const nameKeys = ['name', 'korea_name', 'xyx_name', 'aliases']
  const keys = mode === 'name' ? nameKeys
             : mode === 'artist' ? ['artist', 'artist_aliases']
             : [...nameKeys, 'artist', 'artist_aliases']
  const fuse = new Fuse(songs, {
    keys,
    threshold: 0.3,
    ignoreLocation: true,
    useExtendedSearch: false,
    getFn: (obj, path) => {
      const val = Fuse.config.getFn(obj, path)
      if (Array.isArray(val)) return val.map(normalizeSearchText)
      return typeof val === 'string' ? normalizeSearchText(val) : val
    },
  })
  _fuseCache.set(mode, { songs, fuse })
  return fuse
}

// 재생 수가 공유되는 동일 곡은 최고 난이도 행만 남긴다.
export function dedupeByNameArtistMaxLevel(songs) {
  const map = new Map()
  for (const s of songs) {
    const key = `${s.name}\u0000${s.artist}`
    const cur = map.get(key)
    if (!cur || s.level > cur.level) map.set(key, s)
  }
  return [...map.values()]
}

function passesFilters(s, { levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, favorites, played, flagNew, flagVariants, flagFavorite, flagMyPlayed }) {
  if (levelMin != null && s.level < levelMin) return false
  if (levelMax != null && s.level > levelMax) return false
  if (category === 'star' && (s.level < 1.5 || s.level > 3.5)) return false
  if (category === 'moon' && (s.level < 4 || s.level > 6.5)) return false
  if (category === 'sun' && s.level < 7) return false
  if (bpmMin != null && s.bpm < bpmMin) return false
  if (bpmMax != null && s.bpm > bpmMax) return false
  if (artists.size && !artists.has(s.artist)) return false
  if (quick === 'new' && !s.is_new) return false
  if (quick === 'played' && !s.play_count) return false
  if (quick === 'variants' && !s.is_change) return false
  if (quick === 'favorite' && !(favorites && favorites.has(s.id))) return false
  if (quick === 'my_played' && !(played && played.has(s.id))) return false
  if (quick === 'no_music' && s.youtube_url) return false
  if (flagNew && !s.is_new) return false
  if (flagVariants && !s.is_change) return false
  if (flagFavorite && !(favorites && favorites.has(s.id))) return false
  if (flagMyPlayed && !(played && played.has(s.id))) return false
  return true
}

// 곡명, 연결 서버 곡명, 아티스트와 별칭을 같은 규칙으로 검색한다.
export function matchSong(song, query) {
  const terms = getSearchTerms(query)
  if (!terms.length) return false
  const nameFields = [song.name, song.korea_name, song.xyx_name]
  if (nameFields.some(value => {
    const norm = normalizeSearchText(value)
    return norm && terms.some(term => norm.includes(term))
  })) return true
  const artistNorm = normalizeSearchText(song.artist)
  if (terms.some(term => artistNorm.includes(term))) return true
  for (const a of (song.artist_aliases || [])) {
    const aliasNorm = normalizeSearchText(a)
    if (terms.some(term => aliasNorm.includes(term))) return true
  }
  for (const a of (song.aliases || [])) {
    const aliasNorm = normalizeSearchText(a)
    if (terms.some(term => aliasNorm.includes(term))) return true
  }
  return false
}

export function filterSongs(songs, filters) {
  const { search, searchMode = 'both', quick, excludeSearch = false } = filters
  const searchTerms = getSearchTerms(search)
  const dedupe = quick === 'played'

  if (!searchTerms.length) {
    let exact = songs.filter(s => passesFilters(s, filters))
    if (dedupe) exact = dedupeByNameArtistMaxLevel(exact)
    return { exact, fuzzy: [] }
  }

  const exactSet = new Set()
  const exact = []

  const matchName = searchMode === 'both' || searchMode === 'name'
  const matchArtist = searchMode === 'both' || searchMode === 'artist'

  songs.forEach(s => {
    if (!passesFilters(s, filters)) return
    const nameNorm = normalizeSearchText(s.name)
    const koreaNameNorm = normalizeSearchText(s.korea_name)
    const xyxNameNorm = normalizeSearchText(s.xyx_name)
    const artistNorm = normalizeSearchText(s.artist)
    const aliasMatch = matchName && (s.aliases || []).some(a => {
      const aliasNorm = normalizeSearchText(a)
      return searchTerms.some(term => aliasNorm.includes(term))
    })
    const artistAliasMatch = matchArtist && (s.artist_aliases || []).some(a => {
      const aliasNorm = normalizeSearchText(a)
      return searchTerms.some(term => aliasNorm.includes(term))
    })
    const nameHit = matchName && searchTerms.some(term =>
      nameNorm.includes(term) || koreaNameNorm.includes(term) || xyxNameNorm.includes(term)
    )
    const artistHit = matchArtist && searchTerms.some(term => artistNorm.includes(term))
    if (nameHit || artistHit || aliasMatch || artistAliasMatch) {
      exact.push(s)
      exactSet.add(s.id)
    }
  })

  const fuse = getFuse(songs, searchMode)
  const fuzzySet = new Set()
  let fuzzy = []
  searchTerms.forEach(term => {
    fuse.search(term).forEach(({ item }) => {
      if (exactSet.has(item.id) || fuzzySet.has(item.id) || !passesFilters(item, filters)) return
      fuzzy.push(item)
      fuzzySet.add(item.id)
    })
  })

  if (excludeSearch) {
    let remaining = songs.filter(s =>
      !exactSet.has(s.id) && !fuzzySet.has(s.id) && passesFilters(s, filters)
    )
    if (dedupe) remaining = dedupeByNameArtistMaxLevel(remaining)
    return { exact: remaining, fuzzy: [] }
  }

  if (dedupe) {
    const exactDeduped = dedupeByNameArtistMaxLevel(exact)
    const keptKeys = new Set(exactDeduped.map(s => `${s.name} ${s.artist}`))
    fuzzy = dedupeByNameArtistMaxLevel(fuzzy).filter(s => !keptKeys.has(`${s.name} ${s.artist}`))
    return { exact: exactDeduped, fuzzy }
  }

  return { exact, fuzzy }
}

export function sortSongs(songs, sort, myPerceivedLevels = null) {
  const { key, dir } = sort
  if (!key) {
    return [...songs].sort((a, b) => {
      if (a.is_new !== b.is_new) return a.is_new ? -1 : 1
      return (b.file_order ?? 0) - (a.file_order ?? 0)
    })
  }
  const d = dir === 'asc' ? 1 : -1
  return [...songs].sort((a, b) => {
    let va, vb
    if (key === 'time') { va = timeToSec(a.time); vb = timeToSec(b.time) }
    else if (key === 'name' || key === 'korea_name' || key === 'artist') { va = (a[key] || '').toLowerCase(); vb = (b[key] || '').toLowerCase() }
    else if (key === 'userLevel') {
      va = myPerceivedLevels ? myPerceivedLevels[a.id] : a.user_level_avg
      vb = myPerceivedLevels ? myPerceivedLevels[b.id] : b.user_level_avg
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
    }
    else { va = a[key] ?? 0; vb = b[key] ?? 0 }
    if (va < vb) return -1 * d
    if (va > vb) return 1 * d
    return 0
  })
}
