import { useMemo } from 'react'
import useStore from '../store/useStore'

const CHIPS = [
  { key: 'all',       label: '전체',       icon: '♩' },
  { key: 'star',      label: '별',         icon: '✦', range: '1.5–3.5', cat: true },
  { key: 'moon',      label: '달',         icon: '☾', range: '4–6.5',   cat: true },
  { key: 'sun',       label: '해',         icon: '☀', range: '7–12',    cat: true },
  { key: 'new',       label: '신곡',       icon: '◉' },
  { key: 'variant',   label: '변속곡' },
  { key: 'favorite',  label: '즐겨찾기',   icon: '★', needLogin: true },
  { key: 'my_played', label: '내 플레이',  icon: '♪', needLogin: true },
]

export default function MobileHeader({ totalFiltered }) {
  const {
    search, setSearch,
    category, setCategory,
    quick, setQuick,
    meta, bpmMin, bpmMax,
    openMobileSheet,
    sort, user,
    openLogin, logout, openOnboarding, openMyPage,
  } = useStore()

  const activeChip = useMemo(() => {
    if (quick === 'new') return 'new'
    if (quick === 'variants') return 'variant'
    if (quick === 'favorite') return 'favorite'
    if (quick === 'my_played') return 'my_played'
    if (category === 'star') return 'star'
    if (category === 'moon') return 'moon'
    if (category === 'sun') return 'sun'
    return 'all'
  }, [category, quick])

  const hasBadge = useMemo(() => {
    return bpmMin !== meta?.bpm_min || bpmMax !== meta?.bpm_max
  }, [bpmMin, bpmMax, meta])

  const handleChip = (chip) => {
    if (chip === activeChip) return
    if (chip === 'all') {
      if (category) setCategory(category)
      setQuick('all')
      return
    }
    if (chip === 'star' || chip === 'moon' || chip === 'sun') {
      setCategory(chip)   // 레벨 범위 자동 리셋 포함
      setQuick('all')     // 이전 quick 필터(new/fav 등) 해제
      return
    }
    // new / variant / favorite / my_played: 카테고리 해제 후 quick 설정
    if (category) setCategory(category)
    const quickMap = { new: 'new', variant: 'variants', favorite: 'favorite', my_played: 'my_played' }
    setQuick(quickMap[chip])
  }

  const sortLabel = useMemo(() => {
    const map = {
      level: sort.dir === 'asc' ? '난이도 ↑' : '난이도 ↓',
      bpm: 'BPM ↓',
      name: '곡명',
      artist: '아티스트',
    }
    return map[sort.key] ?? '기본'
  }, [sort])

  return (
    <header className="mob-top">
      <div className="mob-top-inner">
        <div className="mob-top-row">
          <div className="mob-app-title">알투<b>비트</b> <span className="mob-sub">아카이브</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {user ? (
              <>
                <button
                  type="button"
                  className="mob-icon-btn"
                  onClick={openMyPage}
                  title="마이페이지"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 8px' }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent, #ff6b9d)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {((user.nickname || '?')[0] || '?').toUpperCase()}
                  </div>
                </button>
                <button className="mob-icon-btn" onClick={logout} title="로그아웃">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </>
            ) : (
              <button className="mob-icon-btn" onClick={openLogin} title="로그인" aria-label="로그인" style={{ width: 'auto', padding: '0 10px', fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                로그인
              </button>
            )}
            <button className="mob-icon-btn" onClick={openMobileSheet} aria-label="필터">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              {hasBadge && <span className="mob-badge" />}
            </button>
          </div>
        </div>

        <label className={`mob-search${search ? ' has-val' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--fg-4)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            placeholder="곡명 · 아티스트 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button className="mob-search-clear" onClick={() => setSearch('')} aria-label="검색 지우기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </label>

        <div className="mob-chips">
          {CHIPS.filter(c => !c.needLogin || user).map(({ key, label, icon, range }) => (
            <button
              key={key}
              className={`mob-chip${activeChip === key ? ' on' : ''}`}
              onClick={() => handleChip(key)}
            >
              {icon && <span className="mob-chip-icon" style={key === 'new' ? { color: 'var(--new)' } : {}}>{icon}</span>}
              {label}
              {range && <span style={{ color: 'var(--fg-4)', fontSize: '10.5px' }}>{range}</span>}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
