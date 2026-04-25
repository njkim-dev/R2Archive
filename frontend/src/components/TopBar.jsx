import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import ScreenshotRegisterModal from './ScreenshotRegisterModal'

const SEARCH_MODES = [
  { key: 'both',   label: '곡명 + 아티스트' },
  { key: 'name',   label: '곡명' },
  { key: 'artist', label: '아티스트' },
]

export default function TopBar({ filteredCount }) {
  const { search, setSearch, searchMode, setSearchMode, meta, sort, openLogin, user, logout, openOnboarding } = useStore()
  const inputRef = useRef(null)
  const [modeOpen, setModeOpen] = useState(false)
  const modeRef = useRef(null)
  const [ssOpen, setSsOpen] = useState(false)

  useEffect(() => {
    const onClick = (e) => {
      if (modeRef.current && !modeRef.current.contains(e.target)) setModeOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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
    level: '난이도', name: '곡명', artist: '아티스트', bpm: 'BPM',
    combo: '콤보', time: '시간', play_count: '재생', userLevel: '유저 난이도',
    file_order: '최신곡순',
  }

  return (
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
        <span className="count">
          <b>{filteredCount.toLocaleString()}</b>
          {' '}<span style={{ color: 'var(--fg-3)' }}>/ {(meta?.total_count ?? 0).toLocaleString()} 곡</span>
        </span>
        <span style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />
        <span>
          정렬: <b className="mono" style={{ color: 'var(--fg)' }}>
            {sortLabels[sort.key] ?? sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
          </b>
        </span>
      </div>

      {user && (
        <button className="reg-btn" onClick={() => setSsOpen(true)} title="스크린샷으로 판정% 기록 등록">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          내 기록 등록
        </button>
      )}
      <ScreenshotRegisterModal open={ssOpen} onClose={() => setSsOpen(false)} />

      {user ? (
        <div className="user-chip">
          <button
            type="button"
            className="user-chip-open"
            onClick={openOnboarding}
            title="프로필 수정"
          >
            <div className="user-avatar">{((user.nickname || '?')[0] || '?').toUpperCase()}</div>
            <span className="user-name">{user.nickname || '...'}</span>
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
  )
}
