export const QUICK_FILTERS = [
  { key: 'all', label: '전체 곡' },
  { key: 'new', label: '신곡' },
  { key: 'variants', label: '변속곡' },
  { key: 'popular', label: '인기순', adminOnly: true },
  { key: 'favorite', label: '내 즐겨찾기', needLogin: true },
  { key: 'my_played', label: '내가 플레이한 곡', needLogin: true },
  { key: 'no_music', label: '음악 없음', adminOnly: true },
]

export const AI_MODES = [
  { key: 'hide', label: '숨기기' },
  { key: 'show', label: '표시', title: '일반 음원과 AI 생성 음원 모두 표시' },
  { key: 'only', label: 'AI만 표시' },
]

export const REMOVED_MODES = [
  { key: 'exclude', label: '삭제된 곡 제외' },
  { key: 'show', label: '삭제된 곡 표시', title: '일반 곡과 삭제된 곡 모두 표시' },
  { key: 'only', label: '삭제된 곡만 표시' },
]

const numberOrNull = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const validSortKeys = [null, 'file_order', 'name', 'korea_name', 'artist', 'level', 'userLevel', 'bpm', 'real_bpm', 'combo', 'time', 'play_count', 'favorite_count']

export function defaultDetailedFilters(meta = null) {
  return {
    category: 'sun', quick: 'all', artists: new Set(),
    personalCategoryId: null,
    levelMin: meta?.level_min ?? null, levelMax: meta?.level_max ?? null,
    bpmMin: meta?.bpm_min ?? null, bpmMax: meta?.bpm_max ?? null,
    aiMode: 'show', listenOnly: false, removedMode: 'exclude',
    flagNew: false, flagVariants: false, flagFavorite: false, flagMyPlayed: false,
    sort: { key: null, dir: 'desc' },
  }
}

export function normalizeDetailedFilters(value = {}, meta = null) {
  const source = value && typeof value === 'object' ? value : {}
  const result = defaultDetailedFilters(meta)
  result.category = ['star', 'moon', 'sun'].includes(source.category) ? source.category : null
  const personalCategoryId = Number(source.personalCategoryId)
  result.personalCategoryId = Number.isInteger(personalCategoryId) && personalCategoryId > 0 ? personalCategoryId : null
  const legacyQuick = source.flagNew ? 'new' : source.flagVariants ? 'variants' : source.flagFavorite ? 'favorite' : source.flagMyPlayed ? 'my_played' : 'all'
  result.quick = QUICK_FILTERS.some(item => item.key === source.quick) && source.quick !== 'all' ? source.quick : legacyQuick
  result.aiMode = AI_MODES.some(item => item.key === source.aiMode) ? source.aiMode : 'show'
  result.listenOnly = source.listenOnly === true
  result.removedMode = REMOVED_MODES.some(item => item.key === source.removedMode) ? source.removedMode : 'exclude'
  const artists = source.artists instanceof Set ? [...source.artists] : source.artists
  result.artists = new Set(Array.isArray(artists) ? artists.filter(name => typeof name === 'string' && name.trim()) : [])
  for (const [minKey, maxKey, lower, upper] of [
    ['levelMin', 'levelMax', meta?.level_min, meta?.level_max],
    ['bpmMin', 'bpmMax', meta?.bpm_min, meta?.bpm_max],
  ]) {
    const clamp = (value, fallback) => {
      const number = numberOrNull(value) ?? fallback ?? null
      if (number == null) return null
      return Math.max(lower ?? 0, Math.min(upper ?? Infinity, number))
    }
    result[minKey] = clamp(source[minKey], lower)
    result[maxKey] = clamp(source[maxKey], upper)
    if (result[minKey] != null && result[maxKey] != null && result[minKey] > result[maxKey]) {
      [result[minKey], result[maxKey]] = [result[maxKey], result[minKey]]
    }
  }
  if (source.sort && validSortKeys.includes(source.sort.key)) {
    result.sort = { key: source.sort.key, dir: source.sort.dir === 'asc' ? 'asc' : 'desc' }
  }
  return result
}

export function visibleQuickFilters({ xyxMode, isAdmin }) {
  return QUICK_FILTERS.filter(item => (!item.krOnly || !xyxMode) && (!item.adminOnly || isAdmin))
}

export function allowedQuickFilter(key, { xyxMode, isAdmin, user }) {
  const item = visibleQuickFilters({ xyxMode, isAdmin }).find(option => option.key === key)
  return item && (!item.needLogin || user) ? key : 'all'
}

export function detailedFilterCount(state, meta) {
  let count = state.quick && state.quick !== 'all' ? 1 : 0
  if (state.personalCategoryId != null) count++
  if (state.category) count++
  if (state.levelMin != null && (state.levelMin !== meta?.level_min || state.levelMax !== meta?.level_max)) count++
  if (state.bpmMin != null && (state.bpmMin !== meta?.bpm_min || state.bpmMax !== meta?.bpm_max)) count++
  if (state.aiMode && state.aiMode !== 'show') count++
  if (state.listenOnly) count++
  if (state.removedMode && state.removedMode !== 'exclude') count++
  return count + (state.artists?.size || 0)
}

export function selectedPersonalCategory(categories, categoryId) {
  if (categoryId == null) return null
  return (categories || []).find(category => Number(category.id) === Number(categoryId)) || null
}

export function selectedPersonalCategorySongIds(categories, categoryId) {
  if (categoryId == null) return null
  const category = selectedPersonalCategory(categories, categoryId)
  return new Set(category?.song_ids || [])
}

export function buildArtistCatalog(songs) {
  const catalog = new Map()
  for (const song of songs) {
    if (typeof song.artist !== 'string' || !song.artist.trim()) continue
    if (!catalog.has(song.artist)) catalog.set(song.artist, new Set())
    catalog.get(song.artist).add(String(song.name || '').trim().normalize('NFKC').toLowerCase())
  }
  return [...catalog].map(([artist, names]) => ({ artist, count: names.size }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist, 'ko'))
}

export function isAiSong(song) {
  return song.is_ai === true
}
