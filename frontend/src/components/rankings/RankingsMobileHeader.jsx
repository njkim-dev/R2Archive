import { useMemo } from 'react'
import useRankingsStore from '../../store/useRankingsStore'
import useStore from '../../store/useStore'
import MobilePageNav from '../MobilePageNav'
import { HelpButton } from '../HelpTour'
import ServerSwitcher from '../ServerSwitcher'

// PC 사이드바와 동일한 5각 별 SVG. '내기록' 칩(★)과 시각적으로 구분되게 SVG 사용.
const StarIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1 9.5l7.1-.6L12 2z"/>
  </svg>
)

// flag: true인 칩은 다른 칩과 독립적으로 토글된다 (single-select 그룹에서 빠짐).
const CHIPS = [
  { key: 'all',    label: '전체',     icon: '♩' },
  { key: 'star',   label: '별',       icon: StarIcon, range: '1.5–3.5', cat: true },
  { key: 'moon',   label: '달',       icon: '☾', range: '4–6.5',   cat: true },
  { key: 'sun',    label: '해',       icon: '☀', range: '7–12',    cat: true },
  { key: 'ranked', label: '랭킹있음', icon: '🏆', flag: true },
  { key: 'mine',   label: '내기록',   icon: '★', needLogin: true },
]

export default function RankingsMobileHeader({ totalFiltered, onFilterClick }) {
  const {
    search, setSearch, searchMode, setSearchMode,
    quick, setQuick, flagRanked, toggleFlagRanked, setFlagRanked,
    pinnedUser, unpinUser,
    levelMin, levelMax,
    category, setCategory,
  } = useRankingsStore()
  const { user, openLogin, logout, openMyPage } = useStore()

  const hasFilterBadge = !(levelMin === 1 && levelMax === 12)

  // PC 사이드바에서 quick='ranked'가 설정된 채로 모바일로 넘어왔을 때도
  // 랭킹있음 칩이 활성으로 보이도록 quick과 flag를 OR로 합쳐 표시.
  const isRankedOn = flagRanked || quick === 'ranked'

  const activeChip = useMemo(() => {
    if (quick === 'mine') return 'mine'
    if (category === 'star') return 'star'
    if (category === 'moon') return 'moon'
    if (category === 'sun') return 'sun'
    return 'all'
  }, [category, quick])

  const handleChip = (chip) => {
    // 랭킹있음: 다른 필터와 독립 토글. flag와 quick(레거시) 둘 다 정리해 cross-device 일관성 유지.
    if (chip === 'ranked') {
      if (isRankedOn) {
        if (flagRanked) setFlagRanked(false)
        if (quick === 'ranked') setQuick('all')
      } else {
        toggleFlagRanked()
      }
      return
    }

    if (chip === activeChip) return
    if (chip === 'all') {
      if (category) setCategory(category)   // 토글 해제
      setQuick('all')
      return
    }
    if (chip === 'star' || chip === 'moon' || chip === 'sun') {
      setCategory(chip)
      // 카테고리와 mine은 상호 배타. 단, 랭킹있음 flag는 보존.
      if (quick === 'mine') setQuick('all')
      return
    }
    // mine: 카테고리 해제 후 quick 설정 (단, 랭킹있음 flag는 보존)
    if (chip === 'mine' && !user && !pinnedUser) { openLogin(); return }
    if (category) setCategory(category)
    setQuick(chip)
  }

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
              <button className="mob-icon-btn" onClick={openLogin} title="로그인" style={{ width: 'auto', padding: '0 10px', fontSize: 13 }}>
                로그인
              </button>
            )}
            <button className="mob-icon-btn" onClick={onFilterClick} aria-label="필터">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              {hasFilterBadge && <span className="mob-badge" />}
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
            placeholder={searchMode === 'user' ? '사용자 닉네임으로 검색' : '곡명 · 아티스트로 검색'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
          <span className="mob-mode-tag mono">{searchMode === 'user' ? 'USER' : 'SONG'}</span>
        </label>

        <div className="mob-search-mode">
          <button
            className={`mob-sm-btn${searchMode === 'song' ? ' on' : ''}`}
            onClick={() => setSearchMode('song')}
          >곡명</button>
          <button
            className={`mob-sm-btn${searchMode === 'user' ? ' on' : ''}`}
            onClick={() => setSearchMode('user')}
          >사용자</button>
        </div>

        {pinnedUser && (
          <div className="mob-user-pin">
            <span className="mob-user-pin-medal">🏆</span>
            <span className="mob-user-pin-name">{pinnedUser.nickname}</span>
            <button className="mob-user-pin-close" onClick={unpinUser} aria-label="핀 해제">×</button>
          </div>
        )}

        <div className="mob-chips">
          {CHIPS.filter(c => !c.needLogin || user || pinnedUser).map(({ key, label, icon, range, flag }) => {
            const isOn = flag ? isRankedOn : activeChip === key
            return (
              <button
                key={key}
                className={`mob-chip${isOn ? ' on' : ''}`}
                onClick={() => handleChip(key)}
              >
                {icon && <span className="mob-chip-icon">{icon}</span>}
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
