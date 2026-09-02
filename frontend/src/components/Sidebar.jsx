import { useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import { filterSongs, dedupeByNameArtistMaxLevel } from '../utils/helpers'
import { isXyxMode } from '../utils/serverMode'
import ServerSwitcher from './ServerSwitcher'
import PageNavigation from './PageNavigation'

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

export default function Sidebar({ songs, filtered, loading = false, error = null }) {
  const xyxMode = isXyxMode()
  const {
    meta, user,
    category, setCategory,
    quick, setQuick,
    levelMin, levelMax, setLevelMin, setLevelMax,
    bpmMin, bpmMax, setBpmMin, setBpmMax,
    artists, toggleArtist, clearArtists,
    favorites, played, playedAll,
    isAdmin, closeModal,
  } = useStore()

  useEffect(() => {
    if (xyxMode && quick === 'played') setQuick('all')
  }, [xyxMode, quick, setQuick])

  const hist = useMemo(() => {
    const bins = new Array(19).fill(0)
    songs.forEach(s => {
      const i = Math.round((s.level - 1) * 2)
      if (i >= 0 && i < 19) bins[i]++
    })
    const max = Math.max(...bins, 1)
    return bins.map(v => Math.round((v / max) * 100))
  }, [songs])

  const filteredCounts = useMemo(() => {
    const playedSet = category ? playedAll : played
    const base = filterSongs(songs, {
      search: '', searchMode: 'both',
      levelMin, levelMax, bpmMin, bpmMax,
      category, quick: 'all', artists,
      favorites, played: playedSet,
    }).exact
    return {
      all:      base.length,
      new:      base.filter(s => s.is_new).length,
      variants: base.filter(s => s.is_change).length,
      popular: base.length,
      played:   dedupeByNameArtistMaxLevel(base.filter(s => s.play_count > 0)).length,
      favorite: user ? base.filter(s => favorites.has(s.id)).length : 0,
      my_played: user ? base.filter(s => playedSet.has(s.id)).length : 0,
      no_music: base.filter(s => !s.youtube_url).length,
    }
  }, [songs, levelMin, levelMax, bpmMin, bpmMax, category, artists, user, favorites, played, playedAll])

  const handleLvBlur = () => {
    if (levelMin > levelMax) { setLevelMin(levelMax); setLevelMax(levelMin) }
  }
  const handleBpmBlur = () => {
    if (bpmMin > bpmMax) { setBpmMin(bpmMax); setBpmMax(bpmMin) }
  }

  const topArtists = meta?.top_artists ?? []
  const selectedCount = artists.size

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">R2</div>
        <div>
          <h1 className="brand-title">R2Music Archive</h1>
          <div className="brand-sub">{xyxMode ? 'XYX Catalog' : 'Music Catalog'}</div>
        </div>
      </div>
      <ServerSwitcher />

      <PageNavigation onNavigate={closeModal} />

      <div className="side-section">
        <div className="side-label"><span>빠른 필터</span></div>
        <div className="nav" role="group" aria-label="빠른 필터">
          {[
            { key: 'all',      label: '전체 곡',              count: filteredCounts.all },
            { key: 'new',      label: '신곡',                 count: filteredCounts.new },
            { key: 'variants', label: '변속곡',               count: filteredCounts.variants },
            { key: 'popular',  label: '인기순',               count: filteredCounts.popular, adminOnly: true },
            { key: 'favorite', label: '★ 내 즐겨찾기',         count: filteredCounts.favorite, needLogin: true },
            { key: 'my_played', label: '내가 플레이한 곡',      count: filteredCounts.my_played, needLogin: true },
            { key: 'played',   label: '전체 유저 플레이 곡',    count: filteredCounts.played },
            { key: 'no_music', label: '음악 없음', count: filteredCounts.no_music, adminOnly: true },
          ].map(({ key, label, count, needLogin, adminOnly }) => {
            if (xyxMode && key === 'played') return null
            if (adminOnly && !isAdmin) return null
            const disabled = needLogin && !user
            return (
              <button
                key={key}
                className={`${quick === key ? 'active' : ''}${disabled ? ' locked' : ''}`}
                onClick={() => !disabled && setQuick(key)}
                title={disabled ? '로그인 후 이용 가능' : undefined}
                aria-pressed={quick === key}
                aria-disabled={disabled}
              >
                <span>{label}</span>
                <span className="tag">{disabled ? '—' : loading ? '…' : error ? '—' : count.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label"><span>카테고리</span></div>
        <div className="cat-group" role="group" aria-label="난이도 카테고리">
          {CATEGORIES.map(({ key, label, rng, icon }) => (
            <button
              key={key}
              className={`cat-btn${category === key ? ' active' : ''}`}
              onClick={() => setCategory(key)}
              title={`${label} (난이도 ${rng})`}
              aria-pressed={category === key}
            >
              {icon}
              <span>{label}</span>
              <span className="rng">{rng}</span>
            </button>
          ))}
        </div>
      </div>

      {levelMin != null && levelMax != null && (
        <div className="side-section">
          <div className="side-label">
            <span>난이도</span>
            <span className="ct mono">{levelMin.toFixed(1)} — {levelMax.toFixed(1)}</span>
          </div>
          <div className="num-range">
            <input
              type="number" min="0.5" max="12" step="0.5"
              value={levelMin}
              aria-label="난이도 최솟값"
              onChange={e => setLevelMin(+e.target.value)}
              onBlur={handleLvBlur}
            />
            <span className="rng-sep">—</span>
            <input
              type="number" min="0.5" max="12" step="0.5"
              value={levelMax}
              aria-label="난이도 최댓값"
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
      )}

      {bpmMin != null && bpmMax != null && (
        <div className="side-section">
          <div className="side-label">
            <span>BPM</span>
            <span className="ct mono">{bpmMin} — {bpmMax}</span>
          </div>
          <div className="num-range">
            <input
              type="number" min={meta?.bpm_min} max={meta?.bpm_max} step="1"
              value={bpmMin}
              aria-label="BPM 최솟값"
              onChange={e => setBpmMin(+e.target.value)}
              onBlur={handleBpmBlur}
            />
            <span className="rng-sep">—</span>
            <input
              type="number" min={meta?.bpm_min} max={meta?.bpm_max} step="1"
              value={bpmMax}
              aria-label="BPM 최댓값"
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
            <button className="ct side-clear-selection" onClick={clearArtists}>
              {selectedCount}개 선택 해제
            </button>
          )}
        </div>
        <div className="chips" role="group" aria-label="아티스트 필터">
          {topArtists.map(a => (
            <button
              key={a}
              className={`chip${artists.has(a) ? ' on' : ''}`}
              onClick={() => toggleArtist(a)}
              aria-pressed={artists.has(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
