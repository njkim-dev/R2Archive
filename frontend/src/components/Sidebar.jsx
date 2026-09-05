import { useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import { filterSongs, dedupeByNameArtistMaxLevel } from '../utils/helpers'
import { isXyxMode } from '../utils/serverMode'
import { SlidersHorizontal } from 'lucide-react'
import { detailedFilterCount, visibleQuickFilters } from '../utils/catalogFilters'
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
    artists, aiMode, listenOnly,
    favorites, played, playedAll,
    isAdmin, closeModal, mobileSheetOpen, openMobileSheet,
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
      aiMode, listenOnly,
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
  }, [songs, levelMin, levelMax, bpmMin, bpmMax, category, artists, aiMode, listenOnly, user, favorites, played, playedAll])

  const handleLvBlur = () => {
    if (levelMin > levelMax) { setLevelMin(levelMax); setLevelMax(levelMin) }
  }
  const handleBpmBlur = () => {
    if (bpmMin > bpmMax) { setBpmMin(bpmMax); setBpmMax(bpmMin) }
  }

  const detailCount = detailedFilterCount({ category, quick, levelMin, levelMax, bpmMin, bpmMax, artists, aiMode, listenOnly }, meta)

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
        <button type="button" className="detailed-filter-trigger" onClick={openMobileSheet} aria-haspopup="dialog" aria-expanded={mobileSheetOpen}>
          <SlidersHorizontal size={16} aria-hidden="true" />상세 필터
          {detailCount > 0 && <span className="filter-count">{detailCount}</span>}
        </button>
      </div>
      <div className="side-section">
        <div className="side-label"><span>빠른 필터</span></div>
        <div className="nav" role="group" aria-label="빠른 필터">
          {visibleQuickFilters({ xyxMode, isAdmin }).map(({ key, label, needLogin }) => {
            const count = filteredCounts[key]
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

    </aside>
  )
}
