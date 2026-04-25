export function getAnonId() {
  let id = localStorage.getItem('r2b_anon_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('r2b_anon_id', id)
  }
  return id
}


// song_id, session_id UNIQUE로 서버에서 중복 재생 카운트를 제거
// routers/songs.py log_play()
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

export function artworkBg(id) {
  const h1 = (id * 37) % 360
  const h2 = (h1 + 40 + (id * 13) % 80) % 360
  return `linear-gradient(135deg, oklch(0.72 0.18 ${h1}), oklch(0.55 0.22 ${h2}))`
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

export function timeToSec(t) {
  if (!t) return 0
  const [m, s] = t.split(':').map(Number)
  return m * 60 + (s || 0)
}

import Fuse from 'fuse.js'

const _fuseCache = new Map()   // key: `${mode}` → { songs, fuse }

function getFuse(songs, mode = 'both') {
  const cached = _fuseCache.get(mode)
  if (cached && cached.songs === songs) return cached.fuse
  const keys = mode === 'name' ? ['name', 'aliases']
             : mode === 'artist' ? ['artist']
             : ['name', 'artist', 'aliases']
  const fuse = new Fuse(songs, {
    keys,
    threshold: 0.3,
    ignoreLocation: true,
    useExtendedSearch: false,
    getFn: (obj, path) => {
      const val = Fuse.config.getFn(obj, path)
      if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v.replace(/\s+/g, '') : v)
      return typeof val === 'string' ? val.replace(/\s+/g, '') : val
    },
  })
  _fuseCache.set(mode, { songs, fuse })
  return fuse
}

function passesFilters(s, { levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, favorites, played }) {
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
  return true
}

export function filterSongs(songs, filters) {
  const { search, searchMode = 'both' } = filters
  const q = search.trim()

  if (!q) {
    return { exact: songs.filter(s => passesFilters(s, filters)), fuzzy: [] }
  }

  const qNorm = q.replace(/\s+/g, '').toLowerCase()
  const exactSet = new Set()
  const exact = []

  const matchName = searchMode === 'both' || searchMode === 'name'
  const matchArtist = searchMode === 'both' || searchMode === 'artist'

  songs.forEach(s => {
    if (!passesFilters(s, filters)) return
    const nameNorm = s.name.replace(/\s+/g, '').toLowerCase()
    const artistNorm = s.artist.replace(/\s+/g, '').toLowerCase()
    const aliasMatch = matchName && (s.aliases || []).some(a => a.replace(/\s+/g, '').toLowerCase().includes(qNorm))
    const nameHit = matchName && nameNorm.includes(qNorm)
    const artistHit = matchArtist && artistNorm.includes(qNorm)
    if (nameHit || artistHit || aliasMatch) {
      exact.push(s)
      exactSet.add(s.id)
    }
  })

  const fuse = getFuse(songs, searchMode)
  const fuzzy = fuse.search(qNorm)
    .map(r => r.item)
    .filter(s => !exactSet.has(s.id) && passesFilters(s, filters))

  return { exact, fuzzy }
}

export function sortSongs(songs, sort) {
  const { key, dir } = sort
  // 기본 정렬: 신곡(stat) 우선, 같은 그룹 내에서는 file_order 내림차순 (최신곡순)
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
    else if (key === 'name' || key === 'artist') { va = (a[key] || '').toLowerCase(); vb = (b[key] || '').toLowerCase() }
    else if (key === 'userLevel') {
      va = a.user_level_avg; vb = b.user_level_avg
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
    }
    else { va = a[key] ?? 0; vb = b[key] ?? 0 }
    if (va < vb) return -1 * d
    if (va > vb) return 1 * d
    return 0
  })
}
