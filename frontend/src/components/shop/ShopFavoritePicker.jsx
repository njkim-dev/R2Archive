import { lockShopScroll } from './shopModalScroll'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Star, X } from 'lucide-react'
import { getShopItems } from '../../api/shop'
import { SLOT_LABELS } from '../../utils/shopUrl'
import ShopImage from './ShopImage'

export default function ShopFavoritePicker({ slot, sex, version, selected, favorites, onChoose, onClose }) {
  const dialog = useRef(null), viewport = useRef(null)
  const [query, setQuery] = useState(''), [all, setAll] = useState([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [window, setWindow] = useState({ top: 0, height: 400, columns: 2 })
  useLayoutEffect(() => {
    const node = dialog.current, release = lockShopScroll()
    node.showModal()
    return () => { node.close(); release() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setAll([])
    async function load() {
      const collected = new Map(), cursors = new Set()
      let cursor = ''
      do {
        const data = await getShopItems({ version, sex, slot, department: 'wearable', favorites_only: true, preview_only: true, cursor, page_size: 60 }, controller.signal)
        if (controller.signal.aborted) return
        for (const item of data.items) collected.set(item.id, item)
        setAll([...collected.values()])
        cursor = data.has_more ? data.next_cursor : ''
        if (cursor && cursors.has(cursor)) throw new Error('즐겨찾기 목록을 다시 불러와주세요.')
        cursors.add(cursor)
      } while (cursor)
    }
    load().catch(failure => { if (!controller.signal.aborted) setError(typeof failure.response?.data?.detail === 'string' ? failure.response.data.detail : '즐겨찾기 목록을 불러오지 못했습니다.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [slot, sex, version, retry])
  useEffect(() => {
    const node = viewport.current
    let frame
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setWindow({ top: node.scrollTop, height: node.clientHeight, columns: node.clientWidth < 380 ? 1 : 2 })) }
    const observer = new ResizeObserver(update); observer.observe(node); node.addEventListener('scroll', update, { passive: true }); update()
    return () => { observer.disconnect(); node.removeEventListener('scroll', update); cancelAnimationFrame(frame) }
  }, [])
  useEffect(() => { viewport.current.scrollTop = 0; setWindow(old => ({ ...old, top: 0 })) }, [query])
  const items = useMemo(() => { const name = query.trim().toLocaleLowerCase(); return all.filter(item => favorites.ids.has(item.id) && item.name.toLocaleLowerCase().includes(name)) }, [all, favorites.ids, query])
  const rowHeight = 100, first = Math.max(0, Math.floor(window.top / rowHeight) - 2) * window.columns
  const last = Math.min(items.length, (Math.ceil((window.top + window.height) / rowHeight) + 2) * window.columns)
  async function clear() {
    if (globalThis.confirm(`등록된 ${SLOT_LABELS[slot]} 즐겨찾기가 전부 제거됩니다. 계속 하시겠습니까?`)) await favorites.clear(slot)
  }
  return <dialog className="shop-favorite-picker" ref={dialog} aria-labelledby="shop-favorite-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id="shop-favorite-title">{SLOT_LABELS[slot]} 즐겨찾기</h2><div className="shop-favorite-heading-actions"><button disabled={loading || favorites.clearing || favorites.pending.size > 0 || !favorites.ids.size} onClick={clear}>즐겨찾기 초기화</button><button aria-label="즐겨찾기 목록 닫기" onClick={onClose}><X size={19} /></button></div></header>
    <label className="shop-search"><input type="search" aria-label="즐겨찾기 이름으로 검색" maxLength={120} placeholder="즐겨찾기에서 이름으로 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="shop-favorite-status" role="status">{favorites.clearing ? '즐겨찾기를 초기화하는 중입니다.' : loading ? '즐겨찾기를 불러오는 중입니다.' : error || favorites.error || `즐겨찾기 ${items.length.toLocaleString()}개`}</div>
    <div className="shop-favorite-results" ref={viewport} aria-busy={loading}>
      <div className="shop-favorite-virtual" style={{ height: Math.ceil(items.length / window.columns) * rowHeight }}>
        {items.slice(first, last).map((item, offset) => { const index = first + offset; return <article key={item.id} data-item-id={item.id} style={{ position: 'absolute', top: Math.floor(index / window.columns) * rowHeight, left: `${index % window.columns * 100 / window.columns}%`, width: `calc(${100 / window.columns}% - 8px)`, height: 90 }}>
          <button className="shop-favorite-choose" aria-label={`${item.name} 착용`} aria-pressed={selected?.id === item.id} onClick={() => onChoose(item)}><ShopImage item={item} /><span>{item.name}</span></button>
          <button className="shop-favorite-remove" aria-label={`${item.name} 즐겨찾기 해제`} disabled={favorites.clearing || favorites.pending.has(item.id)} onClick={() => favorites.toggle(item)}><Star size={17} fill="currentColor" /></button>
        </article> })}
      </div>
      {!loading && !error && !items.length && <p className="shop-favorite-empty">표시할 즐겨찾기가 없습니다.<br />아이템 목록에서 ☆를 눌러 등록해주세요.</p>}
    </div>
    <footer>{error ? <button onClick={() => setRetry(value => value + 1)}>다시 불러오기</button> : <span>즐겨찾기 변경은 계정에 저장됩니다.</span>}</footer>
  </dialog>
}
