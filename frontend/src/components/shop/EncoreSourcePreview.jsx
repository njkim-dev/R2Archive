import { useState } from 'react'
import ShopEffectPreview from './ShopEffectPreview'

const shouldPlay = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches

function PlaybackButton({ playing, onToggle }) {
  return <button type="button" onClick={onToggle}>{playing ? '일시정지' : '재생'}</button>
}

export default function EncoreSourcePreview({ item }) {
  const [choice, setChoice] = useState(0)
  const [playing, setPlaying] = useState(shouldPlay)
  const [failedUrl, setFailedUrl] = useState(null)
  if (item.effectPreview) return <ShopEffectPreview effect={item.effectPreview}
    effectLabel={item.slot === 'accessory' ? '장식 효과 3D 미리보기' : undefined}
    stageClass="encore-stage" controlsClass="encore-preview-controls encore-source-controls" />

  const media = item.imagePreview
  const variant = media.variants?.[choice]
  const url = variant?.url ?? (playing ? media.animated : media.still)
  return <>
    <div className="encore-stage encore-image-stage">
      {failedUrl === url ? <p role="alert">미리보기 이미지를 불러오지 못했습니다.</p>
        : <img src={url} alt={variant ? `${item.name} ${variant.label} 미리보기` : `${item.name} 슬롯 배경 미리보기`}
          onError={() => setFailedUrl(url)} />}
    </div>
    <div className="encore-preview-controls">
      {media.variants
        ? <div className="encore-filter" role="group" aria-label="닉네임 장식 위치">
          {media.variants.map(({ label }, index) => <button type="button" key={label}
            aria-pressed={index === choice} onClick={() => setChoice(index)}>{label}</button>)}
        </div>
        : <div className="encore-filter"><PlaybackButton playing={playing} onToggle={() => setPlaying(value => !value)} /></div>}
    </div>
  </>
}
