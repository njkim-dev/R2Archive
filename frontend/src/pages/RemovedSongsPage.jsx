import { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../store/useStore'
import { getRemovedSongs } from '../api/client'
import { filterSongs, sortSongs } from '../utils/helpers'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import FilterBar from '../components/FilterBar'
import SongsTable from '../components/SongsTable'
import MobileHeader from '../components/MobileHeader'
import FilterSheet from '../components/FilterSheet'
import { useMobile } from '../hooks/useMobile'
import { isXyxMode } from '../utils/serverMode'

function distinctSongCount(items) {
  const keys = new Set()
  for (const song of items) {
    keys.add(`${(song.name || '').trim().toLowerCase()}::${(song.artist || '').trim().toLowerCase()}`)
  }
  return keys.size
}

export default function RemovedSongsPage() {
  const isMobile = useMobile(isXyxMode() ? 1100 : 768)
  const {
    authLoaded, user, isAdmin, openLogin,
    search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
    category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
    artists, sort, favorites, played, playedAll, meta, setCategory,
    openModal, modalOpen,
  } = useStore()
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const openedHashRef = useRef(null)

  useEffect(() => {
    if (!authLoaded) return
    if (!isAdmin) {
      setLoading(false)
      setSongs([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getRemovedSongs()
      .then(data => { if (!cancelled) setSongs(data || []) })
      .catch(err => { if (!cancelled) setError(err?.response?.data?.detail || err?.message || '불러오기 실패') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authLoaded, isAdmin])

  useEffect(() => {
    if (loading || !isAdmin || !songs.length) return
    const hash = location.hash
    if (openedHashRef.current === hash) return
    const match = hash.match(/^#song=(\d+)$/)
    if (!match) return
    const song = songs.find(item => item.id === parseInt(match[1], 10))
    if (!song) return
    openedHashRef.current = hash
    openModal(song)
  }, [loading, isAdmin, songs, openModal])

  const filtered = useMemo(() => {
    const playedForFilter = category ? playedAll : played
    const { exact, fuzzy } = filterSongs(songs, {
      search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
      category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
      artists, favorites, played: playedForFilter,
    })
    return { exact: sortSongs(exact, sort), fuzzy: sortSongs(fuzzy, sort) }
  }, [songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, sort, favorites, played, playedAll])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length
  const categorySuggestion = useMemo(() => {
    if (!search.trim() || !category) return null
    const result = filterSongs(songs, {
      search,
      searchMode,
      levelMin: meta?.level_min ?? levelMin,
      levelMax: meta?.level_max ?? levelMax,
      bpmMin,
      bpmMax,
      category: null,
      quick,
      flagNew,
      flagVariants,
      flagFavorite,
      flagMyPlayed,
      artists,
      favorites,
      played,
    })
    const currentDistinct = distinctSongCount([...filtered.exact, ...filtered.fuzzy])
    const expandedDistinct = distinctSongCount([...result.exact, ...result.fuzzy])
    if (expandedDistinct <= currentDistinct) return null
    return { onApply: () => setCategory(category) }
  }, [search, category, meta, levelMin, levelMax, bpmMin, bpmMax, songs, searchMode, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, favorites, played, filtered.exact, filtered.fuzzy, setCategory])

  const stateMessage = !authLoaded || loading
    ? '불러오는 중...'
    : !user
      ? '로그인이 필요합니다.'
      : !isAdmin
        ? '관리자 권한이 필요합니다.'
        : error
          ? `불러오기 실패: ${error}`
          : null

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <MobileHeader totalFiltered={totalFiltered} />
        {stateMessage ? (
          <div className="grp-empty" style={{ minHeight: 260 }}>
            <div className="grp-empty-icon">♪</div>
            <h3>{stateMessage}</h3>
            {!user && <button className="gd-btn primary" onClick={openLogin}>로그인</button>}
          </div>
        ) : (
          <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} isMobile categorySuggestion={categorySuggestion} />
        )}
        <FilterSheet />
      </div>
    )
  }

  const catalogPanelOpen = modalOpen && !isMobile

  return (
    <div className={`app${catalogPanelOpen ? ' catalog-panel-open' : ''}`} data-cat={category || undefined}>
      <Sidebar songs={songs} filtered={filtered.exact} />
      <main className="main">
        <TopBar filteredCount={totalFiltered} totalCount={songs.length} />
        <FilterBar />
        {stateMessage ? (
          <div className="grp-empty pcat-empty-list">
            <div className="grp-empty-icon">♪</div>
            <h3>{stateMessage}</h3>
            {!user && <button className="gd-btn primary" onClick={openLogin}>로그인</button>}
          </div>
        ) : (
          <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} categorySuggestion={categorySuggestion} compact={catalogPanelOpen} />
        )}
      </main>
    </div>
  )
}
