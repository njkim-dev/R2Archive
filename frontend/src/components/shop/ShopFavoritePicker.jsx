import { useEffect, useRef, useState } from 'react'
import { Star, X } from 'lucide-react'
import { getShopItems } from '../../api/shop'
import { OPTIONAL_SLOT_LABELS, SLOT_LABELS } from '../../utils/shopUrl'
import ShopImage from './ShopImage'

export default function ShopFavoritePicker({ slot, sex, version, selected, favorites, onChoose, onClose }) {
  const dialog = useRef(null)
  const generation = useRef(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState({ items: [], more: false, next: '', total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    const body = document.body, previousOverflow = body.style.overflow, previousPadding = body.style.paddingRight
    const gutter = window.innerWidth - document.documentElement.clientWidth
    body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`
    body.style.overflow = 'hidden'
    node.showModal()
    return () => { node.close(); body.style.overflow = previousOverflow; body.style.paddingRight = previousPadding }
  }, [])
  useEffect(() => {
    const context = { controller: new AbortController(), busy: false }
    generation.current = context
    setPage({ items: [], more: false, next: '', total: 0 }); setError(''); setLoading(true)
    const timer = setTimeout(() => load(context, ''), query ? 220 : 0)
    return () => { clearTimeout(timer); context.controller.abort() }
  }, [slot, sex, version, query])
  async function load(context, cursor) {
    if (context !== generation.current || context.busy) return
    context.busy = true; setLoading(true); setError('')
    try {
      const data = await getShopItems({ version, sex, slot, department: 'wearable', favorites_only: true, preview_only: true, q: query, cursor, page_size: 24 }, context.controller.signal)
      if (context.controller.signal.aborted || context !== generation.current) return
      setPage(old => ({ items: cursor ? [...old.items, ...data.items.filter(item => !old.items.some(i => i.id === item.id))] : data.items, more: data.has_more, next: data.next_cursor, total: data.total ?? old.total }))
    } catch (failure) {
      if (!context.controller.signal.aborted && context === generation.current) setError(failure.response?.data?.detail || '즐겨찾기 목록을 불러오지 못했습니다.')
    } finally {
      context.busy = false
      if (!context.controller.signal.aborted && context === generation.current) setLoading(false)
    }
  }
  const items = page.items.filter(item => favorites.ids.has(item.id))
  return <dialog className="shop-favorite-picker" ref={dialog} aria-labelledby="shop-favorite-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
  }}>
    <header><h2 id="shop-favorite-title">{SLOT_LABELS[slot]} 즐겨찾기</h2><button aria-label="즐겨찾기 목록 닫기" onClick={onClose}><X size={19} /></button></header>
    <label className="shop-search"><input type="search" aria-label="즐겨찾기 이름으로 검색" maxLength={120} placeholder="즐겨찾기에서 이름으로 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="shop-favorite-status" role="status">{loading ? '즐겨찾기를 불러오는 중입니다.' : error || favorites.error || '현재 성별과 부위에 맞는 미리보기 가능 아이템입니다.'}</div>
    <div className="shop-favorite-results" aria-busy={loading}>
      <button className="shop-favorite-default" onClick={() => onChoose(null)}>{OPTIONAL_SLOT_LABELS[slot] ? '선택 해제' : `기본 ${SLOT_LABELS[slot]} 사용`}</button>
      <div className="shop-favorite-items">{items.map(item => <article key={item.id} data-item-id={item.id}>
        <button className="shop-favorite-choose" aria-label={`${item.name} 착용`} aria-pressed={selected?.id === item.id} onClick={() => onChoose(item)}><ShopImage item={item} /><span>{item.name}</span></button>
        <button className="shop-favorite-remove" aria-label={`${item.name} 즐겨찾기 해제`} disabled={favorites.pending.has(item.id)} onClick={() => favorites.toggle(item)}><Star size={17} fill="currentColor" /></button>
      </article>)}</div>
      {!loading && !error && !items.length && !page.more && <p className="shop-favorite-empty">표시할 즐겨찾기가 없습니다.<br />아이템 목록에서 ☆를 눌러 등록해주세요.</p>}
    </div>
    <footer>{error ? <button onClick={() => load(generation.current, page.next || '')}>다시 불러오기</button> : page.more ? <button disabled={loading} onClick={() => load(generation.current, page.next)}>더 불러오기</button> : <span>즐겨찾기 변경은 계정에 저장됩니다.</span>}</footer>
  </dialog>
}
