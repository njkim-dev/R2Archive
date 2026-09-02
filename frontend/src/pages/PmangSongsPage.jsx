import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPmangSongs } from '../api/client'
import { filterPmangSongs, sortPmangSongs } from '../utils/pmang'
import useStore from '../store/useStore'
import { useMobile } from '../hooks/useMobile'
import MobilePageNav from '../components/MobilePageNav'
import PmangSidebar from '../components/pmang/PmangSidebar'
import PmangFilterBar from '../components/pmang/PmangFilterBar'
import PmangSongsTable from '../components/pmang/PmangSongsTable'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'
import { clearCatalogHash, pmangSongCatalogHash, replaceCatalogHash } from '../utils/catalogUrl'

const PmangSongModal = lazy(() => import('../components/pmang/PmangSongModal'))

const TOP_ARTIST_LIMIT = 20

function distinctSongCount(items) {
  const keys = new Set()
  for (const song of items) {
    keys.add(`${(song.name || '').trim().toLowerCase()}::${(song.artist || '').trim().toLowerCase()}`)
  }
  return keys.size
}

const SEARCH_MODES = [
  { key: 'both',   label: '곡명 + 아티스트' },
  { key: 'name',   label: '곡명' },
  { key: 'artist', label: '아티스트' },
]

const PMANG_SORT_ROWS = [
  { key: 'game_index', label: '날짜', opts: [{ dir: 'desc', label: '최신곡순' }, { dir: 'asc', label: '구곡순' }] },
  { key: 'level', label: '난이도', opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'bpm', label: 'BPM', opts: [{ dir: 'desc', label: '빠른 순' }, { dir: 'asc', label: '느린 순' }] },
  { key: 'combo', label: '콤보', opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'favorite_count', label: '즐겨찾기', opts: [{ dir: 'desc', label: '많은 순' }, { dir: 'asc', label: '적은 순' }] },
  { key: 'name', label: '곡명', opts: [{ dir: 'asc', label: '오름차순' }, { dir: 'desc', label: '내림차순' }] },
  { key: 'artist', label: '아티스트', opts: [{ dir: 'asc', label: '오름차순' }, { dir: 'desc', label: '내림차순' }] },
]

function PmangSongModalHost({ song, onClose }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (song) setLoaded(true)
  }, [song])

  if (!loaded) return null
  return (
    <Suspense fallback={null}>
      <PmangSongModal song={song} onClose={onClose} />
    </Suspense>
  )
}

function PmangMobileFilterSheet({
  open,
  onClose,
  songs,
  search,
  searchMode,
  levelMin,
  levelMax,
  bpmMin,
  bpmMax,
  setBpmMin,
  setBpmMax,
  bpmBounds,
  category,
  quick,
  artists,
  favorites,
  sort,
  setSortState,
}) {
  const [sBpmMin, setSBpmMin] = useState(bpmMin)
  const [sBpmMax, setSBpmMax] = useState(bpmMax)
  const sheetRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (open) {
      setSBpmMin(bpmMin)
      setSBpmMax(bpmMax)
    }
  }, [open, bpmMin, bpmMax])

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const backgroundElements = [...(sheetRef.current?.parentElement?.children || [])]
      .filter(element => !element.classList.contains('mob-backdrop') && !element.classList.contains('mob-sheet'))
      .map(element => ({ element, ariaHidden: element.getAttribute('aria-hidden'), inert: element.inert }))
    backgroundElements.forEach(({ element }) => {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    })
    const frame = requestAnimationFrame(() => {
      sheetRef.current?.querySelector('button:not([disabled]), input:not([disabled])')?.focus()
    })
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusable = [...sheetRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')]
        .filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      backgroundElements.forEach(({ element, ariaHidden, inert }) => {
        element.inert = inert
        if (ariaHidden == null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      requestAnimationFrame(() => previousFocusRef.current?.focus?.())
    }
  }, [open, onClose])

  const previewCount = useMemo(() => {
    const { exact, fuzzy } = filterPmangSongs(songs, {
      search,
      searchMode,
      levelMin,
      levelMax,
      bpmMin: sBpmMin,
      bpmMax: sBpmMax,
      category,
      quick,
      artists,
      favorites,
    })
    return exact.length + fuzzy.length
  }, [songs, search, searchMode, levelMin, levelMax, sBpmMin, sBpmMax, category, quick, artists, favorites])

  const applyBpm = () => {
    setBpmMin(sBpmMin)
    setBpmMax(sBpmMax)
    onClose()
  }

  if (!open) return null

  return (
    <>
      <div className="mob-backdrop open" onClick={onClose} aria-hidden="true" />
      <section ref={sheetRef} className="mob-sheet open" role="dialog" aria-modal="true" aria-labelledby="pmang-mobile-filter-title" tabIndex={-1}>
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-head">
          <h2 className="mob-sheet-title" id="pmang-mobile-filter-title">필터 / 정렬</h2>
          <div className="mob-sheet-actions">
            <button className="mob-sheet-reset" onClick={() => { setSBpmMin(bpmBounds[0]); setSBpmMax(bpmBounds[1]) }}>BPM 초기화</button>
            <button className="mob-sheet-close" onClick={onClose} aria-label="필터 닫기">×</button>
          </div>
        </div>

        <div className="mob-sheet-group">
          <div className="mob-sheet-label">
            BPM
            <span className="mob-sheet-val">{sBpmMin} — {sBpmMax}</span>
          </div>
          <div className="mob-range-row">
            <input
              className="mob-range-num mono"
              type="number"
              min={bpmBounds[0]}
              max={bpmBounds[1]}
              step="1"
              aria-label="BPM 최솟값"
              value={sBpmMin ?? bpmBounds[0]}
              onChange={e => setSBpmMin(+e.target.value)}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number"
              min={bpmBounds[0]}
              max={bpmBounds[1]}
              step="1"
              aria-label="BPM 최댓값"
              value={sBpmMax ?? bpmBounds[1]}
              onChange={e => setSBpmMax(+e.target.value)}
            />
          </div>
        </div>

        <button className="mob-sheet-apply" onClick={applyBpm}>
          적용 ({previewCount.toLocaleString()}곡)
        </button>

        <div className="mob-sheet-group" style={{ marginTop: 20 }}>
          <div className="mob-sheet-label">정렬</div>
          <div className="mob-sort-rows">
            {PMANG_SORT_ROWS.map(row => (
              <div className="mob-sort-row" key={row.key}>
                <span className="mob-sort-row-label">{row.label}</span>
                <div className="mob-sort-toggle">
                  {row.opts.map(opt => (
                    <button
                      key={opt.dir}
                      className={`mob-sort-tog${sort.key === row.key && sort.dir === opt.dir ? ' on' : ''}`}
                      aria-pressed={sort.key === row.key && sort.dir === opt.dir}
                      onClick={() => { setSortState({ key: row.key, dir: opt.dir }); onClose() }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

export default function PmangSongsPage() {
  const isMobile = useMobile()
  const modalOpen = useStore(s => s.modalOpen)
  const closeModal = useStore(s => s.closeModal)
  const pmangFavorites = useStore(s => s.pmangFavorites)
  const pmangYoutubeCandidates = useStore(s => s.pmangYoutubeCandidates)
  const { user, isAdmin, openLogin, openMyPage, openOnboarding, logout } = useStore()

  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState('both')
  const [modeOpen, setModeOpen] = useState(false)
  const modeRef = useRef(null)
  const inputRef = useRef(null)

  // 피망 곡의 level은 실제 표기의 2배. 표시·필터·정렬은 화면값(level/2)을 기준으로 한다.
  const [levelMin, setLevelMin] = useState(1)
  const [levelMax, setLevelMax] = useState(10)
  const [bpmMin, setBpmMin] = useState(null)
  const [bpmMax, setBpmMax] = useState(null)
  const [category, setCategoryState] = useState('sun')
  const [quick, setQuick] = useState('all')
  const [artists, setArtists] = useState(() => new Set())
  const [sort, setSortState] = useState({ key: 'game_index', dir: 'desc' })
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  const [modalSong, setModalSong] = useState(null)
  const openPmangCatalog = useCallback((song) => {
    if (song?.id) replaceCatalogHash(pmangSongCatalogHash(song.id), '/pmang-songs')
    setModalSong(song)
  }, [])
  const closePmangCatalog = useCallback(() => {
    clearCatalogHash(/^#pmang-song=\d+$/)
    setModalSong(null)
  }, [])

  useEffect(() => {
    if (modalOpen) closeModal()
  }, [modalOpen, closeModal])

  useEffect(() => {
    getPmangSongs()
      .then(data => {
        setSongs(data)
        if (data.length > 0) {
          const halves = data.map(s => s.level / 2)
          const minLv = Math.min(...halves)
          const maxLv = Math.max(...halves)
          setLevelMin(Math.floor(minLv * 2) / 2)
          setLevelMax(Math.ceil(maxLv * 2) / 2)
          const bpms = data.flatMap(s => [s.bpm, s.bpm_max ?? s.bpm]).filter(v => Number.isFinite(Number(v)))
          if (bpms.length) {
            setBpmMin(Math.floor(Math.min(...bpms)))
            setBpmMax(Math.ceil(Math.max(...bpms)))
          }
        }
      })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (modeRef.current && !modeRef.current.contains(e.target)) setModeOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setModeOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if ((quick === 'youtube_candidates' || quick === 'popular') && !isAdmin) setQuick('all')
  }, [quick, isAdmin])

  // 피망곡 상세 링크로 진입하면 해당 카탈로그를 연다.
  useEffect(() => {
    if (!songs.length) return
    const openFromHash = () => {
      const m = location.hash.match(/^#pmang-song=(\d+)$/)
      if (!m) return
      const id = parseInt(m[1], 10)
      const song = songs.find(x => x.id === id)
      if (song) setModalSong(song)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [songs])

  const levelBounds = useMemo(() => {
    if (!songs.length) return [1, 10]
    let lo = Infinity, hi = -Infinity
    for (const s of songs) {
      const v = s.level / 2
      if (v < lo) lo = v; if (v > hi) hi = v
    }
    return [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2]
  }, [songs])

  const bpmBounds = useMemo(() => {
    const bpms = songs.flatMap(s => [s.bpm, s.bpm_max ?? s.bpm]).filter(v => Number.isFinite(Number(v)))
    if (!bpms.length) return [0, 300]
    return [Math.floor(Math.min(...bpms)), Math.ceil(Math.max(...bpms))]
  }, [songs])

  const topArtists = useMemo(() => {
    const counts = new Map()
    for (const s of songs) {
      if (!s.artist) continue
      counts.set(s.artist, (counts.get(s.artist) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ARTIST_LIMIT)
      .map(([a]) => a)
  }, [songs])

  const toggleArtist = (a) => {
    setArtists(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a); else next.add(a)
      return next
    })
  }
  const clearArtists = () => setArtists(new Set())

  const clearAllFilters = () => {
    setSearch('')
    setSearchMode('both')
    setQuick('all')
    setArtists(new Set())
    setCategoryState('sun')
    setLevelMin(levelBounds[0])
    setLevelMax(levelBounds[1])
    setBpmMin(bpmBounds[0])
    setBpmMax(bpmBounds[1])
  }

  const setCategory = (cat) => {
    setCategoryState(prev => {
      const next = prev === cat ? null : cat
      setLevelMin(levelBounds[0])
      setLevelMax(levelBounds[1])
      return next
    })
  }

  const filtered = useMemo(() => {
    const candidateMode = quick === 'youtube_candidates' && isAdmin
    const sourceSongs = candidateMode ? pmangYoutubeCandidates : songs
    const { exact, fuzzy } = filterPmangSongs(sourceSongs, {
      search, searchMode, levelMin, levelMax, category,
      bpmMin, bpmMax,
      quick: quick === 'youtube_candidates' ? 'all' : quick,
      artists,
      favorites: pmangFavorites,
    })
    const effectiveSort = quick === 'popular' ? { key: 'favorite_count', dir: 'desc' } : sort
    return {
      exact: sortPmangSongs(exact, effectiveSort),
      fuzzy: sortPmangSongs(fuzzy, effectiveSort),
    }
  }, [songs, pmangYoutubeCandidates, isAdmin, search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, pmangFavorites, sort])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length
  const categorySuggestion = useMemo(() => {
    if (!search.trim() || !category) return null
    const candidateMode = quick === 'youtube_candidates' && isAdmin
    const sourceSongs = candidateMode ? pmangYoutubeCandidates : songs
    const result = filterPmangSongs(sourceSongs, {
      search,
      searchMode,
      levelMin: levelBounds[0],
      levelMax: levelBounds[1],
      bpmMin,
      bpmMax,
      category: null,
      quick: quick === 'youtube_candidates' ? 'all' : quick,
      artists,
      favorites: pmangFavorites,
    })
    const currentDistinct = distinctSongCount([...filtered.exact, ...filtered.fuzzy])
    const expandedDistinct = distinctSongCount([...result.exact, ...result.fuzzy])
    if (expandedDistinct <= currentDistinct) return null
    return {
      onApply: () => setCategory(category),
    }
  }, [search, category, quick, isAdmin, pmangYoutubeCandidates, songs, searchMode, levelBounds, bpmMin, bpmMax, artists, pmangFavorites, filtered.exact, filtered.fuzzy])

  const handleSort = (key) => {
    setSortState(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['name', 'artist'].includes(key) ? 'asc' : 'desc' }
    )
  }

  const sortLabels = {
    game_index: '#', name: '곡명', artist: '아티스트', level: '난이도',
    bpm: 'BPM', combo: '콤보', favorite_count: '즐겨찾기',
  }

  const currentMode = SEARCH_MODES.find(m => m.key === searchMode) ?? SEARCH_MODES[0]
  const hasBpmFilter = bpmMin !== bpmBounds[0] || bpmMax !== bpmBounds[1]

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <div className="mob-top">
          <h1 className="sr-only">R2Music Archive</h1>
          <div className="mob-top-inner">
            <div className="mob-top-row">
              <ServerSwitcher className="mob-server-switcher" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpButton />
                <button className="mob-icon-btn" onClick={() => setMobileSheetOpen(true)} aria-label="필터" aria-haspopup="dialog" aria-expanded={mobileSheetOpen}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
                  </svg>
                  {hasBpmFilter && <span className="mob-badge" />}
                </button>
                {user ? (
                  <button className="mob-icon-btn" onClick={openMyPage} title="마이페이지" aria-label="마이페이지">
                    <div className="user-avatar" style={{ width: 24, height: 24 }}>
                      {((user.nickname || '?')[0] || '?').toUpperCase()}
                    </div>
                  </button>
                ) : (
                  <button className="mob-icon-btn" onClick={openLogin} title="로그인" aria-label="로그인">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <MobilePageNav />

            <div className="mob-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-4)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                type="text"
                placeholder="검색어 입력, 검색어가 여러 개면 쉼표 사용 가능"
                aria-label="과거 피망곡 곡명과 아티스트 검색"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="mob-search-clear" onClick={() => setSearch('')} aria-label="검색어 지우기">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="mob-chips" role="group" aria-label="곡 필터">
              {[
                { key: 'all',  label: '전체' },
                { key: 'star', label: '별' },
                { key: 'moon', label: '달' },
                { key: 'sun',  label: '해' },
              ].map(c => {
                const isOn = c.key === 'all' ? !category : category === c.key
                return (
                  <button
                    key={c.key}
                    className={`mob-chip${isOn ? ' on' : ''}`}
                    aria-pressed={isOn}
                    onClick={() => {
                      if (c.key === 'all') {
                        if (category) setCategory(category)
                      } else if (category !== c.key) {
                        setCategory(c.key)
                      }
                    }}
                  >{c.label}</button>
                )
              })}
              {user && (
                <button
                  className={`mob-chip${quick === 'favorite' ? ' on' : ''}`}
                  aria-pressed={quick === 'favorite'}
                  onClick={() => setQuick(quick === 'favorite' ? 'all' : 'favorite')}
                >★ 즐겨찾기</button>
              )}
              {isAdmin && (
                <button
                  className={`mob-chip${quick === 'youtube_candidates' ? ' on' : ''}`}
                  aria-pressed={quick === 'youtube_candidates'}
                  onClick={() => setQuick(quick === 'youtube_candidates' ? 'all' : 'youtube_candidates')}
                >후보곡</button>
              )}
              {isAdmin && (
                <button
                  className={`mob-chip${quick === 'no_music' ? ' on' : ''}`}
                  aria-pressed={quick === 'no_music'}
                  onClick={() => setQuick(quick === 'no_music' ? 'all' : 'no_music')}
                >음악 없음</button>
              )}
              {isAdmin && (
                <button
                  className={`mob-chip${quick === 'popular' ? ' on' : ''}`}
                  aria-pressed={quick === 'popular'}
                  onClick={() => setQuick(quick === 'popular' ? 'all' : 'popular')}
                >인기순</button>
              )}
            </div>
          </div>
        </div>

        {error
          ? <div style={{ padding: 24, color: 'var(--danger, #c33)' }}>불러오기 실패: {error}</div>
          : loading
            ? <div style={{ padding: 24, color: 'var(--fg-3)' }}>불러오는 중…</div>
            : <PmangSongsTable
                exact={filtered.exact}
                fuzzy={filtered.fuzzy}
                search={search}
                sort={sort}
                onSort={handleSort}
                onRowClick={openPmangCatalog}
                categorySuggestion={categorySuggestion}
                activeSongId={modalSong?.id ?? null}
                isMobile
              />
        }

        <PmangSongModalHost song={modalSong} onClose={closePmangCatalog} />
        <PmangMobileFilterSheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
          songs={quick === 'youtube_candidates' && isAdmin ? pmangYoutubeCandidates : songs}
          search={search}
          searchMode={searchMode}
          levelMin={levelMin}
          levelMax={levelMax}
          bpmMin={bpmMin}
          bpmMax={bpmMax}
          setBpmMin={setBpmMin}
          setBpmMax={setBpmMax}
          bpmBounds={bpmBounds}
          category={category}
          quick={quick === 'youtube_candidates' ? 'all' : quick}
          artists={artists}
          favorites={pmangFavorites}
          sort={sort}
          setSortState={setSortState}
        />
      </div>
    )
  }

  return (
    <div className={`app${modalSong ? ' catalog-panel-open' : ''}`} data-cat={category || undefined}>
      <PmangSidebar
        songs={songs}
        filtered={filtered.exact}
        category={category} setCategory={setCategory}
        quick={quick} setQuick={setQuick}
        levelMin={levelMin} levelMax={levelMax}
        setLevelMin={setLevelMin} setLevelMax={setLevelMax}
        levelBounds={levelBounds}
        bpmMin={bpmMin} bpmMax={bpmMax}
        setBpmMin={setBpmMin} setBpmMax={setBpmMax}
        bpmBounds={bpmBounds}
        artists={artists} toggleArtist={toggleArtist} clearArtists={clearArtists}
        topArtists={topArtists}
        favorites={pmangFavorites}
        pmangYoutubeCandidates={pmangYoutubeCandidates}
        onNavigate={closePmangCatalog}
      />
      <main className="main">
        <div className="topbar">
          <div className="search">
            <div className="search-mode" ref={modeRef}>
              <button
                type="button"
                className="search-mode-btn"
                onClick={() => setModeOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={modeOpen}
                aria-controls="pmang-search-mode-menu"
              >
                <span className="search-mode-label">{currentMode.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              {modeOpen && (
                <div className="search-mode-menu" id="pmang-search-mode-menu" role="menu">
                  {SEARCH_MODES.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      className={`search-mode-item${m.key === searchMode ? ' active' : ''}`}
                      role="menuitemradio"
                      aria-checked={m.key === searchMode}
                      onClick={() => { setSearchMode(m.key); setModeOpen(false); inputRef.current?.focus() }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="검색어 입력, 검색어가 여러 개면 쉼표 사용 가능"
              aria-label={`${currentMode.label} 검색`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="topbar-meta">
            <HelpButton />
            <span className="count">
              <b>{totalFiltered.toLocaleString()}</b>
              {' '}<span style={{ color: 'var(--fg-3)' }}>/ {songs.length.toLocaleString()} 곡</span>
            </span>
            <span style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />
            <span>
              정렬: <b className="mono" style={{ color: 'var(--fg)' }}>
                {sortLabels[sort.key] ?? sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
              </b>
            </span>
          </div>

          {user ? (
            <div className="user-chip">
              <button
                type="button"
                className="user-chip-open"
                onClick={openMyPage}
                title="마이페이지"
              >
                <div className="user-avatar">{((user.nickname || '?')[0] || '?').toUpperCase()}</div>
                <span className="user-name">{user.nickname || '...'}</span>
              </button>
              <button className="user-logout" onClick={openOnboarding} title="프로필 수정" style={{ marginRight: 2 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              <button className="user-logout" onClick={logout} title="로그아웃">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          ) : (
            <button className="login-btn" onClick={openLogin}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              로그인
            </button>
          )}
        </div>

        <PmangFilterBar
          search={search}
          setSearch={setSearch}
          levelMin={levelMin}
          levelMax={levelMax}
          setLevelMin={setLevelMin}
          setLevelMax={setLevelMax}
          levelBounds={levelBounds}
          bpmMin={bpmMin}
          bpmMax={bpmMax}
          setBpmMin={setBpmMin}
          setBpmMax={setBpmMax}
          bpmBounds={bpmBounds}
          category={category}
          setCategory={setCategory}
          quick={quick}
          setQuick={setQuick}
          artists={artists}
          toggleArtist={toggleArtist}
          clearAllFilters={clearAllFilters}
        />

        {error
          ? <div style={{ padding: 24, color: 'var(--danger, #c33)' }}>불러오기 실패: {error}</div>
          : loading
            ? <div style={{ padding: 24, color: 'var(--fg-3)' }}>불러오는 중…</div>
            : <PmangSongsTable
                exact={filtered.exact}
                fuzzy={filtered.fuzzy}
                search={search}
                sort={sort}
                onSort={handleSort}
                onRowClick={openPmangCatalog}
                categorySuggestion={categorySuggestion}
                compact={!!modalSong}
                activeSongId={modalSong?.id ?? null}
              />
        }
      </main>

      <PmangSongModalHost song={modalSong} onClose={closePmangCatalog} />
    </div>
  )
}
