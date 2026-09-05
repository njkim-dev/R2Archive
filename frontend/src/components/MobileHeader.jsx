import { useMemo } from 'react'
import useStore from '../store/useStore'
import MobilePageNav from './MobilePageNav'
import { HelpButton } from './HelpTour'
import ServerSwitcher from './ServerSwitcher'
import { isXyxMode } from '../utils/serverMode'
import { detailedFilterCount } from '../utils/catalogFilters'

// 카테고리 별과 즐겨찾기 기호를 구분한다.
const StarIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1 9.5l7.1-.6L12 2z"/>
  </svg>
)

const CHIPS = [
  { key: 'all',       label: '전체',       icon: '♩' },
  { key: 'star',      label: '별',         icon: StarIcon, range: '1.5–3.5', cat: true },
  { key: 'moon',      label: '달',         icon: '☾', range: '4–6.5',   cat: true },
  { key: 'sun',       label: '해',         icon: '☀', range: '7–12',    cat: true },
  { key: 'new',       label: '신곡',       icon: '◉', flag: true },
  { key: 'variant',   label: '변속곡',                 flag: true },
  { key: 'popular',   label: '인기순',     icon: '★', flag: true, adminOnly: true },
  { key: 'favorite',  label: '즐겨찾기',   icon: '★', flag: true, needLogin: true },
  { key: 'my_played', label: '내 플레이',  icon: '♪', flag: true, needLogin: true },
  { key: 'played', label: '전체 유저 플레이 곡', flag: true, krOnly: true },
  { key: 'no_music', label: '음악 없음', flag: true, adminOnly: true },
]

export default function MobileHeader({ totalFiltered }) {
  const {
    search, setSearch,
    category, setCategory,
    quick, setQuick,
    meta, bpmMin, bpmMax, levelMin, levelMax, artists, aiMode, listenOnly,
    mobileSheetOpen, openMobileSheet,
    sort, user, isAdmin,
    openLogin, logout, openOnboarding, openMyPage,
  } = useStore()

  const activeChip = useMemo(() => {
    if (category === 'star') return 'star'
    if (category === 'moon') return 'moon'
    if (category === 'sun') return 'sun'
    return 'all'
  }, [category])

  const hasBadge = useMemo(() => {
    return detailedFilterCount({ category, quick, levelMin, levelMax, bpmMin, bpmMax, artists, aiMode, listenOnly }, meta) > 0
  }, [category, quick, levelMin, levelMax, bpmMin, bpmMax, artists, aiMode, listenOnly, meta])

  const handleChip = (chip) => {
    if (CHIPS.some(item => item.key === chip && item.flag)) {
      const key = chip === 'variant' ? 'variants' : chip
      return setQuick(quick === key ? 'all' : key)
    }
    if (chip === 'all') {
      if (category) setCategory(category)
      setQuick('all')
      return
    }
    if (chip === 'star' || chip === 'moon' || chip === 'sun') {
      setCategory(chip)
      return
    }
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
      <h1 className="sr-only">R2Music Archive</h1>
      <div className="mob-top-inner">
        <div className="mob-top-row">
          <div className="mob-brand-tablet" aria-hidden="true">
            <div className="brand-mark">R2</div>
            <div>
              <div className="brand-title">R2Music Archive</div>
              <div className="brand-sub">{isXyxMode() ? 'XYX Catalog' : 'Music Catalog'}</div>
            </div>
          </div>
          <ServerSwitcher className="mob-server-switcher" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HelpButton />
            {user ? (
              <>
                <button
                  type="button"
                  className="mob-icon-btn"
                  onClick={openMyPage}
                  title="마이페이지"
                  aria-label="마이페이지"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 8px' }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent, #ff6b9d)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {((user.nickname || '?')[0] || '?').toUpperCase()}
                  </div>
                </button>
                <button className="mob-icon-btn" onClick={logout} title="로그아웃" aria-label="로그아웃">
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
            <button className="mob-icon-btn" onClick={openMobileSheet} aria-label="상세 필터" title="상세 필터" aria-haspopup="dialog" aria-expanded={mobileSheetOpen}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              {hasBadge && <span className="mob-badge" />}
            </button>
          </div>
        </div>

        <MobilePageNav />

        <label className={`mob-search${search ? ' has-val' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--fg-4)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            placeholder="검색어 입력, 검색어가 여러 개면 쉼표 사용 가능"
            aria-label="곡명과 아티스트 검색"
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

        <div className="mob-chips" role="group" aria-label="곡 필터">
          {CHIPS.filter(c => (!c.needLogin || user) && (!c.adminOnly || isAdmin) && (!c.krOnly || !isXyxMode())).map(({ key, label, icon, range, flag }) => {
            let isOn
            if (flag) {
              isOn = quick === (key === 'variant' ? 'variants' : key)
            } else {
              isOn = activeChip === key && (key !== 'all' || quick === 'all')
            }
            return (
              <button
                key={key}
                className={`mob-chip${isOn ? ' on' : ''}`}
                onClick={() => handleChip(key)}
                aria-pressed={isOn}
              >
                {icon && <span className="mob-chip-icon" style={key === 'new' ? { color: 'var(--new)' } : {}}>{icon}</span>}
                {label}
                {range && <span style={{ color: 'var(--fg-4)', fontSize: '10.5px' }}>{range}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
