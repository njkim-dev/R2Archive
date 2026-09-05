import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import { HelpButton } from './HelpTour'

const SEARCH_MODES = [
  { key: 'both',   label: '곡명 + 아티스트' },
  { key: 'name',   label: '곡명' },
  { key: 'artist', label: '아티스트' },
]

function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const update = () => setWidth(node.getBoundingClientRect().width)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect?.width
      if (nextWidth != null) setWidth(nextWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export default function TopBar({ filteredCount, totalCount, loading = false, error = null, showOriginalBpmToggle = false, showMyPerceivedToggle = false, myPerceivedStatus = 'idle', onRetryMyPerceived }) {
  const { search, setSearch, searchMode, setSearchMode, excludeSearch, setExcludeSearch, showOriginalBpm, setShowOriginalBpm, showMyPerceived, setShowMyPerceived, meta, sort, openLogin, user, logout, openOnboarding, openMyPage, modalOpen } = useStore()
  const inputRef = useRef(null)
  const [modeOpen, setModeOpen] = useState(false)
  const modeRef = useRef(null)
  const [topbarRef, topbarWidth] = useElementWidth()

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

  const currentMode = SEARCH_MODES.find(m => m.key === searchMode) ?? SEARCH_MODES[0]

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

  const sortLabels = {
    level: '난이도', name: '곡명', korea_name: '한국 곡명', artist: '아티스트', bpm: 'BPM', real_bpm: '원 BPM',
    combo: '콤보', time: '시간', play_count: '재생', userLevel: showMyPerceivedToggle && user && showMyPerceived ? '내 체감 난이도' : '유저 난이도',
    file_order: '최신곡순', favorite_count: '즐겨찾기',
  }
  const hideRecord = topbarWidth > 0 && topbarWidth < 1240
  const hideSort = topbarWidth > 0 && topbarWidth < 1120
  const hideHelp = topbarWidth > 0 && topbarWidth < 980
  const hideCount = topbarWidth > 0 && topbarWidth < 860
  const topbarClassName = [
    'topbar',
    'has-search-exclude',
    hideRecord && 'hide-record',
    hideSort && 'hide-sort',
    hideHelp && 'hide-help',
    hideCount && 'hide-count',
  ].filter(Boolean).join(' ')

  return (
    <div ref={topbarRef} className={topbarClassName}>
      <div className="search">
        <div className="search-field">
          <div className="search-mode" ref={modeRef}>
            <button
              type="button"
              className="search-mode-btn"
              onClick={() => setModeOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-controls="search-mode-menu"
            >
              <span className="search-mode-label">{currentMode.label}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            {modeOpen && (
              <div className="search-mode-menu" id="search-mode-menu" role="menu">
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
            className="search-input"
            type="text"
            placeholder="검색어 입력, 검색어가 여러 개면 쉼표 사용 가능"
            aria-label={`${currentMode.label} 검색`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="search-options-row">
          <label className={`search-exclude${search.trim() ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={excludeSearch}
              disabled={!search.trim()}
              onChange={e => setExcludeSearch(e.target.checked)}
            />
            <span>입력한 검색어만 제외하기</span>
          </label>
          {(showOriginalBpmToggle || showMyPerceivedToggle) && (
            <div className="search-display-options">
              {showOriginalBpmToggle && (
                <label className="search-original-bpm">
                  <input
                    type="checkbox"
                    checked={showOriginalBpm}
                    onChange={e => setShowOriginalBpm(e.target.checked)}
                  />
                  <span>음악 원 BPM 표시</span>
                </label>
              )}
              {showMyPerceivedToggle && (
                <label className={`search-my-perceived${user ? '' : ' disabled'}`} title={user ? undefined : '로그인 후 사용할 수 있습니다.'}>
                  <input
                    type="checkbox"
                    checked={!!user && showMyPerceived}
                    disabled={!user}
                    onChange={e => setShowMyPerceived(e.target.checked)}
                  />
                  <span>내 체감 난이도로 표시</span>
                </label>
              )}
            </div>
          )}
          {myPerceivedStatus === 'loading' && (
            <span className="search-personal-status" role="status">내 체감 난이도 불러오는 중…</span>
          )}
          {myPerceivedStatus === 'error' && (
            <span className="search-personal-status" role="alert">
              내 체감 난이도를 불러오지 못했습니다.
              <button type="button" onClick={onRetryMyPerceived}>재시도</button>
            </span>
          )}
        </div>
      </div>

      {!modalOpen && (
        <>
          <div className="topbar-meta">
            <HelpButton className="topbar-help-control" />
            <span className="count topbar-count-control">
              {loading
                ? <span role="status">불러오는 중…</span>
                : error
                  ? <span className="topbar-error">불러오기 실패</span>
                  : <><b>{filteredCount.toLocaleString()}</b>{' '}<span style={{ color: 'var(--fg-3)' }}>/ {(totalCount ?? meta?.total_count ?? 0).toLocaleString()} 곡</span></>
              }
            </span>
            {!loading && !error && (
              <>
                <span className="topbar-sort-control topbar-sort-divider" />
                <span className="topbar-sort-control">
                  정렬: <b className="mono" style={{ color: 'var(--fg)' }}>
                    {sort.key ? (sortLabels[sort.key] ?? sort.key) : '신곡 우선 · 최신곡순'} {sort.dir === 'asc' ? '↑' : '↓'}
                  </b>
                </span>
              </>
            )}
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
        </>
      )}
    </div>
  )
}
