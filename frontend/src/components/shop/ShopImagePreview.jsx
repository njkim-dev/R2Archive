import { useState } from 'react'
import ShopOutfitPreview from './ShopOutfitPreview'
import ShopViewer from './ShopViewer'
import ShopViewModes from './ShopViewModes'

const counterparts = {}

export default function ShopImagePreview({ meta, sex, items, onClose, canVote, feedback, onVote }) {
  const [camera, setCamera] = useState({ angle: 180, zoom: 100, panX: 0, panY: 0 })
  const [mode, setMode] = useState('rotate')
  const available = items.filter(item => item.preview_available && item.model)
  const missing = items.filter(item => !item.preview_available || !item.model)
  const [slots] = useState(() => Object.fromEntries(available.map(item => [item.slot, item])))
  return <ShopOutfitPreview onClose={onClose} className="shop-image-preview-dialog">
    {missing.length > 0 && <p className="shop-image-preview-warning" role="status">3D 모델이 없어 적용하지 못한 아이템: {missing.map(item => item.name).join(', ')}</p>}
    <ShopViewer meta={meta} sex={sex} slots={slots} counterparts={counterparts} pair={false} {...camera} mode={mode} onViewChange={setCamera} disposeContext />
    <ShopViewModes mode={mode} onChange={setMode} />
    <div className="shop-image-preview-items">{available.map(item => <span key={item.id}>{item.name}</span>)}</div>
    <section className="shop-image-preview-feedback" aria-label="의상 미리보기 평가">
      <p>해당 의상이 맞나요?</p>
      <div><button type="button" disabled={!canVote || feedback?.pending} aria-pressed={feedback?.value === 1} onClick={() => onVote(available, 1)}>맞아요</button><button type="button" disabled={!canVote || feedback?.pending} aria-pressed={feedback?.value === -1} onClick={() => onVote(available, -1)}>아니에요</button></div>
      <span className="shop-image-preview-feedback-status" role={feedback?.error ? 'alert' : 'status'}>{!canVote ? '이 검색을 요청한 사용자만 평가할 수 있습니다.' : feedback?.pending ? '평가를 저장하고 있습니다.' : feedback?.message || ''}</span>
    </section>
  </ShopOutfitPreview>
}
