import { create } from 'zustand'
import { getAuthMe, getAdminStatus, logoutApi, getMyFlags, addFavorite, removeFavorite, getMyPmangFavorites, addPmangFavorite, removePmangFavorite, getPmangYoutubeCandidates } from '../api/client'

const useStore = create((set, get) => ({
  // user: { id, nickname, default_visibility, onboarded, provider } | null
  user: null,
  authLoaded: false,
  // 관리자 여부 — /auth/me에는 포함하지 않고 별도 /auth/admin-status로 분리 조회.
  isAdmin: false,
  refreshUser: async () => {
    try {
      const { user } = await getAuthMe()
      if (user?.provider) {
        try { localStorage.setItem('r2b_last_provider', user.provider) } catch {}
      }
      set({ user: user || null, authLoaded: true })
      if (user) {
        get().refreshFlags()
        get().refreshPmangFavorites()
        // 관리자 상태는 별도 호출. 실패해도(비로그인/네트워크) false로 폴백.
        getAdminStatus().then(d => {
          const isAdmin = !!d.is_admin
          set({ isAdmin })
          if (isAdmin) get().refreshPmangYoutubeCandidates()
          else set({ pmangYoutubeCandidates: [] })
        }).catch(() => set({ isAdmin: false, pmangYoutubeCandidates: [] }))
      } else {
        set({ favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, pmangYoutubeCandidates: [] })
      }
    } catch {
      set({ user: null, authLoaded: true, favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, pmangYoutubeCandidates: [] })
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    try { await logoutApi() } catch {}
    set({ user: null, favorites: new Set(), played: new Set(), playedAll: new Set(), pmangFavorites: new Set(), flagFavorite: false, flagMyPlayed: false, isAdmin: false, pmangYoutubeCandidates: [] })
  },

  favorites: new Set(),   // Set<song_id>
  played: new Set(),      // 실제 플레이한 song_id (채널별 분리)
  playedAll: new Set(),   // 동일 곡의 모든 채널 인스턴스 포함 (카테고리 필터 ON일 때 사용)
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

  // 과거 피망곡 즐겨찾기 — pmang_songs.id 공간이 본 게임과 별도라 별도 Set으로 관리.
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
    // playedAll에도 동일 (name, artist) 곡의 모든 채널 인스턴스 추가 — 카테고리 필터 ON 상태에서
    // 다른 채널로 전환했을 때 즉시 "내가 플레이한 곡"으로 노출되도록.
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

  search: '',
  searchMode: 'both',   // 'both' | 'name' | 'artist'
  levelMin: 7,
  levelMax: 12,
  bpmMin: null,
  bpmMax: null,
  category: 'sun',     // null | 'star' | 'moon' | 'sun'
  quick: 'all',         // all | new | played | variants | popular
  // 모바일 칩에서 신곡/변속곡/즐겨찾기/내플레이를 다른 필터와 동시 선택 가능하게 하기 위한 독립 플래그.
  // helpers.passesFilters에서 quick과 AND로 적용된다.
  flagNew: false,
  flagVariants: false,
  flagFavorite: false,
  flagMyPlayed: false,
  artists: new Set(),
  sort: { key: null, dir: 'desc' },

  mobileSheetOpen: false,
  openMobileSheet: () => set({ mobileSheetOpen: true }),
  closeMobileSheet: () => set({ mobileSheetOpen: false }),

  modalSong: null,      // song detail object from GET /songs/:id
  modalOpen: false,

  feedbackSong: null,   // { id, name, artist }
  feedbackOpen: false,

  loginOpen: false,

  setSongs: (songs) => set({ songs }),
  updateSongPerceived: (songId, avg, votes) => set(s => ({
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

  setSearch: (search) => set({ search }),
  setSearchMode: (searchMode) => set({ searchMode }),
  setLevelMin: (v) => set({ levelMin: v }),
  setLevelMax: (v) => set({ levelMax: v }),
  setBpmMin: (v) => set({ bpmMin: v }),
  setBpmMax: (v) => set({ bpmMax: v }),

  setCategory: (cat) => set(s => ({
    category: s.category === cat ? null : cat,
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
    search: '', levelMin: s.meta?.level_min, levelMax: s.meta?.level_max,
    bpmMin: s.meta?.bpm_min, bpmMax: s.meta?.bpm_max,
    category: 'sun', quick: 'all', artists: new Set(),
    flagNew: false, flagVariants: false, flagFavorite: false, flagMyPlayed: false,
  })),
  clearAllFiltersMobile: () => set(s => ({
    search: '', levelMin: s.meta?.level_min, levelMax: s.meta?.level_max,
    bpmMin: s.meta?.bpm_min, bpmMax: s.meta?.bpm_max,
    category: null, quick: 'all', artists: new Set(),
    flagNew: false, flagVariants: false, flagFavorite: false, flagMyPlayed: false,
  })),

  openModal: (song) => set({ modalSong: song, modalOpen: true }),
  closeModal: () => set({ modalOpen: false, modalSong: null }),
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
