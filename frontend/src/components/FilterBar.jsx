import useStore from '../store/useStore'

export default function FilterBar() {
  const {
    meta,
    search, setSearch,
    levelMin, levelMax, setLevelMin, setLevelMax,
    bpmMin, bpmMax, setBpmMin, setBpmMax,
    category, setCategory,
    quick, setQuick,
    artists, toggleArtist,
    clearAllFilters,
  } = useStore()

  const pills = []

  if (category) {
    const m = { star: '별 (1.5–3.5)', moon: '달 (4–6.5)', sun: '해 (7–12)' }
    pills.push(
      <span key="cat" className="pill">
        {m[category]}
        <button onClick={() => setCategory(category)}>×</button>
      </span>
    )
  }

  if (!category && (levelMin !== meta?.level_min || levelMax !== meta?.level_max)) {
    pills.push(
      <span key="lv" className="pill">
        난이도 <b>{levelMin?.toFixed(1)}–{levelMax?.toFixed(1)}</b>
        <button onClick={() => { setLevelMin(meta?.level_min); setLevelMax(meta?.level_max) }}>×</button>
      </span>
    )
  }

  if (bpmMin !== meta?.bpm_min || bpmMax !== meta?.bpm_max) {
    pills.push(
      <span key="bpm" className="pill">
        BPM <b>{bpmMin}–{bpmMax}</b>
        <button onClick={() => { setBpmMin(meta?.bpm_min); setBpmMax(meta?.bpm_max) }}>×</button>
      </span>
    )
  }

  if (quick !== 'all') {
    const m = { new: '신곡', played: '모든 사용자 플레이', variants: '변속곡', favorite: '★ 즐겨찾기', my_played: '내가 플레이한 곡' }
    pills.push(
      <span key="quick" className="pill">
        {m[quick] ?? quick}
        <button onClick={() => setQuick('all')}>×</button>
      </span>
    )
  }

  artists.forEach(a => {
    pills.push(
      <span key={`artist:${a}`} className="pill">
        {a}
        <button onClick={() => toggleArtist(a)}>×</button>
      </span>
    )
  })

  if (search) {
    pills.push(
      <span key="search" className="pill">
        검색: <b>"{search}"</b>
        <button onClick={() => setSearch('')}>×</button>
      </span>
    )
  }

  return (
    <div className="active-filters">
      <span className="label">적용된 필터</span>
      {pills.length === 0
        ? <span style={{ color: 'var(--fg-4)' }}>없음 — 전체 카탈로그 표시 중</span>
        : pills
      }
      {pills.length > 0 && (
        <button className="clear-all" onClick={clearAllFilters}>모두 초기화</button>
      )}
    </div>
  )
}
