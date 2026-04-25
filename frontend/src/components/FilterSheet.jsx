import { useState, useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import { filterSongs } from '../utils/helpers'

const SORT_ROWS = [
  { key: 'file_order', label: '날짜',    opts: [{ dir: 'desc', label: '최신곡순' }, { dir: 'asc', label: '구곡순' }] },
  { key: 'level',      label: '난이도',  opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'bpm',        label: 'BPM',    opts: [{ dir: 'desc', label: '빠른 순' }, { dir: 'asc', label: '느린 순' }] },
  { key: 'name',       label: '곡명',   opts: [{ dir: 'asc',  label: '오름차순' }, { dir: 'desc', label: '내림차순' }] },
  { key: 'artist',     label: '아티스트', opts: [{ dir: 'asc', label: '오름차순' }, { dir: 'desc', label: '내림차순' }] },
]

export default function FilterSheet() {
  const {
    mobileSheetOpen, closeMobileSheet,
    songs, search, category, quick, artists,
    meta,
    bpmMin, bpmMax, sort,
    setBpmMin, setBpmMax, setSortDirect,
  } = useStore()

  const [sBpmMin, setSBpmMin] = useState(bpmMin)
  const [sBpmMax, setSBpmMax] = useState(bpmMax)

  useEffect(() => {
    if (mobileSheetOpen) {
      setSBpmMin(bpmMin)
      setSBpmMax(bpmMax)
    }
  }, [mobileSheetOpen])

  const previewCount = useMemo(() => {
    const { levelMin, levelMax } = useStore.getState()
    const { exact, fuzzy } = filterSongs(songs, {
      search,
      levelMin, levelMax,
      bpmMin: sBpmMin, bpmMax: sBpmMax,
      category, quick, artists,
    })
    return exact.length + fuzzy.length
  }, [songs, search, sBpmMin, sBpmMax, category, quick, artists])

  const handleBpmApply = () => {
    setBpmMin(sBpmMin)
    setBpmMax(sBpmMax)
    closeMobileSheet()
  }

  const handleBpmReset = () => {
    setSBpmMin(meta?.bpm_min ?? 60)
    setSBpmMax(meta?.bpm_max ?? 220)
  }

  return (
    <>
      <div
        className={`mob-backdrop${mobileSheetOpen ? ' open' : ''}`}
        onClick={closeMobileSheet}
      />
      <section className={`mob-sheet${mobileSheetOpen ? ' open' : ''}`} role="dialog" aria-label="필터">
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-head">
          <div className="mob-sheet-title">필터 / 정렬</div>
          <button className="mob-sheet-reset" onClick={handleBpmReset}>BPM 초기화</button>
        </div>

        <div className="mob-sheet-group">
          <div className="mob-sheet-label">
            BPM
            <span className="mob-sheet-val">{sBpmMin} — {sBpmMax}</span>
          </div>
          <div className="mob-range-row">
            <input
              className="mob-range-num mono"
              type="number" min="40" max="300" step="1"
              value={sBpmMin}
              onChange={e => setSBpmMin(+e.target.value)}
              onBlur={() => { if (sBpmMin > sBpmMax) { setSBpmMin(sBpmMax); setSBpmMax(sBpmMin) } }}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number" min="40" max="300" step="1"
              value={sBpmMax}
              onChange={e => setSBpmMax(+e.target.value)}
              onBlur={() => { if (sBpmMin > sBpmMax) { setSBpmMin(sBpmMax); setSBpmMax(sBpmMin) } }}
            />
          </div>
        </div>

        <button className="mob-sheet-apply" onClick={handleBpmApply}>
          적용 ({previewCount.toLocaleString()}곡)
        </button>

        <div className="mob-sheet-group" style={{ marginTop: 20 }}>
          <div className="mob-sheet-label">정렬</div>
          <div className="mob-sort-rows">
            {SORT_ROWS.map(row => (
              <div className="mob-sort-row" key={row.key}>
                <span className="mob-sort-row-label">{row.label}</span>
                <div className="mob-sort-toggle">
                  {row.opts.map(opt => (
                    <button
                      key={opt.dir}
                      className={`mob-sort-tog${sort.key === row.key && sort.dir === opt.dir ? ' on' : ''}`}
                      onClick={() => { setSortDirect({ key: row.key, dir: opt.dir }); closeMobileSheet() }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
