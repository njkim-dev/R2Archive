import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getShopItem } from '../../api/shop'
import { SHOP_SLOTS } from '../../utils/shopUrl'
import ShopViewer from './ShopViewer'


export default function ShopCouplePreview({ selection, meta, onClose }) {
  const dialog = useRef(null)
  const [actors, setActors] = useState(null)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const node = dialog.current, body = document.body
    const overflow = body.style.overflow, padding = body.style.paddingRight
    const gutter = window.innerWidth - document.documentElement.clientWidth
    body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`
    body.style.overflow = 'hidden'; node.showModal()
    return () => { node.close(); body.style.overflow = overflow; body.style.paddingRight = padding }
  }, [])
  useEffect(() => {
    let cancelled = false
    const chosen = { ...selection.slots }, partner = Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null]))
    Promise.all(SHOP_SLOTS.map(async slot => {
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
  }, [selection, meta])
  return <dialog ref={dialog} className="shop-couple-dialog" aria-label="커플 모션 미리보기" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-couple-heading"><div><h2>커플 모션 미리보기</h2><p>{selection.item.name || `커플링 ${selection.item.id}`}</p></div><button aria-label="커플 모션 미리보기 닫기" onClick={onClose}><X size={22} /><span>닫기</span></button></div>
    {actors && !error ? <ShopViewer meta={meta} sex="male" slots={actors.male} counterparts={actors.female} pair angle={180} zoom={100} motion={selection.item.couple_preview} audioContext={selection.audioContext} audioReady={selection.audioReady} /> : <div className="shop-stage"><div className="shop-stage-status" role={error ? 'alert' : 'status'}>{error || '선택한 의상을 준비 중입니다.'}</div></div>}
    <p className="shop-couple-note">선택하지 않은 부위와 대응 아이템이 없는 부위는 기본 의상으로 표시됩니다.</p>
  </dialog>
}
