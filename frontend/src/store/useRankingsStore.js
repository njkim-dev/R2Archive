import { create } from 'zustand'
import { getRankings, searchRankingUsers, getUserRankingRecords, getMyRecords, saveManualRecords } from '../api/client'

const recordSpeed = (record) => record.speed || 'ultra'

function bestRecordsBySong(records, speed = 'all', manualOnly = false) {
  const map = new Map()
  for (const record of records || []) {
    if (record.judgment_percent == null) continue
    if (manualOnly && !record.is_manual) continue
    if (speed !== 'all' && recordSpeed(record) !== speed) continue
    const previous = map.get(record.song_id)
    if (!previous || record.judgment_percent > previous.judgment_percent) {
      map.set(record.song_id, { ...record, speed: recordSpeed(record) })
    }
  }
  return map
}

const useRankingsStore = create((set, get) => ({
  rankings: [],
  rankingsBySong: new Map(),
  groupTopBySong: new Map(),
  // 검증 기록과 수동 기록 중 곡별 최고 성과를 보관한다.
  myRecordsBySong: new Map(),
  myManualBySong: new Map(),
  pinnedRecordsBySong: new Map(),
  myRecords: [],
  pinnedRecords: [],
  loaded: false,

  activeGroupId: null,

  quickBeforePin: null,

  editMode: false,
  editSpeed: 'ultra',
  dirty: new Map(),
  saving: false,
  invalidUrlsModal: null,

  search: '',
  searchMode: 'song',
  quick: 'all',
  // 모바일의 성과 필터는 다른 필터와 조합할 수 있다.
  flagRanked: false,
  levelMin: 1,
  levelMax: 12,
  category: 'sun',
  sort: { key: 'idx', dir: 'desc' },
  speedFilter: 'all',

  userQuery: '',
  userResults: [],
  userSearching: false,
  pinnedUser: null,

  setSearch: (search) => set({ search }),
  setSearchMode: (searchMode) => set({ searchMode, search: '', userResults: [] }),
  setQuick: (quick) => set({ quick, quickBeforePin: null }),
  toggleFlagRanked: () => set(s => ({ flagRanked: !s.flagRanked })),
  setFlagRanked: (v) => set({ flagRanked: !!v }),
  setLevelMin: (v) => set({ levelMin: v, category: null }),
  setLevelMax: (v) => set({ levelMax: v, category: null }),
  setCategory: (cat) => set(s => ({
    category: s.category === cat ? null : cat,
    levelMin: 1,
    levelMax: 12,
  })),
  setSort: (key) => set(s => ({
    sort: s.sort.key === key
      ? { key, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['name', 'artist'].includes(key) ? 'asc' : 'desc' },
  })),
  setSpeedFilter: async (speedFilter) => {
    if (!['all', 'normal', 'fast', 'ultra'].includes(speedFilter)) return
    const state = get()
    set({
      speedFilter,
      myRecordsBySong: bestRecordsBySong(state.myRecords, speedFilter),
      pinnedRecordsBySong: bestRecordsBySong(state.pinnedRecords, speedFilter),
    })
    await get().fetchRankings()
  },

  fetchRankings: async () => {
    try {
      const { activeGroupId, speedFilter } = get()
      const data = await getRankings(activeGroupId, speedFilter)
      const map = new Map()
      const gMap = new Map()
      for (const r of data) {
        map.set(r.song_id, r)
        if (r.group_top) gMap.set(r.song_id, r.group_top)
      }
      if (get().speedFilter === speedFilter) {
        set({ rankings: data, rankingsBySong: map, groupTopBySong: gMap, loaded: true })
      }
    } catch (e) {
      console.error('fetchRankings failed', e)
      set({ loaded: true })
    }
  },

  setActiveGroup: async (gid) => {
    if (get().activeGroupId === gid) return
    set({ activeGroupId: gid })
    await get().fetchRankings()
  },

  fetchMyRecords: async () => {
    try {
      const data = await getMyRecords()
      const records = data.records || []
      set({
        myRecords: records,
        myRecordsBySong: bestRecordsBySong(records, get().speedFilter),
        myManualBySong: bestRecordsBySong(records, get().editSpeed, true),
      })
    } catch {
      set({ myRecords: [], myRecordsBySong: new Map(), myManualBySong: new Map() })
    }
  },

  searchUsers: async (q) => {
    const query = (q || '').trim()
    set({ userQuery: query })
    if (!query) { set({ userResults: [], userSearching: false }); return }
    set({ userSearching: true })
    try {
      const data = await searchRankingUsers(query)
      if (get().userQuery === query) set({ userResults: data, userSearching: false })
    } catch {
      if (get().userQuery === query) set({ userResults: [], userSearching: false })
    }
  },

  pinUser: async (user) => {
    // 핀을 바꿔도 최초 핀 직전의 필터를 복원 지점으로 유지한다.
    const prevQuick = get().quick
    const newBefore = get().quickBeforePin ?? prevQuick
    set({
      pinnedUser: user,
      pinnedRecords: [],
      pinnedRecordsBySong: new Map(),
      quick: 'mine',
      quickBeforePin: newBefore,
    })
    try {
      const data = await getUserRankingRecords(user.user_id)
      const map = bestRecordsBySong(data, get().speedFilter)
      if (get().pinnedUser?.user_id === user.user_id) {
        set({
          pinnedRecords: data,
          pinnedRecordsBySong: map,
          pinnedUser: { ...user, record_count: map.size },
        })
      }
    } catch (e) {
      // 조회할 수 없는 사용자는 핀과 필터를 이전 상태로 되돌린다.
      const status = e?.response?.status
      if (status === 403 || status === 404) {
        if (get().pinnedUser?.user_id === user.user_id) {
          set({
            pinnedUser: null,
            pinnedRecords: [],
            pinnedRecordsBySong: new Map(),
            quick: prevQuick,
            quickBeforePin: null,
          })
        }
        throw e
      }
      if (get().pinnedUser?.user_id === user.user_id) set({ pinnedRecordsBySong: new Map() })
    }
  },

  unpinUser: () => {
    const state = get()
    // 핀 이후 직접 바꾼 필터가 있으면 그 선택을 유지한다.
    set({
      pinnedUser: null,
      pinnedRecords: [],
      pinnedRecordsBySong: new Map(),
      quick: state.quickBeforePin ?? state.quick,
      quickBeforePin: null,
    })
  },

  enableEditMode: (editSpeed = 'ultra') => set(s => ({
    editMode: true,
    editSpeed,
    dirty: new Map(),
    myManualBySong: bestRecordsBySong(s.myRecords, editSpeed, true),
  })),
  disableEditMode: () => set({ editMode: false, dirty: new Map(), invalidUrlsModal: null }),
  setDirtyValue: (songId, field, value) => set(s => {
    const next = new Map(s.dirty)
    const cur = next.get(songId) || {}
    next.set(songId, { ...cur, [field]: value })
    return { dirty: next }
  }),
  closeInvalidUrlsModal: () => set({ invalidUrlsModal: null }),
  // URL 검증에 실패한 곡은 제외한 뒤 다시 저장할 수 있다.
  saveDirty: async (skipUrlsForSongIds = null) => {
    const { dirty, myManualBySong, editSpeed } = get()
    if (dirty.size === 0) return { ok: true, sent: 0 }
    const skipSet = skipUrlsForSongIds ? new Set(skipUrlsForSongIds) : null

    const entries = []
    const urlOnlyWithoutJudgment = []

    for (const [songId, val] of dirty.entries()) {
      const judgmentRaw = (val?.judgment ?? '').toString().trim()
      const urlRawOriginal = (val?.url ?? '').toString().trim()
      const urlRaw = skipSet?.has(songId) ? '' : urlRawOriginal

      if (judgmentRaw === '' && urlRaw === '') {
        if (myManualBySong.has(songId)) {
          entries.push({ song_id: songId, judgment_percent: null, youtube_url: null, speed: editSpeed })
        }
        continue
      }

      if (judgmentRaw === '') {
        if (urlRawOriginal !== '') urlOnlyWithoutJudgment.push(songId)
        continue
      }

      const num = Number(judgmentRaw)
      if (!Number.isFinite(num) || num < 0 || num > 99) continue
      entries.push({
        song_id: songId,
        judgment_percent: Math.round(num * 1000) / 1000,
        youtube_url: urlRaw || null,
        speed: editSpeed,
      })
    }

    if (entries.length === 0) {
      if (urlOnlyWithoutJudgment.length > 0) {
        return { ok: false, urlOnlyWithoutJudgment }
      }
      set({ dirty: new Map() })
      return { ok: true, sent: 0 }
    }

    set({ saving: true })
    try {
      await saveManualRecords(entries)
      set({ dirty: new Map(), saving: false, invalidUrlsModal: null })
      await get().fetchMyRecords()
      return { ok: true, sent: entries.length, urlOnlyWithoutJudgment }
    } catch (e) {
      set({ saving: false })
      const detail = e?.response?.data?.detail
      if (e?.response?.status === 422 && detail && detail.code === 'invalid_youtube_urls') {
        set({ invalidUrlsModal: { invalid: detail.invalid || [] } })
        return { ok: false, invalidUrls: detail.invalid || [] }
      }
      throw e
    }
  },

  resetFilters: () => set({
    search: '', searchMode: 'song', quick: 'all',
    flagRanked: false,
    levelMin: 1, levelMax: 12, category: 'sun',
    sort: { key: 'idx', dir: 'desc' },
    speedFilter: 'all',
    userResults: [], userQuery: '',
    pinnedUser: null, pinnedRecords: [], pinnedRecordsBySong: new Map(),
    quickBeforePin: null,
  }),
}))

export default useRankingsStore
