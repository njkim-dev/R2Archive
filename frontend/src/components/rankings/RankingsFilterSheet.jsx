import { useEffect, useState } from 'react'
import useRankingsStore from '../../store/useRankingsStore'

const SORT_ROWS = [
  { key: 'idx', label: '날짜', opts: [{ dir: 'desc', label: '최신곡순' }, { dir: 'asc', label: '구곡순' }] },
  { key: 'level', label: '난이도', opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'rankScore', label: '랭킹 판정', opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'myScore', label: '내 판정', opts: [{ dir: 'desc', label: '높은 순' }, { dir: 'asc', label: '낮은 순' }] },
  { key: 'name', label: '곡명', opts: [{ dir: 'asc', label: '오름차순' }, { dir: 'desc', label: '내림차순' }] },
]

export default function RankingsFilterSheet({ open, onClose }) {
  const { levelMin, levelMax, setLevelMin, setLevelMax, sort } = useRankingsStore()
  const [sLvMin, setSLvMin] = useState(levelMin)
  const [sLvMax, setSLvMax] = useState(levelMax)

  useEffect(() => {
    if (open) {
      setSLvMin(levelMin)
      setSLvMax(levelMax)
    }
  }, [open])

  const apply = () => {
    setLevelMin(sLvMin)
    setLevelMax(sLvMax)
    onClose()
  }
  const reset = () => {
    setSLvMin(1); setSLvMax(12)
  }

  const setSortDirect = (key, dir) => {
    useRankingsStore.setState({ sort: { key, dir } })
    onClose()
  }

  return (
    <>
      <div className={`mob-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <section className={`mob-sheet${open ? ' open' : ''}`} role="dialog" aria-label="랭킹 필터">
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-head">
          <div className="mob-sheet-title">필터 / 정렬</div>
          <button className="mob-sheet-reset" onClick={reset}>난이도 초기화</button>
        </div>

        <div className="mob-sheet-group">
          <div className="mob-sheet-label">
            난이도
            <span className="mob-sheet-val">{sLvMin.toFixed(1)} — {sLvMax.toFixed(1)}</span>
          </div>
          <div className="mob-range-row">
            <input
              className="mob-range-num mono"
              type="number" min="0.5" max="12" step="0.5"
              value={sLvMin}
              onChange={e => setSLvMin(+e.target.value)}
              onBlur={() => { if (sLvMin > sLvMax) { setSLvMin(sLvMax); setSLvMax(sLvMin) } }}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number" min="0.5" max="12" step="0.5"
              value={sLvMax}
              onChange={e => setSLvMax(+e.target.value)}
              onBlur={() => { if (sLvMin > sLvMax) { setSLvMin(sLvMax); setSLvMax(sLvMin) } }}
            />
          </div>
        </div>

        <button className="mob-sheet-apply" onClick={apply}>적용</button>

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
                      onClick={() => setSortDirect(row.key, opt.dir)}
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
