import { useState } from 'react'
import useRankingsStore from '../../store/useRankingsStore'
import useStore from '../../store/useStore'
import UserPin from './UserPin'
import ServerSwitcher from '../ServerSwitcher'
import PageNavigation from '../PageNavigation'

const GROUPS_INITIAL_LIMIT = 5

const CATEGORIES = [
  {
    key: 'star', label: '별', rng: '1.5–3.5',
    icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1 9.5l7.1-.6L12 2z"/></svg>
  },
  {
    key: 'moon', label: '달', rng: '4–6.5',
    icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 13.9A8 8 0 1110.1 3.6a6.5 6.5 0 0010.3 10.3z"/></svg>
  },
  {
    key: 'sun', label: '해', rng: '7–12',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
  },
]

export default function RankingsSidebar({ rankedSongCount, mineSongCount, myGroups = [], activeGroupId = null, onActiveGroupChange }) {
  const {
    quick, setQuick,
    levelMin, levelMax, setLevelMin, setLevelMax,
    category, setCategory,
    pinnedUser,
  } = useRankingsStore()
  const { user, openLogin } = useStore()

  const [showAllGroups, setShowAllGroups] = useState(false)
  const visibleGroups = showAllGroups ? myGroups : myGroups.slice(0, GROUPS_INITIAL_LIMIT)
  const hiddenCount = Math.max(0, myGroups.length - GROUPS_INITIAL_LIMIT)

  // 그룹 필터는 그룹 1위 집계 범위도 함께 바꾼다.
  const handleQuick = (key) => {
    if ((key === 'mine') && !user && !pinnedUser) {
      openLogin()
      return
    }
    setQuick(key)
    if (typeof key === 'string' && key.startsWith('group:')) {
      const gid = Number(key.slice('group:'.length))
      onActiveGroupChange?.(gid)
    } else {
      onActiveGroupChange?.(null)
    }
  }

  const handleLvBlur = () => {
    if (levelMin > levelMax) { setLevelMin(levelMax); setLevelMax(levelMin) }
  }

  return (
    <aside className="side">
      <ServerSwitcher />

      <PageNavigation />

      <UserPin />

      <div className="side-section">
        <div className="side-label"><span>빠른 필터</span></div>
        <div className="nav">
          <button
            className={quick === 'all' ? 'active' : ''}
            onClick={() => handleQuick('all')}
          >
            <span>전체 곡</span>
          </button>

          {(() => {
            const disabled = !user && !pinnedUser
            return (
              <button
                className={`${quick === 'mine' ? 'active' : ''}${disabled ? ' locked' : ''}`}
                onClick={() => handleQuick('mine')}
                title={disabled ? '로그인 후 이용 가능' : undefined}
              >
                <span>{pinnedUser ? `★ ${pinnedUser.nickname}의 성과` : '★ 내 성과 목록'}</span>
                <span className="tag">{disabled ? '—' : mineSongCount.toLocaleString()}</span>
              </button>
            )
          })()}

          <button
            className={quick === 'ranked' ? 'active' : ''}
            onClick={() => handleQuick('ranked')}
          >
            <span>🏆 전체 유저 성과 목록</span>
            <span className="tag">{rankedSongCount.toLocaleString()}</span>
          </button>

          {visibleGroups.map(g => {
            const key = `group:${g.id}`
            const count = g.ranked_song_count ?? 0
            return (
              <button
                key={key}
                className={quick === key ? 'active' : ''}
                onClick={() => handleQuick(key)}
                title={`${g.name} 그룹 멤버들의 성과`}
              >
                <span>👥 {g.name} 그룹 성과 목록</span>
                <span className="tag">{count.toLocaleString()}</span>
              </button>
            )
          })}
          {hiddenCount > 0 && (
            <button
              className="nav-more"
              onClick={() => setShowAllGroups(v => !v)}
            >
              <span style={{ color: 'var(--fg-3)' }}>
                {showAllGroups ? '접기' : `더보기 ${hiddenCount}개`}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label"><span>카테고리</span></div>
        <div className="cat-group">
          {CATEGORIES.map(({ key, label, rng, icon }) => (
            <button
              key={key}
              className={`cat-btn${category === key ? ' active' : ''}`}
              onClick={() => setCategory(key)}
              title={`${label} (난이도 ${rng})`}
            >
              {icon}
              <span>{label}</span>
              <span className="rng">{rng}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label">
          <span>난이도</span>
          <span className="ct mono">{levelMin.toFixed(1)} — {levelMax.toFixed(1)}</span>
        </div>
        <div className="num-range">
          <input
            type="number" min="0.5" max="12" step="0.5"
            value={levelMin}
            onChange={e => setLevelMin(+e.target.value)}
            onBlur={handleLvBlur}
          />
          <span className="rng-sep">—</span>
          <input
            type="number" min="0.5" max="12" step="0.5"
            value={levelMax}
            onChange={e => setLevelMax(+e.target.value)}
            onBlur={handleLvBlur}
          />
        </div>
      </div>
    </aside>
  )
}
