import { create } from 'zustand'
import { getRankings, searchRankingUsers, getUserRankingRecords, getMyRecords, saveManualRecords } from '../api/client'

// 개인 성과 페이지 전용 상태. useStore(전역)는 user/songs만 공유하고, 성과 필터·집계는 분리.
const useRankingsStore = create((set, get) => ({
  rankings: [],
  rankingsBySong: new Map(),
  groupTopBySong: new Map(),
  // myRecordsBySong: 곡당 '내 베스트' (verified·manual 중 더 높은 쪽). is_manual 플래그 포함.
  myRecordsBySong: new Map(),
  // myManualBySong: 곡당 내 manual 기록 (편집 모드 input의 기본값). 없으면 키 자체가 없음.
  myManualBySong: new Map(),
  pinnedRecordsBySong: new Map(),
  loaded: false,

  activeGroupId: null,

  // 사용자 핀 직전의 quick 값을 저장. 언핀 시 이 값으로 복구.
  // 핀 후에 사용자가 수동으로 quick을 바꾸면(setQuick 경유) null로 비워서
  // 사용자의 명시적 선택을 덮어쓰지 않게 함.
  quickBeforePin: null,

  editMode: false,
  // dirty: Map<song_id, { judgment?: string, url?: string }>. 사용자가 input에 입력한 원본.
  //        저장 시 이 Map만 보고 변경분을 백엔드로 전송.
  dirty: new Map(),
  saving: false,
  // 저장 시 URL 검증 실패 응답을 잠시 보관해 모달에서 사용.
  // null | { invalid: [{song_id, song_title, artist, url}], entriesToSave: [...] }
  invalidUrlsModal: null,

  search: '',
  searchMode: 'song',
  quick: 'all',
  // 모바일 칩에서 '성과있음'을 카테고리/내성과와 동시 선택 가능하게 하기 위한 독립 플래그.
  // RankingsPage rows useMemo에서 quick과 AND로 적용된다.
  flagRanked: false,
  levelMin: 1,
  levelMax: 12,
  category: 'sun',
  sort: { key: 'idx', dir: 'desc' },

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

  fetchRankings: async () => {
    try {
      const { activeGroupId } = get()
      const data = await getRankings(activeGroupId)
      const map = new Map()
      const gMap = new Map()
      for (const r of data) {
        map.set(r.song_id, r)
        if (r.group_top) gMap.set(r.song_id, r.group_top)
      }
      set({ rankings: data, rankingsBySong: map, groupTopBySong: gMap, loaded: true })
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
      const best = new Map()
      const manual = new Map()
      for (const rec of data.records || []) {
        if (rec.judgment_percent == null) continue
        const prev = best.get(rec.song_id)
        if (!prev || rec.judgment_percent > prev.judgment_percent) {
          best.set(rec.song_id, {
            song_id: rec.song_id,
            judgment_percent: rec.judgment_percent,
            score: rec.score,
            combo: rec.combo,
            is_manual: !!rec.is_manual,
          })
        }
        if (rec.is_manual) {
          const prevM = manual.get(rec.song_id)
          if (!prevM || rec.judgment_percent > prevM.judgment_percent) {
            manual.set(rec.song_id, {
              song_id: rec.song_id,
              judgment_percent: rec.judgment_percent,
              youtube_url: rec.youtube_url || null,
            })
          }
        }
      }
      set({ myRecordsBySong: best, myManualBySong: manual })
    } catch {
      set({ myRecordsBySong: new Map(), myManualBySong: new Map() })
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
    // 사용자 핀 시 빠른 필터를 자동으로 'mine'(=핀유저의 기록)으로 전환.
    // quickBeforePin: 첫 핀에선 직전 quick을 저장. 핀-교체 시엔 기존 저장값 유지
    // (원래 핀 시점의 컨텍스트가 더 의미있는 복구 지점).
    const prevQuick = get().quick
    const newBefore = get().quickBeforePin ?? prevQuick
    set({
      pinnedUser: user,
      pinnedRecordsBySong: new Map(),
      quick: 'mine',
      quickBeforePin: newBefore,
    })
    try {
      const data = await getUserRankingRecords(user.user_id)
      const map = new Map()
      for (const rec of data) map.set(rec.song_id, rec)
      if (get().pinnedUser?.user_id === user.user_id) {
        set({
          pinnedRecordsBySong: map,
          pinnedUser: { ...user, record_count: map.size },
        })
      }
    } catch (e) {
      // 권한 거부(403) / 존재하지 않음(404)이면 핀 자체를 되돌리고 caller에게 알려서
      // UI에서 "비공개" 메시지를 띄울 수 있게 함. 빠른 필터도 이전 값으로 복구.
      const status = e?.response?.status
      if (status === 403 || status === 404) {
        if (get().pinnedUser?.user_id === user.user_id) {
          set({
            pinnedUser: null,
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
    // 핀 직전 quick(quickBeforePin)이 보존돼있으면 거기로 복구.
    // 사용자가 핀 후 수동으로 quick을 바꿨다면 quickBeforePin은 null이고,
    // 그 경우엔 현재 quick을 유지(사용자의 마지막 선택 존중).
    set({
      pinnedUser: null,
      pinnedRecordsBySong: new Map(),
      quick: state.quickBeforePin ?? state.quick,
      quickBeforePin: null,
    })
  },

  enableEditMode: () => set({ editMode: true }),
  disableEditMode: () => set({ editMode: false, dirty: new Map(), invalidUrlsModal: null }),
  setDirtyValue: (songId, field, value) => set(s => {
    const next = new Map(s.dirty)
    const cur = next.get(songId) || {}
    next.set(songId, { ...cur, [field]: value })
    return { dirty: next }
  }),
  closeInvalidUrlsModal: () => set({ invalidUrlsModal: null }),
  // 저장: dirty Map을 백엔드 entries로 변환 → bulk PUT.
  // URL 검증 실패(422) 시 invalidUrlsModal에 정보 저장, caller는 모달로 사용자 선택 받음.
  // skipUrlsForSongIds: 두 번째 시도 시 이 song_id들의 URL을 비워서 보낼 때 사용.
  saveDirty: async (skipUrlsForSongIds = null) => {
    const { dirty, myManualBySong } = get()
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
          entries.push({ song_id: songId, judgment_percent: null, youtube_url: null })
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
    userResults: [], userQuery: '',
    pinnedUser: null, pinnedRecordsBySong: new Map(),
    quickBeforePin: null,
  }),
}))

export default useRankingsStore
