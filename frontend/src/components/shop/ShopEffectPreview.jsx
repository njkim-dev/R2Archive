import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { lockShopScroll } from './shopModalScroll'
import ShopViewModes from './ShopViewModes'
import ShopViewer from './ShopViewer'

const empty = {}
const initialCamera = { angle: 180, zoom: 100, panX: 0, panY: 0 }

export default function ShopEffectPreview({ effect, effectLabel, stageClass, controlsClass = 'shop-effect-controls' }) {
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [camera, setCamera] = useState(initialCamera)
  const [mode, setMode] = useState('rotate')
  return <>
    <div className={stageClass}>
      <ShopViewer effectPreview={effect} effectPlaying={playing} effectLabel={effectLabel} slots={empty} counterparts={empty}
        {...camera} mode={mode} onViewChange={setCamera} disposeContext />
    </div>
    <div className={controlsClass}>
      <ShopViewModes mode={mode} onChange={setMode} />
      <div className="shop-view-controls"><button type="button" onClick={() => setPlaying(value => !value)}>{playing ? '일시정지' : '재생'}</button></div>
    </div>
  </>
}

export function ShopEffectDialog({ item, onClose }) {
  const dialog = useRef(null)
  useLayoutEffect(() => {
    const node = dialog.current
    const unlock = lockShopScroll()
    node.showModal()
    return () => { node.close(); unlock() }
  }, [])

  return <dialog ref={dialog} className="shop-couple-dialog shop-effect-dialog" aria-label="장식 미리보기"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-couple-heading">
      <div><h2>장식 미리보기</h2><p>{item.name}</p></div>
      <button type="button" onClick={onClose}><X size={20} aria-hidden="true" /> 닫기</button>
    </div>
    <ShopEffectPreview effect={item.effect_preview} effectLabel="장식 효과 3D 미리보기" />
  </dialog>
}
