import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const ROW_HEIGHT = 260
const OVERSCAN = 2

export default function ShopVirtualGrid({ items, hasMore, loading, error, loadMore, renderItem, empty, resetKey, scrollPosition, restoreScroll,minCardWidth }) {
  const rootRef = useRef(null)
  const [windowState, setWindowState] = useState({ first: 0, last: 5, columns: minCardWidth?1:window.innerWidth <= 550 ? 2 : 3 })
  const callback = useRef(loadMore)
  callback.current = loadMore
  const rows = Math.ceil(items.length / windowState.columns)
  const height = Math.max(780, (rows + (hasMore ? 1 : 0)) * ROW_HEIGHT)
  useLayoutEffect(() => {
    if (restoreScroll?.current) { window.scrollTo({ top: scrollPosition.current, behavior: 'instant' }); restoreScroll.current = false }
    let frame
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = rootRef.current.getBoundingClientRect()
        const columns = minCardWidth?Math.max(1,Math.min(3,Math.floor((rect.width+14)/(minCardWidth+14)))):window.innerWidth <= 550 ? 2 : 3
        const offset = Math.max(0, -rect.top)
        const first = Math.max(0, Math.floor(offset / ROW_HEIGHT) - OVERSCAN)
        const last = Math.max(first, Math.ceil((window.innerHeight - rect.top) / ROW_HEIGHT) + OVERSCAN)
        setWindowState(previous => previous.first === first && previous.last === last && previous.columns === columns ? previous : { first, last, columns })
        if (scrollPosition) scrollPosition.current = window.scrollY
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(rootRef.current)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [resetKey, scrollPosition, restoreScroll,minCardWidth])
  useEffect(() => {
    if (hasMore && !loading && !error && windowState.last >= rows - 1) callback.current()
  }, [hasMore, loading, error, rows, windowState.last])
  const visible = []
  for (let row = windowState.first; row <= Math.min(rows - 1, windowState.last); row++) {
    visible.push(<div className="shop-virtual-row" key={row} style={{ top: row * ROW_HEIGHT, gridTemplateColumns: `repeat(${windowState.columns},minmax(0,1fr))` }}>
      {items.slice(row * windowState.columns, (row + 1) * windowState.columns).map(renderItem)}
    </div>)
  }
  return <div ref={rootRef} className="shop-grid shop-virtual-grid" aria-busy={loading} style={{ height }} data-loaded-count={items.length}>
    {items.length ? visible : empty}
    {hasMore && <div className="shop-infinite-status" style={{ top: rows * ROW_HEIGHT }} role="status">{loading ? '아이템을 더 불러오는 중입니다.' : error ? <button onClick={() => loadMore(true)}>다시 불러오기</button> : '아래로 스크롤하면 더 볼 수 있습니다.'}</div>}
  </div>
}
