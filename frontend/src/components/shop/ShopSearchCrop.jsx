import { useRef } from 'react'

export default function ShopSearchCrop({ source, crop, onChange, disabled, children }) {
  const area = useRef(null), drag = useRef(null)
  const position = event => { const box = area.current.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1000, (event.clientX - box.left) / box.width * 1000))), Math.round(Math.max(0, Math.min(1000, (event.clientY - box.top) / box.height * 1000)))] }
  function down(event) {
    if (disabled || event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const point = position(event), handle = event.target.dataset.handle
    drag.current = { point, crop, handle, move: !handle && crop && point[0] > crop[0] && point[0] < crop[2] && point[1] > crop[1] && point[1] < crop[3] }
    if (!drag.current.move && !handle) onChange(null)
  }
  function move(event) {
    const state = drag.current
    if (!state || disabled) return
    const point = position(event)
    if (state.move) {
      const [x,y,right,bottom] = state.crop, dx = Math.min(1000 - right, Math.max(-x, point[0] - state.point[0])), dy = Math.min(1000 - bottom, Math.max(-y, point[1] - state.point[1]))
      onChange([x + dx, y + dy, right + dx, bottom + dy])
    } else if (state.handle) {
      const next = [...state.crop], [x,y] = point
      if (state.handle.includes('l')) next[0] = Math.min(next[2] - 1, x)
      if (state.handle.includes('r')) next[2] = Math.max(next[0] + 1, x)
      if (state.handle.includes('t')) next[1] = Math.min(next[3] - 1, y)
      if (state.handle.includes('b')) next[3] = Math.max(next[1] + 1, y)
      onChange(next)
    } else {
      const [x,y] = state.point
      if (Math.abs(point[0] - x) >= 1 && Math.abs(point[1] - y) >= 1) onChange([Math.min(x,point[0]), Math.min(y,point[1]), Math.max(x,point[0]), Math.max(y,point[1])])
    }
  }
  function adjust(index, value) {
    const previous = crop || [0,0,1000,1000], [x,y,right,bottom] = previous, w = right - x, h = bottom - y
    onChange(index === 0 ? [value,y,value+w,bottom] : index === 1 ? [x,value,right,value+h] : index === 2 ? [x,y,x+value,bottom] : [x,y,right,y+value])
  }
  const [x,y,right,bottom] = crop || [0,0,1000,1000]
  return <>
    <p className="shop-image-search-crop-prompt">{source ? '검색에 사용할 부분을 지정해주세요' : ''}</p>
    <div className="shop-image-search-workspace">{source ? <div className="shop-image-search-crop-image"><img className="shop-image-search-original" src={source.url} alt="검색할 캐릭터 원본 이미지" draggable="false" /><svg ref={area} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="검색 영역 지정" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      {crop && <><path d={`M0 0H1000V1000H0Z M${x} ${y}V${bottom}H${right}V${y}Z`} fillRule="evenodd" /><rect className="shop-image-search-crop-box" x={x} y={y} width={right-x} height={bottom-y} />{!disabled && [['lt',x,y],['rt',right,y],['lb',x,bottom],['rb',right,bottom]].map(([key,cx,cy]) => <circle key={key} data-handle={key} cx={cx} cy={cy} r="18" />)}</>}
    </svg></div> : children}</div>
    <fieldset className="shop-image-search-crop-controls" disabled={disabled || !source}>
      <div className="shop-image-search-crop-tools"><span>{crop && source ? `${Math.round((right-x)*source.width/1000)} × ${Math.round((bottom-y)*source.height/1000)}px` : '이미지 위를 드래그해서 영역을 선택하세요.'}</span><button type="button" onClick={() => onChange([0,0,1000,1000])}>전체 이미지 사용</button><button type="button" disabled={!crop || disabled || !source} onClick={() => onChange(null)}>영역 다시 지정</button></div>
      <div className="shop-image-search-crop-sliders">{[['왼쪽',x,1000-(right-x)],['위쪽',y,1000-(bottom-y)],['너비',right-x,1000-x],['높이',bottom-y,1000-y]].map(([label,value,max],index) => <label key={label}>{label}<input type="range" aria-label={`검색 영역 ${label}`} min={index < 2 ? 0 : 1} max={max} value={value} onChange={event => adjust(index,Number(event.target.value))} /></label>)}</div>
    </fieldset>
  </>
}
