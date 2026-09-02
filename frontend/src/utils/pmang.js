// 피망 난이도는 저장값의 절반을 화면값으로 사용한다.

import Fuse from 'fuse.js'

const _fuseCache = new Map()
const SEARCH_NORMALIZE_RE = /[^\p{L}\p{N}]+/gu

function normalizeSearchText(value) {
  return String(value ?? '').replace(SEARCH_NORMALIZE_RE, '').toLowerCase()
}

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
      if (Array.isArray(val)) return val.map(normalizeSearchText)
      return typeof val === 'string' ? normalizeSearchText(val) : val
    },
  })
  _fuseCache.set(mode, { songs, fuse })
  return fuse
}

function passes(s, { levelMin, levelMax, bpmMin, bpmMax, category, artists, quick, favorites }) {
  const lv = s.level / 2
  if (levelMin != null && lv < levelMin) return false
  if (levelMax != null && lv > levelMax) return false
  const minBpm = s.bpm ?? 0
  const maxBpm = s.bpm_max ?? s.bpm ?? 0
  if (bpmMin != null && maxBpm < bpmMin) return false
  if (bpmMax != null && minBpm > bpmMax) return false
  if (category === 'star' && (lv < 1.5 || lv > 3.5)) return false
  if (category === 'moon' && (lv < 4 || lv > 6.5)) return false
  if (category === 'sun' && lv < 7) return false
  if (artists && artists.size && !artists.has(s.artist)) return false
  if (quick === 'favorite' && !(favorites && favorites.has(s.id))) return false
  if (quick === 'no_music' && s.youtube_url) return false
  return true
}

export function filterPmangSongs(songs, filters) {
  const { search = '', searchMode = 'both' } = filters
  const q = search.trim()

  if (!q) {
    return { exact: songs.filter(s => passes(s, filters)), fuzzy: [] }
  }

  const qNorm = normalizeSearchText(q)
  const exactSet = new Set()
  const exact = []

  const matchName = searchMode === 'both' || searchMode === 'name'
  const matchArtist = searchMode === 'both' || searchMode === 'artist'

  songs.forEach(s => {
    if (!passes(s, filters)) return
    const nameNorm = normalizeSearchText(s.name)
    const artistNorm = normalizeSearchText(s.artist)
    const aliasHit = matchName && (s.aliases || []).some(a =>
      normalizeSearchText(a).includes(qNorm)
    )
    const nameHit = matchName && nameNorm.includes(qNorm)
    const artistHit = matchArtist && artistNorm.includes(qNorm)
    if (nameHit || aliasHit || artistHit) {
      exact.push(s)
      exactSet.add(s.id)
    }
  })

  const fuse = getFuse(songs, searchMode)
  const fuzzy = fuse.search(qNorm)
    .map(r => r.item)
    .filter(s => !exactSet.has(s.id) && passes(s, filters))

  return { exact, fuzzy }
}

export function sortPmangSongs(songs, sort) {
  const { key, dir } = sort
  if (!key) return songs
  const d = dir === 'asc' ? 1 : -1
  return [...songs].sort((a, b) => {
    let va, vb
    if (key === 'name' || key === 'artist') {
      va = (a[key] || '').toLowerCase()
      vb = (b[key] || '').toLowerCase()
    } else {
      va = a[key] ?? 0
      vb = b[key] ?? 0
    }
    if (va < vb) return -1 * d
    if (va > vb) return 1 * d
    return 0
  })
}
