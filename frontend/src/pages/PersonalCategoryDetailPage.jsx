import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Globe2, Lock, SlidersHorizontal, Users } from 'lucide-react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { getPersonalCategoryByCode } from '../api/client'
import useStore from '../store/useStore'
import usePersonalCategoriesStore from '../store/usePersonalCategoriesStore'
import { filterSongs, sortSongs } from '../utils/helpers'
import SongsTable from '../components/SongsTable'
import UserChip from '../components/UserChip'
import MobilePageNav from '../components/MobilePageNav'
import { useMobile } from '../hooks/useMobile'
import { HelpButton } from '../components/HelpTour'

function roleLabel(role) {
  if (role === 'owner') return '소유자'
  if (role === 'editor') return '수정 가능'
  if (role === 'viewer') return '보기 전용'
  if (role === 'admin') return '관리자 보기'
  return '방문자'
}

function SidebarBrand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <div>
        <div className="brand-title">알투비트 아카이브</div>
        <div className="brand-sub">Personal Category</div>
      </div>
    </div>
  )
}

function PageNav({ user }) {
  const { openLogin, isAdmin } = useStore()
  return (
    <div className="side-section" style={{ marginTop: 0 }}>
      <div className="side-label"><span>페이지</span></div>
      <div className="page-nav">
        <NavLink to="/" end className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>곡 목록</span></NavLink>
        <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>음악 랭킹</span></NavLink>
        <NavLink
          to="/groups"
          className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
          onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
        >
          <span>그룹</span>
        </NavLink>
        <NavLink to="/personal-categories" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
          <span>음악 카테고리</span>
        </NavLink>
        <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>과거 피망곡</span></NavLink>
        {isAdmin && <NavLink to="/removed-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>미출시곡</span></NavLink>}
        <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>피드백</span></NavLink>
      </div>
    </div>
  )
}

const CATEGORY_OPTIONS = [
  { key: 'star', label: '별', rng: '1.5–3.5' },
  { key: 'moon', label: '달', rng: '4–6.5' },
  { key: 'sun', label: '해', rng: '7–12' },
]

const QUICK_OPTIONS = [
  { key: 'all', label: '전체 곡' },
  { key: 'new', label: '신곡' },
  { key: 'variants', label: '변속곡' },
  { key: 'favorite', label: '★ 내 즐겨찾기', needLogin: true },
]

function PersonalCategoryFilterPanel({
  songs,
  filters,
  counts,
  levelBounds,
  bpmBounds,
  totalFiltered,
  user,
  onCategory,
  onQuick,
  onLevelMin,
  onLevelMax,
  onBpmMin,
  onBpmMax,
  onReset,
}) {
  const hist = useMemo(() => {
    const bins = new Array(19).fill(0)
    songs.forEach(song => {
      const idx = Math.round((song.level - 1) * 2)
      if (idx >= 0 && idx < bins.length) bins[idx]++
    })
    const max = Math.max(...bins, 1)
    return bins.map(value => Math.round((value / max) * 100))
  }, [songs])

  const handleLvBlur = () => {
    if (filters.levelMin > filters.levelMax) {
      onLevelMin(filters.levelMax)
      onLevelMax(filters.levelMin)
    }
  }

  const handleBpmBlur = () => {
    if (filters.bpmMin > filters.bpmMax) {
      onBpmMin(filters.bpmMax)
      onBpmMax(filters.bpmMin)
    }
  }

  return (
    <>
      <div className="side-section">
        <div className="side-label">
          <span>음악 카테고리 필터</span>
          <span className="ct mono">{totalFiltered.toLocaleString()}</span>
        </div>
        <div className="nav">
          {QUICK_OPTIONS.map(({ key, label, needLogin }) => {
            const disabled = needLogin && !user
            return (
              <button
                key={key}
                className={`${filters.quick === key ? 'active' : ''}${disabled ? ' locked' : ''}`}
                onClick={() => !disabled && onQuick(key)}
                title={disabled ? '로그인 후 이용 가능' : undefined}
              >
                <span>{label}</span>
                <span className="tag">{disabled ? '—' : (counts[key] || 0).toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label"><span>카테고리</span></div>
        <div className="cat-group">
          {CATEGORY_OPTIONS.map(({ key, label, rng }) => (
            <button
              key={key}
              className={`cat-btn${filters.category === key ? ' active' : ''}`}
              onClick={() => onCategory(filters.category === key ? null : key)}
              title={`${label} (난이도 ${rng})`}
            >
              <span>{label}</span>
              <span className="rng">{rng}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label">
          <span>난이도</span>
          <span className="ct mono">{filters.levelMin.toFixed(1)} — {filters.levelMax.toFixed(1)}</span>
        </div>
        <div className="num-range">
          <input
            type="number"
            min={levelBounds[0]}
            max={levelBounds[1]}
            step="0.5"
            value={filters.levelMin}
            onChange={e => onLevelMin(+e.target.value)}
            onBlur={handleLvBlur}
          />
          <span className="rng-sep">—</span>
          <input
            type="number"
            min={levelBounds[0]}
            max={levelBounds[1]}
            step="0.5"
            value={filters.levelMax}
            onChange={e => onLevelMax(+e.target.value)}
            onBlur={handleLvBlur}
          />
        </div>
        <div className="lv-hist">
          {hist.map((pct, i) => (
            <div key={i} className="lv-hist-bar" style={{ height: `${pct}%` }} />
          ))}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label">
          <span>BPM</span>
          <span className="ct mono">{filters.bpmMin} — {filters.bpmMax}</span>
        </div>
        <div className="num-range">
          <input
            type="number"
            min={bpmBounds[0]}
            max={bpmBounds[1]}
            step="1"
            value={filters.bpmMin}
            onChange={e => onBpmMin(+e.target.value)}
            onBlur={handleBpmBlur}
          />
          <span className="rng-sep">—</span>
          <input
            type="number"
            min={bpmBounds[0]}
            max={bpmBounds[1]}
            step="1"
            value={filters.bpmMax}
            onChange={e => onBpmMax(+e.target.value)}
            onBlur={handleBpmBlur}
          />
        </div>
      </div>

      <div className="side-section">
        <button className="grp-btn ghost" onClick={onReset}>필터 초기화</button>
      </div>
    </>
  )
}

function PersonalCategoryMobileFilters({ filters, counts, user, onCategory, onQuick }) {
  return (
    <div className="pcat-mobile-filters">
      <div className="mob-chips">
        <button className={`mob-chip${!filters.category ? ' on' : ''}`} onClick={() => onCategory(null)}>전체</button>
        {CATEGORY_OPTIONS.map(({ key, label, rng }) => (
          <button
            key={key}
            className={`mob-chip${filters.category === key ? ' on' : ''}`}
            onClick={() => onCategory(filters.category === key ? null : key)}
          >
            {label}
            <span style={{ color: 'var(--fg-4)', fontSize: '10.5px' }}>{rng}</span>
          </button>
        ))}
        {QUICK_OPTIONS.filter(option => !option.needLogin || user).map(({ key, label }) => (
          <button
            key={key}
            className={`mob-chip${filters.quick === key ? ' on' : ''}`}
            onClick={() => onQuick(key)}
          >
            {label}
            <span className="mono" style={{ color: 'var(--fg-4)', fontSize: '10.5px' }}>{counts[key] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PersonalCategoryMobileFilterSheet({
  open,
  onClose,
  songs,
  filters,
  levelBounds,
  bpmBounds,
  favorites,
  onLevelMin,
  onLevelMax,
  onBpmMin,
  onBpmMax,
}) {
  const [draftLevelMin, setDraftLevelMin] = useState(filters.levelMin)
  const [draftLevelMax, setDraftLevelMax] = useState(filters.levelMax)
  const [draftBpmMin, setDraftBpmMin] = useState(filters.bpmMin)
  const [draftBpmMax, setDraftBpmMax] = useState(filters.bpmMax)

  useEffect(() => {
    if (!open) return
    setDraftLevelMin(filters.levelMin)
    setDraftLevelMax(filters.levelMax)
    setDraftBpmMin(filters.bpmMin)
    setDraftBpmMax(filters.bpmMax)
  }, [open, filters.levelMin, filters.levelMax, filters.bpmMin, filters.bpmMax])

  const normalizeDraft = () => ({
    levelMin: Math.min(draftLevelMin, draftLevelMax),
    levelMax: Math.max(draftLevelMin, draftLevelMax),
    bpmMin: Math.min(draftBpmMin, draftBpmMax),
    bpmMax: Math.max(draftBpmMin, draftBpmMax),
  })

  const previewCount = useMemo(() => {
    const next = normalizeDraft()
    return filterSongs(songs, {
      search: '',
      searchMode: 'both',
      levelMin: next.levelMin,
      levelMax: next.levelMax,
      bpmMin: next.bpmMin,
      bpmMax: next.bpmMax,
      category: filters.category,
      quick: filters.quick,
      artists: new Set(),
      favorites,
    }).exact.length
  }, [songs, draftLevelMin, draftLevelMax, draftBpmMin, draftBpmMax, filters.category, filters.quick, favorites])

  const reset = () => {
    setDraftLevelMin(levelBounds[0])
    setDraftLevelMax(levelBounds[1])
    setDraftBpmMin(bpmBounds[0])
    setDraftBpmMax(bpmBounds[1])
  }

  const apply = () => {
    const next = normalizeDraft()
    onLevelMin(next.levelMin)
    onLevelMax(next.levelMax)
    onBpmMin(next.bpmMin)
    onBpmMax(next.bpmMax)
    onClose()
  }

  return (
    <>
      <div className={`mob-backdrop${open ? ' open' : ''}`} onClick={onClose} />
    <section className={`mob-sheet${open ? ' open' : ''}`} role="dialog" aria-label="음악 카테고리 필터">
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-head">
          <div className="mob-sheet-title">필터</div>
          <button className="mob-sheet-reset" onClick={reset}>초기화</button>
        </div>

        <div className="mob-sheet-group">
          <div className="mob-sheet-label">
            난이도
            <span className="mob-sheet-val">{draftLevelMin.toFixed(1)} — {draftLevelMax.toFixed(1)}</span>
          </div>
          <div className="mob-range-row">
            <input
              className="mob-range-num mono"
              type="number"
              min={levelBounds[0]}
              max={levelBounds[1]}
              step="0.5"
              value={draftLevelMin}
              onChange={e => setDraftLevelMin(+e.target.value)}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number"
              min={levelBounds[0]}
              max={levelBounds[1]}
              step="0.5"
              value={draftLevelMax}
              onChange={e => setDraftLevelMax(+e.target.value)}
            />
          </div>
        </div>

        <div className="mob-sheet-group">
          <div className="mob-sheet-label">
            BPM
            <span className="mob-sheet-val">{draftBpmMin} — {draftBpmMax}</span>
          </div>
          <div className="mob-range-row">
            <input
              className="mob-range-num mono"
              type="number"
              min={bpmBounds[0]}
              max={bpmBounds[1]}
              step="1"
              value={draftBpmMin}
              onChange={e => setDraftBpmMin(+e.target.value)}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number"
              min={bpmBounds[0]}
              max={bpmBounds[1]}
              step="1"
              value={draftBpmMax}
              onChange={e => setDraftBpmMax(+e.target.value)}
            />
          </div>
        </div>

        <button className="mob-sheet-apply" onClick={apply}>
          적용 ({previewCount.toLocaleString()}곡)
        </button>
      </section>
    </>
  )
}

function EditorPanel({ category, onSaved }) {
  const navigate = useNavigate()
  const { patch } = usePersonalCategoriesStore()
  const [name, setName] = useState(category.name)
  const [isPublic, setIsPublic] = useState(category.is_public)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(category.name)
    setIsPublic(category.is_public)
  }, [category.id, category.name, category.is_public])

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await patch(category.id, { name: trimmed, is_public: isPublic })
      alert('카테고리를 저장했어요')
      onSaved()
    } catch (e) {
      alert(e?.response?.data?.detail || '저장에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pcat-editor-panel">
      <div className="pcat-editor-main">
        <div className="grp-field">
          <label>카테고리 이름</label>
          <input type="text" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <label className="grp-toggle-row" onClick={() => setIsPublic(v => !v)}>
          <div className="grp-toggle-meta">
            <b>공개 카테고리</b>
            <span>비공개여도 링크 접근자와 구독자는 볼 수 있어요.</span>
          </div>
          <div className={`grp-toggle${isPublic ? ' on' : ''}`} />
        </label>
        <div className="pcat-editor-actions">
          {category.can_manage && (
            <button className="gd-btn ghost sm" onClick={() => navigate(`/personal-categories/${category.category_code}/subscribers`)}>
              <Users size={14} />
              구독 사용자 관리
            </button>
          )}
          <button className="gd-btn primary sm" disabled={!name.trim() || busy} onClick={save}>
            {busy ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PersonalCategoryDetailPage() {
  const isMobile = useMobile()
  const navigate = useNavigate()
  const { code } = useParams()
  const { user, sort, openLogin, meta, favorites } = useStore()
  const { subscribe, unsubscribe, deleteSong } = usePersonalCategoriesStore()
  const [category, setCategory] = useState(null)
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [subscribing, setSubscribing] = useState(false)
  const [levelCategory, setLevelCategory] = useState(null)
  const [quick, setQuick] = useState('all')
  const [levelMin, setLevelMin] = useState(null)
  const [levelMax, setLevelMax] = useState(null)
  const [bpmMin, setBpmMin] = useState(null)
  const [bpmMax, setBpmMax] = useState(null)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  const loadCategory = useCallback(() => {
    setLoading(true)
    setError(null)
    return getPersonalCategoryByCode(code)
      .then(data => {
        setCategory(data.category)
        setSongs(data.songs || [])
      })
      .catch(e => {
        const status = e?.response?.status
        setError(status === 404 ? '카테고리를 찾을 수 없습니다' : '카테고리를 불러오지 못했어요')
      })
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    loadCategory()
  }, [loadCategory])

  const levelBounds = useMemo(() => [meta?.level_min ?? 0.5, meta?.level_max ?? 12], [meta])
  const bpmBounds = useMemo(() => [meta?.bpm_min ?? 40, meta?.bpm_max ?? 300], [meta])

  const activeFilters = useMemo(() => ({
    category: levelCategory,
    quick,
    levelMin: levelMin ?? levelBounds[0],
    levelMax: levelMax ?? levelBounds[1],
    bpmMin: bpmMin ?? bpmBounds[0],
    bpmMax: bpmMax ?? bpmBounds[1],
  }), [levelCategory, quick, levelMin, levelMax, levelBounds, bpmMin, bpmMax, bpmBounds])

  const filteredSongs = useMemo(() => {
    const { exact } = filterSongs(songs, {
      search: '',
      searchMode: 'both',
      levelMin: activeFilters.levelMin,
      levelMax: activeFilters.levelMax,
      bpmMin: activeFilters.bpmMin,
      bpmMax: activeFilters.bpmMax,
      category: activeFilters.category,
      quick: activeFilters.quick,
      artists: new Set(),
      favorites,
    })
    return sortSongs(exact, sort)
  }, [songs, activeFilters, favorites, sort])

  const filterCounts = useMemo(() => {
    const base = {
      search: '',
      searchMode: 'both',
      levelMin: activeFilters.levelMin,
      levelMax: activeFilters.levelMax,
      bpmMin: activeFilters.bpmMin,
      bpmMax: activeFilters.bpmMax,
      category: activeFilters.category,
      artists: new Set(),
      favorites,
    }
    return {
      all: filterSongs(songs, { ...base, quick: 'all' }).exact.length,
      new: filterSongs(songs, { ...base, quick: 'new' }).exact.length,
      variants: filterSongs(songs, { ...base, quick: 'variants' }).exact.length,
      favorite: user ? filterSongs(songs, { ...base, quick: 'favorite' }).exact.length : 0,
    }
  }, [songs, activeFilters, favorites, user])

  const resetFilters = () => {
    setLevelCategory(null)
    setQuick('all')
    setLevelMin(null)
    setLevelMax(null)
    setBpmMin(null)
    setBpmMax(null)
  }

  const copyLink = async () => {
    const link = `${window.location.origin}/personal-categories/${category.category_code}`
    try {
      await navigator.clipboard.writeText(link)
      alert(`카테고리 링크를 복사했어요.\n${link}`)
    } catch {
      alert(`클립보드 접근에 실패했어요. 직접 복사해주세요:\n${link}`)
    }
  }

  const toggleSubscribe = async () => {
    if (!user) {
      openLogin()
      return
    }
    if (subscribing) return
    setSubscribing(true)
    const wasSubscribed = Boolean(category?.is_subscribed)
    try {
      if (wasSubscribed) {
        await unsubscribe(category.category_code)
        alert('구독을 해제했어요')
      } else {
        await subscribe(category.category_code)
        alert('카테고리를 구독했어요')
      }
      await loadCategory()
    } catch (e) {
      alert(e?.response?.data?.detail || (wasSubscribed ? '구독 해제에 실패했어요' : '구독에 실패했어요'))
    } finally {
      setSubscribing(false)
    }
  }

  const handleDeleteSong = useCallback(async (song) => {
    if (!category?.can_edit) return
    if (!confirm(`'${song.name}' 곡을 이 카테고리에서 삭제할까요?`)) return
    try {
      await deleteSong(category.id, song.id)
      setSongs(prev => prev.filter(item => item.id !== song.id))
      setCategory(prev => prev ? { ...prev, song_count: Math.max(0, (prev.song_count || 1) - 1) } : prev)
    } catch (e) {
      alert(e?.response?.data?.detail || '곡 삭제에 실패했어요')
    }
  }, [category, deleteSong])

  const canShowSubscribe = category && !category.is_owner
  const isSubscribed = Boolean(category?.is_subscribed)
  const subscribeLabel = category?.is_subscribed
    ? (subscribing ? '해제 중...' : '구독 중')
    : user
      ? (subscribing ? '구독 중...' : '구독')
      : '로그인 후 구독'
  const subscribeButtonClass = `gd-btn ${isSubscribed ? 'ghost' : 'primary'} sm`
  const hasMobileRangeFilter = activeFilters.levelMin !== levelBounds[0]
    || activeFilters.levelMax !== levelBounds[1]
    || activeFilters.bpmMin !== bpmBounds[0]
    || activeFilters.bpmMax !== bpmBounds[1]

  const empty = (
    <div className="grp-empty pcat-empty-list">
      <div className="grp-empty-icon">♪</div>
      <h3>저장된 곡이 없어요</h3>
      <p>수정 권한이 있는 사용자가 곡 상세 화면에서 곡을 저장하면 여기에 표시돼요.</p>
    </div>
  )

  const filterEmpty = (
    <div className="grp-empty pcat-empty-list">
      <div className="grp-empty-icon">⌕</div>
      <h3>조건에 맞는 곡이 없어요</h3>
      <p>카테고리, 난이도, BPM 또는 빠른 필터를 조정해보세요.</p>
      <button className="grp-btn ghost" onClick={resetFilters}>필터 초기화</button>
    </div>
  )

  const blocked = (
    <div className="gd-blocked">
      <div className="gd-empty-icon">⚠</div>
      <h3>{error || '카테고리를 불러오는 중...'}</h3>
      {error && <button className="gd-btn primary" onClick={() => navigate('/')}>곡 목록으로</button>}
    </div>
  )

  const detailHead = category && (
    <div className="pcat-detail-mobile-head">
      <div>
        <div className="pcat-detail-title-row">
          <h1>{category.name}</h1>
          <span className={`pcat-visibility ${category.is_public ? 'public' : 'private'}`}>
            {category.is_public ? '공개' : '비공개'}
          </span>
          <span className={`pcat-role ${category.my_role || 'guest'}`}>{roleLabel(category.my_role)}</span>
        </div>
        <div className="pcat-detail-meta">
          {category.owner_nickname || '익명'} · {songs.length.toLocaleString()}곡 · <span className="mono">{category.category_code}</span>
        </div>
      </div>
      <div className="pcat-detail-head-actions">
        {canShowSubscribe && (
          <button
            className={subscribeButtonClass}
            onClick={toggleSubscribe}
            disabled={subscribing}
          >
            {subscribeLabel}
          </button>
        )}
        <button className="pcat-copy-icon" onClick={copyLink} title="링크 복사">
          <Copy size={17} />
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={levelCategory || undefined}>
        <header className="mob-top pcat-mobile-head">
          <div className="mob-top-inner">
            <div className="mob-top-row">
              <div className="mob-app-title">개인 <b>카테고리</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpButton />
                {user ? (
                  <button className="mob-icon-btn" onClick={() => navigate('/personal-categories')} title="내 카테고리">
                    <Globe2 size={18} />
                  </button>
                ) : (
                  <button className="mob-icon-btn" onClick={openLogin} title="로그인" style={{ width: 'auto', padding: '0 10px', fontSize: 13 }}>
                    로그인
                  </button>
                )}
                <button className="mob-icon-btn" onClick={() => setMobileFilterOpen(true)} aria-label="필터" title="필터">
                  <SlidersHorizontal size={19} />
                  {hasMobileRangeFilter && <span className="mob-badge" />}
                </button>
              </div>
            </div>
            <MobilePageNav />
          </div>
        </header>
        <PersonalCategoryMobileFilterSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          songs={songs}
          filters={activeFilters}
          levelBounds={levelBounds}
          bpmBounds={bpmBounds}
          favorites={favorites}
          onLevelMin={setLevelMin}
          onLevelMax={setLevelMax}
          onBpmMin={setBpmMin}
          onBpmMax={setBpmMax}
        />
        {loading || error || !category ? blocked : (
          <>
            {detailHead}
            <PersonalCategoryMobileFilters
              filters={activeFilters}
              counts={filterCounts}
              user={user}
              onCategory={setLevelCategory}
              onQuick={setQuick}
            />
            {songs.length === 0 ? empty : (
              filteredSongs.length === 0 ? filterEmpty : (
                <div className="pcat-detail-mobile-table">
                  <SongsTable
                    exact={filteredSongs}
                    fuzzy={[]}
                    isMobile
                    tableMode="personalCategory"
                    canDeleteSongs={category.can_edit}
                    onDeleteSong={handleDeleteSong}
                  />
                </div>
              )
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="app" data-cat={levelCategory || undefined}>
      <aside className="side">
        <SidebarBrand />
        <PageNav user={user} />
        <div className="side-section">
          <button className="gd-back-link" onClick={() => navigate('/personal-categories')}>
            <span style={{ fontSize: 11 }}>←</span>
            음악 카테고리로
          </button>
        </div>
        {category && !loading && !error && (
          <PersonalCategoryFilterPanel
            songs={songs}
            filters={activeFilters}
            counts={filterCounts}
            levelBounds={levelBounds}
            bpmBounds={bpmBounds}
            totalFiltered={filteredSongs.length}
            user={user}
            onCategory={setLevelCategory}
            onQuick={setQuick}
            onLevelMin={setLevelMin}
            onLevelMax={setLevelMax}
            onBpmMin={setBpmMin}
            onBpmMax={setBpmMax}
            onReset={resetFilters}
          />
        )}
      </aside>

      <main className="main">
        {loading || error || !category ? blocked : (
          <>
            <div className="topbar">
              <div className="pcat-top-title">
                <h2>{category.name}</h2>
                <span className={`pcat-visibility ${category.is_public ? 'public' : 'private'}`}>
                  {category.is_public ? <Globe2 size={12} /> : <Lock size={12} />}
                  {category.is_public ? '공개' : '비공개'}
                </span>
                <span className={`pcat-role ${category.my_role || 'guest'}`}>{roleLabel(category.my_role)}</span>
                <span className="mono pcat-code">{category.category_code}</span>
              </div>
              <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                {category.owner_nickname || '익명'}님의 카테고리 · {songs.length.toLocaleString()}곡
              </span>
              <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>
                표시 {filteredSongs.length.toLocaleString()}곡
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpButton />
                {canShowSubscribe && (
                  <button className={subscribeButtonClass} onClick={toggleSubscribe} disabled={subscribing}>
                    {subscribeLabel}
                  </button>
                )}
                <button className="gd-btn ghost sm" onClick={copyLink}>
                  <Copy size={14} />
                  링크 복사
                </button>
                {user ? <UserChip /> : <button className="gd-btn ghost sm" onClick={openLogin}>로그인</button>}
              </div>
            </div>
            {category.can_edit && <EditorPanel category={category} onSaved={loadCategory} />}
            {songs.length === 0 ? empty : (
              filteredSongs.length === 0 ? filterEmpty : (
                <div className="pcat-detail-body">
                  <SongsTable
                    exact={filteredSongs}
                    fuzzy={[]}
                    tableMode="personalCategory"
                    canDeleteSongs={category.can_edit}
                    onDeleteSong={handleDeleteSong}
                  />
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}
