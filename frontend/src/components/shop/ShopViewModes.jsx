export default function ShopViewModes({ mode, onChange }) {
  return <div className="shop-view-controls" role="group" aria-label="미리보기 조작 모드">
    <button aria-pressed={mode === 'move'} onClick={() => onChange('move')}>이동 모드</button>
    <button aria-pressed={mode === 'rotate'} onClick={() => onChange('rotate')}>회전 모드</button>
  </div>
}
