import { lockShopScroll } from './shopModalScroll'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { createShortUrl } from '../../api/shopSharing'
import { getShopItem } from '../../api/shop'
import { coupleShareUrl, SHOP_SLOTS } from '../../utils/shopUrl'
import ShopViewModes from './ShopViewModes'
import ShopViewer from './ShopViewer'


export default function ShopCouplePreview({ selection, meta, onStart, onClose }) {
  const dialog = useRef(null)
  const [camera, setCamera] = useState({ angle: selection.angle ?? 180, zoom: selection.zoom ?? 100, panX: selection.panX ?? 0, panY: selection.panY ?? 0 })
  const [mode, setMode] = useState('rotate')
  const [actors, setActors] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [fallback, setFallback] = useState('')
  const timer = useRef(null)
  const fallbackInput = useRef(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; clearTimeout(timer.current) } }, [])
  useEffect(() => { if (fallback) { fallbackInput.current?.focus(); fallbackInput.current?.select() } }, [fallback])
  async function copy() {
    let url
    try { url = await createShortUrl(coupleShareUrl({ version: meta.revision, ...selection, ...camera })) } catch { if (active.current) { setToast('공유 URL을 만들지 못했습니다. 다시 시도해주세요.'); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2600) } return }
    if (!active.current) return
    setFallback('')
    let copied = true
    try { await navigator.clipboard.writeText(url) } catch { copied = false }
    if (!active.current) return
    if (!copied) setFallback(url)
    const message = copied ? 'URL을 복사했습니다' : 'URL을 직접 복사해주세요'
    clearTimeout(timer.current); setToast(message); timer.current = setTimeout(() => setToast(''), 2600)
  }
  useLayoutEffect(() => {
    const node = dialog.current, release = lockShopScroll()
    node.showModal()
    return () => { node.close(); release() }
  }, [])
  useEffect(() => {
    let cancelled = false
    const chosen = { ...selection.slots }, partner = Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null]))
    Promise.all(SHOP_SLOTS.map(async slot => {
      if (['pet', 'accessory', 'summon'].includes(slot)) { chosen[slot] = null; return }
      const item = chosen[slot]
      if (!item) return
      if (item.sex === 'common') { partner[slot] = item; return }
      if (!item.counterpart_id) return
      const other = await getShopItem(item.counterpart_id, meta.revision)
      if (other.sex === (selection.sex === 'male' ? 'female' : 'male') && other.slot === slot && other.preview_available && other.model) partner[slot] = other
    })).then(() => {
      if (!cancelled) setActors(selection.sex === 'male' ? { male: chosen, female: partner } : { female: chosen, male: partner })
    }).catch(() => { if (!cancelled) setError('선택한 의상을 불러오지 못했습니다. 창을 닫고 다시 열어주세요.') })
    return () => { cancelled = true }
  }, [selection.slots, selection.sex, meta])
  return <dialog ref={dialog} className="shop-couple-dialog" aria-label="커플 모션 미리보기" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-couple-heading"><div><h2>커플 모션 미리보기</h2><p>{selection.item.name || `커플링 ${selection.item.id}`}</p></div><div className="shop-couple-actions"><button onClick={copy}><Copy size={16} /><span>URL 복사</span></button><button aria-label="커플 모션 미리보기 닫기" onClick={onClose}><X size={22} /><span>닫기</span></button></div></div>
    <div className="shop-couple-viewport">
      {actors && !error ? <ShopViewer meta={meta} sex="male" slots={actors.male} counterparts={actors.female} pair selectedSex={selection.sex} angle={camera.angle} zoom={camera.zoom} panX={camera.panX} panY={camera.panY} mode={mode} onViewChange={setCamera} couplePreview={selection.item.couple_preview} motion={selection.started ? selection.item.couple_preview : null} audioContext={selection.audioContext} audioReady={selection.audioReady} /> : <div className="shop-stage"><div className="shop-stage-status" role={error ? 'alert' : 'status'}>{error || '선택한 의상을 준비 중입니다.'}</div></div>}
      {!selection.started && actors && !error && <div className="shop-couple-start"><button onClick={onStart}>커플 모션 시작</button><p>버튼을 누르면 모션과 소리가 함께 재생됩니다.</p></div>}
    </div>
    <ShopViewModes mode={mode} onChange={setMode} />
    <p className="shop-couple-note">선택하지 않은 부위와 대응 아이템이 없는 부위는 기본 의상으로 표시됩니다.</p>
    <p className="shop-couple-purchase-note">게임 내 아이템과는 차이가 있을 수 있습니다. 반드시 인 게임에서 상세히 확인 후 구매하시기 바랍니다.</p>
    {toast && <div className="shop-toast" role="status" aria-live="polite"><Check size={16} />{toast}</div>}
    {fallback && <div className="shop-couple-copy-fallback" role="dialog" aria-label="커플 모션 URL 직접 복사"><div><b>URL 직접 복사</b><button aria-label="커플 모션 URL 직접 복사 닫기" onClick={() => setFallback('')}><X size={16} /></button></div><input ref={fallbackInput} aria-label="커플 모션 공유 URL" value={fallback} readOnly onFocus={event => event.target.select()} /></div>}
  </dialog>
}
