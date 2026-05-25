import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import useStore from '../../store/useStore'
import { filterPmangSongs } from '../../utils/pmang'
import ServerSwitcher from '../ServerSwitcher'

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

export default function PmangSidebar({
  songs,
  filtered,
  category, setCategory,
  quick, setQuick,
  levelMin, levelMax, setLevelMin, setLevelMax, levelBounds,
  bpmMin, bpmMax, setBpmMin, setBpmMax, bpmBounds,
  artists, toggleArtist, clearArtists,
  topArtists,
  favorites,
  pmangYoutubeCandidates = [],
}) {
  const { user, openLogin, isAdmin } = useStore()

  const hist = useMemo(() => {
    const lo = levelBounds[0]
    const hi = levelBounds[1]
    const span = Math.max(Math.round((hi - lo) * 2), 1)
    const bins = new Array(span + 1).fill(0)
    songs.forEach(s => {
      const v = s.level / 2
      const i = Math.max(0, Math.min(span, Math.round((v - lo) * 2)))
      bins[i]++
    })
    const max = Math.max(...bins, 1)
    return bins.map(v => Math.round((v / max) * 100))
  }, [songs, levelBounds])

  const filteredCounts = useMemo(() => {
    const baseFilters = {
      search: '',
      searchMode: 'both',
      levelMin,
      levelMax,
      bpmMin,
      bpmMax,
      category,
      quick: 'all',
      artists,
      favorites,
    }
    const base = filterPmangSongs(songs, baseFilters).exact
    const candidateBase = filterPmangSongs(pmangYoutubeCandidates, baseFilters).exact
    return {
      all: base.length,
      popular: base.length,
      favorite: user ? base.filter(s => favorites?.has(s.id)).length : 0,
      no_music: base.filter(s => !s.youtube_url).length,
      youtube_candidates: candidateBase.length,
    }
  }, [songs, levelMin, levelMax, bpmMin, bpmMax, category, artists, user, favorites, pmangYoutubeCandidates])

  const handleLvBlur = () => {
    if (levelMin > levelMax) { setLevelMin(levelMax); setLevelMax(levelMin) }
  }
  const handleBpmBlur = () => {
    if (bpmMin > bpmMax) { setBpmMin(bpmMax); setBpmMax(bpmMin) }
  }

  const selectedCount = artists.size

  return (
    <aside className="side">
      <ServerSwitcher />

      <div className="side-section">
        <div className="side-label"><span>페이지</span></div>
        <div className="page-nav">
          <NavLink to="/" end className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
            <span>곡 목록</span>
          </NavLink>
          <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
            <span>음악 랭킹</span>
          </NavLink>
          <NavLink
            to="/groups"
            className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
            onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
          >
            <span>그룹</span>
          </NavLink>
          <NavLink
            to="/personal-categories"
            className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
            onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
          >
            <span>음악 카테고리</span>
          </NavLink>
          <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
            <span>과거 피망곡</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/removed-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
              <span>미출시곡</span>
            </NavLink>
          )}
          <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
            <span>피드백</span>
          </NavLink>
        </div>
      </div>

      <div className="side-section">
        <div className="side-label"><span>빠른 필터</span></div>
        <div className="nav">
          {[
            { key: 'all',      label: '전체 곡',           count: filteredCounts.all },
            { key: 'popular',  label: '인기순',             count: filteredCounts.popular },
            { key: 'favorite', label: '★ 내 즐겨찾기',     count: filteredCounts.favorite, needLogin: true },
            { key: 'no_music', label: '음악 없음', count: filteredCounts.no_music, adminOnly: true },
            { key: 'youtube_candidates', label: '후보곡', count: filteredCounts.youtube_candidates, adminOnly: true },
          ].map(({ key, label, count, needLogin, adminOnly }) => {
            if (adminOnly && !isAdmin) return null
            const disabled = needLogin && !user
            return (
              <button
                key={key}
                className={`${quick === key ? 'active' : ''}${disabled ? ' locked' : ''}`}
                onClick={() => !disabled && setQuick(key)}
                title={disabled ? '로그인 후 이용 가능' : undefined}
              >
                <span>{label}</span>
                <span className="tag">{disabled ? '—' : count.toLocaleString()}</span>
              </button>
            )
          })}
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
            type="number" min={levelBounds[0]} max={levelBounds[1]} step="0.5"
            value={levelMin}
            onChange={e => setLevelMin(+e.target.value)}
            onBlur={handleLvBlur}
          />
          <span className="rng-sep">—</span>
          <input
            type="number" min={levelBounds[0]} max={levelBounds[1]} step="0.5"
            value={levelMax}
            onChange={e => setLevelMax(+e.target.value)}
            onBlur={handleLvBlur}
          />
        </div>
        <div className="lv-hist">
          {hist.map((pct, i) => (
            <div key={i} className="lv-hist-bar" style={{ height: `${pct}%` }} />
          ))}
        </div>
      </div>

      {bpmMin != null && bpmMax != null && (
        <div className="side-section">
          <div className="side-label">
            <span>BPM</span>
            <span className="ct mono">{bpmMin} — {bpmMax}</span>
          </div>
          <div className="num-range">
            <input
              type="number" min={bpmBounds[0]} max={bpmBounds[1]} step="1"
              value={bpmMin}
              onChange={e => setBpmMin(+e.target.value)}
              onBlur={handleBpmBlur}
            />
            <span className="rng-sep">—</span>
            <input
              type="number" min={bpmBounds[0]} max={bpmBounds[1]} step="1"
              value={bpmMax}
              onChange={e => setBpmMax(+e.target.value)}
              onBlur={handleBpmBlur}
            />
          </div>
        </div>
      )}

      <div className="side-section">
        <div className="side-label">
          <span>아티스트</span>
          {selectedCount > 0 && (
            <span className="ct" style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={clearArtists}>
              {selectedCount}개 선택
            </span>
          )}
        </div>
        <div className="chips">
          {topArtists.map(a => (
            <button
              key={a}
              className={`chip${artists.has(a) ? ' on' : ''}`}
              onClick={() => toggleArtist(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
