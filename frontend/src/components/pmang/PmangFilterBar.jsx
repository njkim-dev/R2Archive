const CATEGORY_LABELS = {
  star: '별(1.5~3.5)',
  moon: '달(4~6.5)',
  sun: '해(7~12)',
}

export default function PmangFilterBar({
  search,
  setSearch,
  levelMin,
  levelMax,
  setLevelMin,
  setLevelMax,
  levelBounds,
  category,
  setCategory,
  quick,
  setQuick,
  artists,
  toggleArtist,
  clearAllFilters,
}) {
  const pills = []
  const [minBound, maxBound] = levelBounds

  if (category) {
    pills.push(
      <span key="cat" className="pill">
        {CATEGORY_LABELS[category] ?? category}
        <button onClick={() => setCategory(category)}>×</button>
      </span>
    )
  }

  if (levelMin !== minBound || levelMax !== maxBound) {
    pills.push(
      <span key="lv" className="pill">
        난이도 <b>{levelMin?.toFixed(1)}~{levelMax?.toFixed(1)}</b>
        <button onClick={() => { setLevelMin(minBound); setLevelMax(maxBound) }}>×</button>
      </span>
    )
  }

  if (quick !== 'all') {
    const labels = { favorite: '내 즐겨찾기' }
    pills.push(
      <span key="quick" className="pill">
        {labels[quick] ?? quick}
        <button onClick={() => setQuick('all')}>×</button>
      </span>
    )
  }

  artists.forEach(artist => {
    pills.push(
      <span key={`artist:${artist}`} className="pill">
        {artist}
        <button onClick={() => toggleArtist(artist)}>×</button>
      </span>
    )
  })

  if (search) {
    pills.push(
      <span key="search" className="pill">
        검색 <b>"{search}"</b>
        <button onClick={() => setSearch('')}>×</button>
      </span>
    )
  }

  return (
    <div className="active-filters">
      <span className="label">적용된 필터</span>
      {pills.length === 0
        ? <span style={{ color: 'var(--fg-4)' }}>없음 · 전체 카탈로그 표시 중</span>
        : pills
      }
      {pills.length > 0 && (
        <button className="clear-all" onClick={clearAllFilters}>모두 초기화</button>
      )}
    </div>
  )
}
