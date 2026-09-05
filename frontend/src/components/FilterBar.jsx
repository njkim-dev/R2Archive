import useStore from '../store/useStore'

export default function FilterBar() {
  const {
    meta,
    search, setSearch, excludeSearch,
    levelMin, levelMax, setLevelMin, setLevelMax,
    bpmMin, bpmMax, setBpmMin, setBpmMax,
    category, setCategory,
    quick, setQuick,
    artists, toggleArtist,
    aiMode, setAiMode, listenOnly, setListenOnly,
    clearAllFilters,
  } = useStore()

  const pills = []

  if (aiMode !== 'show') {
    pills.push(<span key="ai" className="pill">{aiMode === 'hide' ? 'AI 음원 제외' : 'AI 음원만'}<button onClick={() => setAiMode('show')} aria-label="AI 음원 필터 해제">×</button></span>)
  }
  if (listenOnly) {
    pills.push(<span key="listen" className="pill">음악 듣기 제공<button onClick={() => setListenOnly(false)} aria-label="음악 듣기 제공 필터 해제">×</button></span>)
  }

  if (category) {
    const labels = { star: '별(1.5~3.5)', moon: '달(4~6.5)', sun: '해(7~12)' }
    pills.push(
      <span key="cat" className="pill">
        {labels[category]}
        <button onClick={() => setCategory(category)} aria-label={`${labels[category]} 필터 해제`}>×</button>
      </span>
    )
  }

  if (!category && (levelMin !== meta?.level_min || levelMax !== meta?.level_max)) {
    pills.push(
      <span key="lv" className="pill">
        난이도 <b>{levelMin?.toFixed(1)}~{levelMax?.toFixed(1)}</b>
        <button onClick={() => { setLevelMin(meta?.level_min); setLevelMax(meta?.level_max) }} aria-label="난이도 필터 해제">×</button>
      </span>
    )
  }

  if (bpmMin !== meta?.bpm_min || bpmMax !== meta?.bpm_max) {
    pills.push(
      <span key="bpm" className="pill">
        BPM <b>{bpmMin}~{bpmMax}</b>
        <button onClick={() => { setBpmMin(meta?.bpm_min); setBpmMax(meta?.bpm_max) }} aria-label="BPM 필터 해제">×</button>
      </span>
    )
  }

  if (quick !== 'all') {
    const labels = {
      new: '신곡',
      played: '모든 유저 플레이',
      variants: '변속곡',
      popular: '인기순',
      favorite: '★ 즐겨찾기',
      my_played: '내가 플레이한 곡',
      no_music: '음악 없음',
    }
    pills.push(
      <span key="quick" className="pill">
        {labels[quick] ?? quick}
        <button onClick={() => setQuick('all')} aria-label={`${labels[quick] ?? quick} 필터 해제`}>×</button>
      </span>
    )
  }

  artists.forEach(a => {
    pills.push(
      <span key={`artist:${a}`} className="pill">
        {a}
        <button onClick={() => toggleArtist(a)} aria-label={`${a} 아티스트 필터 해제`}>×</button>
      </span>
    )
  })

  if (search) {
    pills.push(
      <span key="search" className="pill">
        {excludeSearch ? '검색 제외' : '검색'} <b>"{search}"</b>
        <button onClick={() => setSearch('')} aria-label="검색어 필터 해제">×</button>
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
