import { useState, useEffect, useMemo, useRef } from 'react'
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
  const sheetRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (mobileSheetOpen) {
      setSBpmMin(bpmMin)
      setSBpmMax(bpmMax)
    }
  }, [mobileSheetOpen])

  useEffect(() => {
    if (!mobileSheetOpen) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const backgroundElements = [...(sheetRef.current?.parentElement?.children || [])]
      .filter(element => !element.classList.contains('mob-backdrop') && !element.classList.contains('mob-sheet'))
      .map(element => ({ element, ariaHidden: element.getAttribute('aria-hidden'), inert: element.inert }))
    backgroundElements.forEach(({ element }) => {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    })
    const frame = requestAnimationFrame(() => {
      sheetRef.current?.querySelector('button:not([disabled]), input:not([disabled])')?.focus()
    })
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMobileSheet()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusable = [...sheetRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')]
        .filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      backgroundElements.forEach(({ element, ariaHidden, inert }) => {
        element.inert = inert
        if (ariaHidden == null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      requestAnimationFrame(() => previousFocusRef.current?.focus?.())
    }
  }, [mobileSheetOpen, closeMobileSheet])

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

  if (!mobileSheetOpen) return null

  return (
    <>
      <div
        className="mob-backdrop open"
        onClick={closeMobileSheet}
        aria-hidden="true"
      />
      <section
        ref={sheetRef}
        className="mob-sheet open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-filter-title"
        tabIndex={-1}
      >
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-head">
          <h2 className="mob-sheet-title" id="mobile-filter-title">필터 / 정렬</h2>
          <div className="mob-sheet-actions">
            <button className="mob-sheet-reset" onClick={handleBpmReset}>BPM 초기화</button>
            <button className="mob-sheet-close" onClick={closeMobileSheet} aria-label="필터 닫기">×</button>
          </div>
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
              aria-label="BPM 최솟값"
              value={sBpmMin}
              onChange={e => setSBpmMin(+e.target.value)}
              onBlur={() => { if (sBpmMin > sBpmMax) { setSBpmMin(sBpmMax); setSBpmMax(sBpmMin) } }}
            />
            <span className="mob-range-dash">—</span>
            <input
              className="mob-range-num mono"
              type="number" min="40" max="300" step="1"
              aria-label="BPM 최댓값"
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
                      aria-pressed={sort.key === row.key && sort.dir === opt.dir}
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
