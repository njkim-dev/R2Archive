import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { searchShopImage } from '../../api/shop'
import { lockShopScroll } from './shopModalScroll'

const initialRegion = slot => slot === 'hair' ? { x: 0, y: 0, w: 1, h: .38 } : { x: 0, y: .3, w: 1, h: .38 }
const bounded = n => Math.max(0, Math.min(1, n))

export default function ShopImageSearch({ sex: initialSex, version, onChoose, onClose }) {
  const dialog = useRef(null), area = useRef(null), drag = useRef(null), controller = useRef(null), submitting = useRef(false)
  const [sex, setSex] = useState(initialSex || 'female'), [slot, setSlot] = useState('hair')
  const [source, setSource] = useState(null), [region, setRegion] = useState(initialRegion('hair'))
  const [includeUnreleased, setIncludeUnreleased] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [items, setItems] = useState(null)
  useLayoutEffect(() => {
    const release = lockShopScroll(), node = dialog.current
    node.showModal()
    return () => { node.close(); release(); controller.current?.abort() }
  }, [])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])
  const resetResults = () => { setItems(null); setError('') }
  function changeSlot(next) { setSlot(next); setRegion(initialRegion(next)); resetResults() }
  function loadFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    resetResults()
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('8MB 이하의 PNG, JPG, WEBP 이미지를 선택해주세요.'); return
    }
    const url = URL.createObjectURL(file), image = new window.Image()
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > 16000000 || Math.max(image.naturalWidth, image.naturalHeight) > 4096 || Math.min(image.naturalWidth, image.naturalHeight) < 16) {
        URL.revokeObjectURL(url); setError('이미지는 16~4096px, 전체 1600만 화소 이하로 선택해주세요.'); return
      }
      if (!dialog.current?.isConnected) { URL.revokeObjectURL(url); return }
      setSource({ url, image, width: image.naturalWidth, height: image.naturalHeight }); setRegion(initialRegion(slot))
    }
    image.onerror = () => { URL.revokeObjectURL(url); setError('이미지를 읽을 수 없습니다.') }
    image.src = url
  }
  function position(event) {
    const rect = area.current.getBoundingClientRect()
    return { x: bounded((event.clientX - rect.left) / rect.width), y: bounded((event.clientY - rect.top) / rect.height) }
  }
  function startDrag(event) {
    if (busy || event.button !== 0) return
    event.preventDefault(); area.current.setPointerCapture(event.pointerId)
    drag.current = position(event); resetResults()
  }
  function moveDrag(event) {
    if (!drag.current) return
    const end = position(event), start = drag.current
    setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.max(.02, Math.abs(start.x - end.x)), h: Math.max(.02, Math.abs(start.y - end.y)) })
  }
  function changeRegion(key, raw) {
    const value = Number(raw) / 100
    setRegion(old => {
      const next = { ...old, [key]: value }
      next.x = Math.min(next.x, 1 - next.w); next.y = Math.min(next.y, 1 - next.h)
      next.w = Math.min(next.w, 1 - next.x); next.h = Math.min(next.h, 1 - next.y)
      return next
    })
    resetResults()
  }
  async function submit(event) {
    event.preventDefault()
    if (!source || submitting.current) return
    submitting.current = true; setBusy(true); setError(''); setItems(null)
    controller.current = new AbortController()
    try {
      const x = Math.round(region.x * source.width), y = Math.round(region.y * source.height)
      const w = Math.max(16, Math.min(source.width - x, Math.round(region.w * source.width)))
      const h = Math.max(16, Math.min(source.height - y, Math.round(region.h * source.height)))
      if (w < 16 || h < 16 || source.width - x < 16 || source.height - y < 16) throw new Error('검색할 영역을 조금 더 크게 선택해주세요.')
      const scale = Math.min(1, 1024 / Math.max(w, h)), canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
      const context = canvas.getContext('2d')
      context.fillStyle = 'rgb(31, 46, 64)'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source.image, x, y, w, h, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95))
      if (!blob) throw new Error('이미지를 준비하지 못했습니다. 다시 선택해주세요.')
      const result = await searchShopImage({ image: blob, sex, slot, version, includeUnreleased }, controller.current.signal)
      setItems(result.items)
    } catch (failure) {
      if (failure.code !== 'ERR_CANCELED' && failure.name !== 'AbortError') {
        const detail = failure.response?.data?.detail
        setError(typeof detail === 'string' ? detail : failure.isAxiosError ? failure.response?.status === 429 ? '검색 요청이 많습니다. 잠시 후 다시 시도해주세요.' : '이미지 검색에 실패했습니다. 잠시 후 다시 시도해주세요.' : failure.message || '이미지 검색에 실패했습니다.')
      }
    } finally { submitting.current = false; setBusy(false) }
  }
  const size = source ? Math.min(1, 560 / source.width, 350 / source.height) : 1
  return <dialog ref={dialog} className="shop-image-search-dialog" aria-label="이미지로 아이템 찾기" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-image-search-heading"><h2>이미지로 아이템 찾기</h2><button aria-label="이미지 검색 닫기" onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={submit}>
      <p className="shop-image-search-intro">찾을 머리나 상의만 들어오도록 영역을 선택해주세요.</p>
      <div className="shop-image-search-controls"><label>캐릭터 성별<select aria-label="검색할 캐릭터 성별" value={sex} disabled={busy} onChange={e => { setSex(e.target.value); resetResults() }}><option value="female">여성</option><option value="male">남성</option></select></label><label>찾을 부위<select aria-label="찾을 부위" value={slot} disabled={busy} onChange={e => changeSlot(e.target.value)}><option value="hair">머리</option><option value="top">상의</option></select></label><label className="shop-image-search-upload"><ImagePlus size={17} /> 이미지 선택<input aria-label="검색 이미지" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={loadFile} /></label></div>
      <div className="shop-image-search-workspace">
        {source ? <div ref={area} className="shop-image-search-crop" style={{ width: source.width * size, aspectRatio: `${source.width}/${source.height}` }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <img src={source.url} alt="검색할 영역을 선택하는 원본 이미지" draggable="false" /><div className="shop-image-search-selection" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${Math.min(region.w, 1 - region.x) * 100}%`, height: `${Math.min(region.h, 1 - region.y) * 100}%` }} />
        </div> : <p>캐릭터 이미지를 선택해주세요.<br /><small>PNG · JPG · WEBP, 최대 8MB</small></p>}
      </div>
      <div className="shop-image-search-region">{[['x', '왼쪽'], ['y', '위쪽'], ['w', '너비'], ['h', '높이']].map(([key, label]) => <label key={key}>{label}<input aria-label={`검색 영역 ${label}`} type="range" min={key === 'w' || key === 'h' ? 2 : 0} max="100" value={Math.round(region[key] * 100)} disabled={!source || busy} onChange={e => changeRegion(key, e.target.value)} /></label>)}</div>
      <div className="shop-image-search-submit"><label><input type="checkbox" checked={includeUnreleased} disabled={busy} onChange={e => { setIncludeUnreleased(e.target.checked); resetResults() }} /> 미출시 아이템 포함</label><button type="submit" disabled={!source || busy}>{busy ? '검색 중…' : '비슷한 아이템 찾기'}</button></div>
      <div className="shop-image-search-status" aria-live="polite"><span role={error ? 'alert' : undefined}>{error || (busy ? '선택한 영역과 비슷한 아이템을 찾고 있습니다.' : items ? items.length ? '비슷한 순서로 표시합니다. 아이템을 선택해 확인해보세요.' : '검색 가능한 후보가 없습니다. 부위와 성별을 확인해주세요.' : '업로드한 이미지는 검색 후 보관하지 않습니다.')}</span></div>
      <div className="shop-image-search-results" aria-busy={busy}>{items?.map((item, index) => <button type="button" key={item.id} onClick={() => onChoose(item)}><span>{index + 1}</span><img src={item.thumbnail} alt="" /><strong>{item.name}</strong>{item.is_unreleased && <small>미출시</small>}</button>)}</div>
    </form>
  </dialog>
}
