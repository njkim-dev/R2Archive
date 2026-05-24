import { useMemo } from 'react'
import useStore from '../store/useStore'
import MobilePageNav from './MobilePageNav'
import { HelpButton } from './HelpTour'
import ServerSwitcher from './ServerSwitcher'

// PC 사이드바와 동일한 5각 별 SVG. 즐겨찾기(★)와 시각적으로 구분되게 SVG 사용.
const StarIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1 9.5l7.1-.6L12 2z"/>
  </svg>
)

// flag: true인 칩은 다른 칩과 독립적으로 토글된다 (single-select 그룹에서 빠짐).
const CHIPS = [
  { key: 'all',       label: '전체',       icon: '♩' },
  { key: 'star',      label: '별',         icon: StarIcon, range: '1.5–3.5', cat: true },
  { key: 'moon',      label: '달',         icon: '☾', range: '4–6.5',   cat: true },
  { key: 'sun',       label: '해',         icon: '☀', range: '7–12',    cat: true },
  { key: 'new',       label: '신곡',       icon: '◉', flag: true },
  { key: 'variant',   label: '변속곡',                 flag: true },
  { key: 'favorite',  label: '즐겨찾기',   icon: '★', flag: true, needLogin: true },
  { key: 'my_played', label: '내 플레이',  icon: '♪', flag: true, needLogin: true },
]

export default function MobileHeader({ totalFiltered }) {
  const {
    search, setSearch,
    category, setCategory,
    quick, setQuick,
    flagNew, flagVariants, flagFavorite, flagMyPlayed,
    toggleFlagNew, toggleFlagVariants, toggleFlagFavorite, toggleFlagMyPlayed,
    setFlagNew, setFlagVariants, setFlagFavorite, setFlagMyPlayed,
    meta, bpmMin, bpmMax,
    openMobileSheet,
    sort, user,
    openLogin, logout, openOnboarding, openMyPage,
  } = useStore()

  // PC 사이드바에서 quick='new'/'variants'/'favorite'/'my_played'가 설정된 채로 모바일로 넘어왔을 때도
  // 해당 칩이 활성으로 보이도록 quick과 flag를 OR로 합쳐 표시.
  const isNewOn = flagNew || quick === 'new'
  const isVarOn = flagVariants || quick === 'variants'
  const isFavOn = flagFavorite || quick === 'favorite'
  const isMyPlayedOn = flagMyPlayed || quick === 'my_played'

  const activeChip = useMemo(() => {
    if (category === 'star') return 'star'
    if (category === 'moon') return 'moon'
    if (category === 'sun') return 'sun'
    return 'all'
  }, [category])

  const hasBadge = useMemo(() => {
    return bpmMin !== meta?.bpm_min || bpmMax !== meta?.bpm_max
  }, [bpmMin, bpmMax, meta])

  // 독립 flag 토글 헬퍼: 현재 ON이면 flag와 레거시 quick 둘 다 정리, OFF면 flag만 켠다.
  const toggleIndependent = (isOn, flagVal, setFlag, toggleFlag, quickKey) => {
    if (isOn) {
      if (flagVal) setFlag(false)
      if (quick === quickKey) setQuick('all')
    } else {
      toggleFlag()
    }
  }

  const handleChip = (chip) => {
    // 독립 flag 칩들: 다른 필터와 자유 조합 가능.
    if (chip === 'new')      return toggleIndependent(isNewOn,     flagNew,      setFlagNew,      toggleFlagNew,      'new')
    if (chip === 'variant')  return toggleIndependent(isVarOn,     flagVariants, setFlagVariants, toggleFlagVariants, 'variants')
    if (chip === 'favorite') return toggleIndependent(isFavOn,     flagFavorite, setFlagFavorite, toggleFlagFavorite, 'favorite')
    if (chip === 'my_played') return toggleIndependent(isMyPlayedOn, flagMyPlayed, setFlagMyPlayed, toggleFlagMyPlayed, 'my_played')

    // 이하 single-select 카테고리 그룹.
    if (chip === activeChip) return
    if (chip === 'all') {
      if (category) setCategory(category)
      setQuick('all')
      return
    }
    if (chip === 'star' || chip === 'moon' || chip === 'sun') {
      setCategory(chip)   // 레벨 범위 자동 리셋 포함
      // flag들은 모두 보존 — 카테고리와 독립.
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
      <div className="mob-top-inner">
        <div className="mob-top-row">
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

        <MobilePageNav />

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
          {CHIPS.filter(c => !c.needLogin || user).map(({ key, label, icon, range, flag }) => {
            let isOn
            if (flag) {
              isOn = key === 'new' ? isNewOn
                : key === 'variant' ? isVarOn
                : key === 'favorite' ? isFavOn
                : key === 'my_played' ? isMyPlayedOn
                : false
            } else {
              isOn = activeChip === key
            }
            return (
              <button
                key={key}
                className={`mob-chip${isOn ? ' on' : ''}`}
                onClick={() => handleChip(key)}
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
