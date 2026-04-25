import { create } from 'zustand'
import { getAuthMe, logoutApi, getMyFlags, addFavorite, removeFavorite } from '../api/client'

const useStore = create((set, get) => ({
  // user: { id, nickname, default_visibility, onboarded, provider } | null
  user: null,
  authLoaded: false,
  refreshUser: async () => {
    try {
      const { user } = await getAuthMe()
      if (user?.provider) {
        try { localStorage.setItem('r2b_last_provider', user.provider) } catch {}
      }
      set({ user: user || null, authLoaded: true })
      if (user) get().refreshFlags()
      else set({ favorites: new Set(), played: new Set() })
    } catch {
      set({ user: null, authLoaded: true, favorites: new Set(), played: new Set() })
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    try { await logoutApi() } catch {}
    set({ user: null, favorites: new Set(), played: new Set() })
  },

  favorites: new Set(),   // Set<song_id>
  played: new Set(),
  refreshFlags: async () => {
    try {
      const data = await getMyFlags()
      set({
        favorites: new Set(data.favorites || []),
        played: new Set(data.played || []),
      })
    } catch {
      set({ favorites: new Set(), played: new Set() })
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
  markPlayed: (songId) => set(s => {
    if (!s.user) return {}
    if (s.played.has(songId)) return {}
    const next = new Set(s.played); next.add(songId)
    return { played: next }
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
  quick: 'all',         // all | new | played | variants
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
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  setSearch: (search) => set({ search }),
  setSearchMode: (searchMode) => set({ searchMode }),
  setLevelMin: (v) => set({ levelMin: v, category: null }),
  setLevelMax: (v) => set({ levelMax: v, category: null }),
  setBpmMin: (v) => set({ bpmMin: v }),
  setBpmMax: (v) => set({ bpmMax: v }),

  setCategory: (cat) => set(s => ({
    category: s.category === cat ? null : cat,
    levelMin: s.meta?.level_min,
    levelMax: s.meta?.level_max,
  })),

  setQuick: (quick) => set({ quick }),

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
  })),
  clearAllFiltersMobile: () => set(s => ({
    search: '', levelMin: s.meta?.level_min, levelMax: s.meta?.level_max,
    bpmMin: s.meta?.bpm_min, bpmMax: s.meta?.bpm_max,
    category: null, quick: 'all', artists: new Set(),
  })),

  openModal: (song) => set({ modalSong: song, modalOpen: true }),
  closeModal: () => set({ modalOpen: false, modalSong: null }),
  updateModalSong: (song) => set({ modalSong: song }),

  openFeedback: (song) => set({ feedbackSong: song, feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false, feedbackSong: null }),

  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
}))

export default useStore
