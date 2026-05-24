import { useEffect, useMemo, useRef, useState } from 'react'
import { getPmangSongs } from '../api/client'
import { filterPmangSongs, sortPmangSongs } from '../utils/pmang'
import useStore from '../store/useStore'
import { useMobile } from '../hooks/useMobile'
import MobilePageNav from '../components/MobilePageNav'
import PmangSidebar from '../components/pmang/PmangSidebar'
import PmangFilterBar from '../components/pmang/PmangFilterBar'
import PmangSongsTable from '../components/pmang/PmangSongsTable'
import PmangSongModal from '../components/pmang/PmangSongModal'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'

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

export default function PmangSongsPage() {
  const isMobile = useMobile()
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
  const [category, setCategoryState] = useState('sun')
  const [quick, setQuick] = useState('all')  // 'all' | 'favorite' | 'no_music' | 'youtube_candidates'
  const [artists, setArtists] = useState(() => new Set())
  // 기본 정렬: game_index DESC — 최신 곡(높은 index)이 위로.
  const [sort, setSortState] = useState({ key: 'game_index', dir: 'desc' })

  const [modalSong, setModalSong] = useState(null)

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
        }
      })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (modeRef.current && !modeRef.current.contains(e.target)) setModeOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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
    if (quick === 'youtube_candidates' && !isAdmin) setQuick('all')
  }, [quick, isAdmin])

  // 카탈로그 해시 진입 — `#pmang-song=<id>`로 끝나면 해당 곡 모달을 연다.
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
      quick: quick === 'youtube_candidates' ? 'all' : quick,
      artists,
      favorites: pmangFavorites,
    })
    return {
      exact: sortPmangSongs(exact, sort),
      fuzzy: sortPmangSongs(fuzzy, sort),
    }
  }, [songs, pmangYoutubeCandidates, isAdmin, search, searchMode, levelMin, levelMax, category, quick, artists, pmangFavorites, sort])

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
  }, [search, category, quick, isAdmin, pmangYoutubeCandidates, songs, searchMode, levelBounds, artists, pmangFavorites, filtered.exact, filtered.fuzzy])

  // 컬럼 헤더 클릭: 이미 같은 키면 방향 토글, 다른 키면 초기 방향 부여.
  // 본 SongsTable의 setSort와 동일 — 숫자성 컬럼(game_index/level)은 'desc'로, 텍스트(name/artist)는 'asc'로 시작.
  const handleSort = (key) => {
    setSortState(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['name', 'artist'].includes(key) ? 'asc' : 'desc' }
    )
  }

  const sortLabels = {
    game_index: '#', name: '곡명', artist: '아티스트', level: '난이도',
  }

  const currentMode = SEARCH_MODES.find(m => m.key === searchMode) ?? SEARCH_MODES[0]

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <div className="mob-top">
          <div className="mob-top-inner">
            <div className="mob-top-row">
              <ServerSwitcher className="mob-server-switcher" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpButton />
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
                placeholder="곡명 또는 아티스트 검색"
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

            <div className="mob-chips">
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
                    onClick={() => {
                      if (c.key === 'all') {
                        if (category) setCategory(category) // 같은 키 클릭 → 토글 OFF (PC와 동일)
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
                  onClick={() => setQuick(quick === 'favorite' ? 'all' : 'favorite')}
                >★ 즐겨찾기</button>
              )}
              {isAdmin && (
                <button
                  className={`mob-chip${quick === 'youtube_candidates' ? ' on' : ''}`}
                  onClick={() => setQuick(quick === 'youtube_candidates' ? 'all' : 'youtube_candidates')}
                >후보곡</button>
              )}
              {isAdmin && (
                <button
                  className={`mob-chip${quick === 'no_music' ? ' on' : ''}`}
                  onClick={() => setQuick(quick === 'no_music' ? 'all' : 'no_music')}
                >음악 없음</button>
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
                onRowClick={setModalSong}
                categorySuggestion={categorySuggestion}
                isMobile
              />
        }

        <PmangSongModal song={modalSong} onClose={() => setModalSong(null)} />
      </div>
    )
  }

  return (
    <div className="app" data-cat={category || undefined}>
      <PmangSidebar
        songs={songs}
        filtered={filtered.exact}
        category={category} setCategory={setCategory}
        quick={quick} setQuick={setQuick}
        levelMin={levelMin} levelMax={levelMax}
        setLevelMin={setLevelMin} setLevelMax={setLevelMax}
        levelBounds={levelBounds}
        artists={artists} toggleArtist={toggleArtist} clearArtists={clearArtists}
        topArtists={topArtists}
        favorites={pmangFavorites}
        pmangYoutubeCandidates={pmangYoutubeCandidates}
      />
      <main className="main">
        <div className="topbar">
          <div className="search">
            <div className="search-mode" ref={modeRef}>
              <button
                type="button"
                className="search-mode-btn"
                onClick={() => setModeOpen(v => !v)}
              >
                <span className="search-mode-label">{currentMode.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              {modeOpen && (
                <div className="search-mode-menu">
                  {SEARCH_MODES.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      className={`search-mode-item${m.key === searchMode ? ' active' : ''}`}
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
              placeholder={`${currentMode.label}(으)로 검색…`}
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
                onRowClick={setModalSong}
                categorySuggestion={categorySuggestion}
              />
        }
      </main>

      <PmangSongModal song={modalSong} onClose={() => setModalSong(null)} />
    </div>
  )
}
