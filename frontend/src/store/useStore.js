import { create } from 'zustand'
import { getAuthMe, getAdminStatus, logoutApi, getMyFlags, addFavorite, removeFavorite, getMyPmangFavorites, addPmangFavorite, removePmangFavorite, getPmangYoutubeCandidates, getSongs, getMeta } from '../api/client'
import { replaceCatalogHash, songCatalogHash } from '../utils/catalogUrl'

const SHOW_ORIGINAL_BPM_KEY = 'r2b_show_original_bpm'
const SHOW_MY_PERCEIVED_KEY = 'r2b_show_my_perceived'

function readShowOriginalBpm() {
  try {
    return localStorage.getItem(SHOW_ORIGINAL_BPM_KEY) === '1'
  } catch {
    return false
  }
}

function readShowMyPerceived() {
  try {
    return localStorage.getItem(SHOW_MY_PERCEIVED_KEY) === '1'
  } catch {
    return false
  }
}

const useStore = create((set, get) => ({
  user: null,
  authLoaded: false,
  // 관리자 여부는 별도 API로 조회해 일반 세션 응답에서 숨긴다.
  isAdmin: false,
  adminLoaded: false,
  refreshUser: async () => {
    try {
      const { user } = await getAuthMe()
      if (user?.provider) {
        try { localStorage.setItem('r2b_last_provider', user.provider) } catch {}
      }
      set({ user: user || null, authLoaded: true, adminLoaded: !user })
      if (user) {
        get().refreshFlags()
        get().refreshPmangFavorites()
        getAdminStatus().then(d => {
          const isAdmin = !!d.is_admin
          set({ isAdmin, adminLoaded: true })
          if (isAdmin) get().refreshPmangYoutubeCandidates()
          else set({ pmangYoutubeCandidates: [] })
        }).catch(() => set({ isAdmin: false, adminLoaded: true, pmangYoutubeCandidates: [] }))
      } else {
        set({ favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, adminLoaded: true, pmangYoutubeCandidates: [] })
      }
    } catch {
      set({ user: null, authLoaded: true, favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, adminLoaded: true, pmangYoutubeCandidates: [] })
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    try { await logoutApi() } catch {}
    set({ user: null, favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, adminLoaded: true, pmangYoutubeCandidates: [] })
  },

  favorites: new Set(),
  played: new Set(),
  // 카테고리 필터에서는 동일 곡의 다른 난이도도 재생한 곡으로 취급한다.
  playedAll: new Set(),
  refreshFlags: async () => {
    try {
      const data = await getMyFlags()
      set({
        favorites: new Set(data.favorites || []),
        played: new Set(data.played || []),
        playedAll: new Set(data.played_all || data.played || []),
      })
    } catch {
      set({ favorites: new Set(), played: new Set(), playedAll: new Set() })
    }
  },
  toggleFavorite: async (songId) => {
    const { favorites, user } = get()
    if (!user) return
    const next = new Set(favorites)
    const wasFav = next.has(songId)
    if (wasFav) next.delete(songId); else next.add(songId)
    set({ favorites: next })
    try {
      if (wasFav) await removeFavorite(songId)
      else await addFavorite(songId)
    } catch {
      const rolled = new Set(get().favorites)
      if (wasFav) rolled.add(songId); else rolled.delete(songId)
      set({ favorites: rolled })
      alert('즐겨찾기 변경에 실패했어요')
    }
  },

  // 피망곡은 별도 ID 공간을 사용한다.
  pmangFavorites: new Set(),
  refreshPmangFavorites: async () => {
    try {
      const data = await getMyPmangFavorites()
      set({ pmangFavorites: new Set(data.favorites || []) })
    } catch {
      set({ pmangFavorites: new Set() })
    }
  },
  togglePmangFavorite: async (songId) => {
    const { pmangFavorites, user } = get()
    if (!user) return
    const next = new Set(pmangFavorites)
    const wasFav = next.has(songId)
    if (wasFav) next.delete(songId); else next.add(songId)
    set({ pmangFavorites: next })
    try {
      if (wasFav) await removePmangFavorite(songId)
      else await addPmangFavorite(songId)
    } catch {
      const rolled = new Set(get().pmangFavorites)
      if (wasFav) rolled.add(songId); else rolled.delete(songId)
      set({ pmangFavorites: rolled })
      alert('즐겨찾기 변경에 실패했어요')
    }
  },

  pmangYoutubeCandidates: [],
  refreshPmangYoutubeCandidates: async () => {
    try {
      const data = await getPmangYoutubeCandidates('pending')
      set({ pmangYoutubeCandidates: (data || []).map(x => ({ ...x, youtube_candidate: true })) })
    } catch {
      set({ pmangYoutubeCandidates: [] })
    }
  },
  markPlayed: (songId) => set(s => {
    if (!s.user) return {}
    if (s.played.has(songId)) return {}
    const next = new Set(s.played); next.add(songId)
    // 다른 난이도로 전환해도 재생한 곡으로 바로 표시한다.
    const song = s.songs.find(x => x.id === songId)
    const nextAll = new Set(s.playedAll || s.played)
    nextAll.add(songId)
    if (song) {
      s.songs.forEach(x => {
        if (x.name === song.name && x.artist === song.artist) nextAll.add(x.id)
      })
    }
    return { played: next, playedAll: nextAll }
  }),

  onboardingOpen: false,
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),


  songs: [],
  meta: null,
  loading: true,
  error: null,
  loadCatalog: async () => {
    set({ loading: true, error: null })
    try {
      const [songs, meta] = await Promise.all([getSongs(), getMeta()])
      set({
        songs,
        meta,
        levelMin: meta.level_min,
        levelMax: meta.level_max,
        bpmMin: meta.bpm_min,
        bpmMax: meta.bpm_max,
        loading: false,
        error: null,
      })
      return true
    } catch (err) {
      const detail = err?.response?.data?.detail
      set({
        loading: false,
        error: typeof detail === 'string' ? detail : '곡 목록을 불러오지 못했습니다.',
      })
      return false
    }
  },

  search: '',
  searchMode: 'both',
  excludeSearch: false,
  showOriginalBpm: readShowOriginalBpm(),
  showMyPerceived: readShowMyPerceived(),
  perceivedRevision: 0,
  levelMin: 7,
  levelMax: 12,
  bpmMin: null,
  bpmMax: null,
  category: 'sun',
  quick: 'all',
  // 모바일 빠른 필터는 서로 조합할 수 있다.
  flagNew: false,
  flagVariants: false,
  flagFavorite: false,
  flagMyPlayed: false,
  artists: new Set(),
  sort: { key: null, dir: 'desc' },

  mobileSheetOpen: false,
  openMobileSheet: () => set({ mobileSheetOpen: true }),
  closeMobileSheet: () => set({ mobileSheetOpen: false }),

  modalSong: null,
  modalOpen: false,
  modalReturnUrl: null,

  feedbackSong: null,
  feedbackOpen: false,

  loginOpen: false,

  setSongs: (songs) => set({ songs }),
  updateSongPerceived: (songId, avg, votes) => set(s => ({
    perceivedRevision: s.perceivedRevision + 1,
    songs: s.songs.map(x => x.id === songId
      ? { ...x, user_level_avg: avg, user_level_votes: votes }
      : x),
  })),
  setMeta: (meta) => set({ meta }),
  initFromMeta: (meta) => set({
    meta,
    levelMin: meta.level_min,
    levelMax: meta.level_max,
    bpmMin: meta.bpm_min,
    bpmMax: meta.bpm_max,
  }),
  restoreListState: (saved) => set(s => {
    if (!saved || typeof saved !== 'object') return {}
    const numberOr = (value, fallback) =>
      value === null || value === undefined || value === ''
        ? fallback
        : (Number.isFinite(Number(value)) ? Number(value) : fallback)
    return {
      search: typeof saved.search === 'string' ? saved.search : s.search,
      searchMode: ['both', 'name', 'artist'].includes(saved.searchMode) ? saved.searchMode : s.searchMode,
      excludeSearch: !!saved.excludeSearch && typeof saved.search === 'string' && !!saved.search.trim(),
      levelMin: numberOr(saved.levelMin, s.levelMin),
      levelMax: numberOr(saved.levelMax, s.levelMax),
      bpmMin: numberOr(saved.bpmMin, s.bpmMin),
      bpmMax: numberOr(saved.bpmMax, s.bpmMax),
      category: saved.category === 'star' || saved.category === 'moon' || saved.category === 'sun' ? saved.category : null,
      quick: saved.quick || s.quick,
      flagNew: !!saved.flagNew,
      flagVariants: !!saved.flagVariants,
      flagFavorite: !!saved.flagFavorite,
      flagMyPlayed: !!saved.flagMyPlayed,
      artists: new Set(Array.isArray(saved.artists) ? saved.artists : []),
      sort: saved.sort && typeof saved.sort === 'object' ? saved.sort : s.sort,
    }
  }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  setSearch: (search) => set({ search, ...(!search.trim() && { excludeSearch: false }) }),
  setSearchMode: (searchMode) => set({ searchMode }),
  setExcludeSearch: (excludeSearch) => set({ excludeSearch: !!excludeSearch }),
  setShowOriginalBpm: (showOriginalBpm) => {
    const next = !!showOriginalBpm
    try {
      if (next) localStorage.setItem(SHOW_ORIGINAL_BPM_KEY, '1')
      else localStorage.removeItem(SHOW_ORIGINAL_BPM_KEY)
    } catch {}
    set({ showOriginalBpm: next })
  },
  setShowMyPerceived: (showMyPerceived) => {
    const next = !!showMyPerceived
    try {
      if (next) localStorage.setItem(SHOW_MY_PERCEIVED_KEY, '1')
      else localStorage.removeItem(SHOW_MY_PERCEIVED_KEY)
    } catch {}
    set({ showMyPerceived: next })
  },
  setLevelMin: (v) => set({ levelMin: v, category: null }),
  setLevelMax: (v) => set({ levelMax: v, category: null }),
  setBpmMin: (v) => set({ bpmMin: v }),
  setBpmMax: (v) => set({ bpmMax: v }),

  setCategory: (cat) => set(s => ({
    category: s.category === cat ? null : cat,
    levelMin: s.meta?.level_min,
    levelMax: s.meta?.level_max,
  })),
  setCategoryDirect: (cat) => set(s => ({
    category: cat === 'star' || cat === 'moon' || cat === 'sun' ? cat : null,
    levelMin: s.meta?.level_min,
    levelMax: s.meta?.level_max,
  })),

  setQuick: (quick) => set({ quick }),
  toggleFlagNew: () => set(s => ({ flagNew: !s.flagNew })),
  toggleFlagVariants: () => set(s => ({ flagVariants: !s.flagVariants })),
  toggleFlagFavorite: () => set(s => ({ flagFavorite: !s.flagFavorite })),
  toggleFlagMyPlayed: () => set(s => ({ flagMyPlayed: !s.flagMyPlayed })),
  setFlagNew: (v) => set({ flagNew: !!v }),
  setFlagVariants: (v) => set({ flagVariants: !!v }),
  setFlagFavorite: (v) => set({ flagFavorite: !!v }),
  setFlagMyPlayed: (v) => set({ flagMyPlayed: !!v }),

  toggleArtist: (artist) => set(s => {
    const next = new Set(s.artists)
    if (next.has(artist)) next.delete(artist)
    else next.add(artist)
    return { artists: next }
  }),
  clearArtists: () => set({ artists: new Set() }),

  setSort: (key) => set(s => ({
    sort: s.sort.key === key
      ? { key, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['name', 'artist'].includes(key) ? 'asc' : 'desc' },
  })),
  setSortDirect: (sort) => set({ sort }),

  clearAllFilters: () => set(s => ({
    search: '', excludeSearch: false, levelMin: s.meta?.level_min, levelMax: s.meta?.level_max,
    bpmMin: s.meta?.bpm_min, bpmMax: s.meta?.bpm_max,
    category: 'sun', quick: 'all', artists: new Set(),
    flagNew: false, flagVariants: false, flagFavorite: false, flagMyPlayed: false,
  })),
  clearAllFiltersMobile: () => set(s => ({
    search: '', excludeSearch: false, levelMin: s.meta?.level_min, levelMax: s.meta?.level_max,
    bpmMin: s.meta?.bpm_min, bpmMax: s.meta?.bpm_max,
    category: null, quick: 'all', artists: new Set(),
    flagNew: false, flagVariants: false, flagFavorite: false, flagMyPlayed: false,
  })),

  openModal: (song) => {
    const state = get()
    const modalReturnUrl = state.modalOpen
      ? state.modalReturnUrl
      : `${window.location.pathname}${window.location.search}`
    if (song?.id) replaceCatalogHash(songCatalogHash(song.id), '/', '')
    set({ modalSong: song, modalOpen: true, modalReturnUrl: modalReturnUrl || '/' })
  },
  closeModal: () => {
    const { modalReturnUrl } = get()
    if (/^#song=\d+$/.test(window.location.hash)) {
      window.history.replaceState(window.history.state, '', modalReturnUrl || '/')
    }
    set({ modalOpen: false, modalSong: null, modalReturnUrl: null })
  },
  setModalReturnUrl: (url) => set({ modalReturnUrl: url || '/' }),
  updateModalSong: (song) => set({ modalSong: song }),

  openFeedback: (song) => set({ feedbackSong: song, feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false, feedbackSong: null }),

  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),

  myPageOpen: false,
  openMyPage: () => set({ myPageOpen: true }),
  closeMyPage: () => set({ myPageOpen: false }),
}))

export default useStore
