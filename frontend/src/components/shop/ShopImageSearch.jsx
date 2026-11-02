import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { searchShopImage } from '../../api/shop'
import { lockShopScroll } from './shopModalScroll'

const labels = { hair: '머리', top: '상의', bottom: '하의', shoes: '스케이트' }

export default function ShopImageSearch({ version, onChoose, onClose }) {
  const dialog = useRef(null), controller = useRef(null), submitting = useRef(false), loading = useRef(0)
  const [sex, setSex] = useState('auto'), [slot, setSlot] = useState('all')
  const [source, setSource] = useState(null), [includeUnreleased, setIncludeUnreleased] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null), [seconds, setSeconds] = useState(0)
  useLayoutEffect(() => {
    const release = lockShopScroll(), node = dialog.current
    node.showModal()
    return () => { loading.current++; node.close(); release(); controller.current?.abort() }
  }, [])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => {
    if (!busy) return
    const start = Date.now(), timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])
  const resetResults = () => { setResult(null); setError('') }
  function loadFile(file) {
    if (!file || submitting.current) return
    const token = ++loading.current
    resetResults()
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('8MB 이하의 PNG, JPG, WEBP 이미지를 선택해주세요.'); return
    }
    const url = URL.createObjectURL(file), image = new window.Image()
    image.onload = () => {
      if (!dialog.current?.isConnected || token !== loading.current) { URL.revokeObjectURL(url); return }
      if (image.naturalWidth * image.naturalHeight > 16000000 || Math.max(image.naturalWidth, image.naturalHeight) > 4096 || Math.min(image.naturalWidth, image.naturalHeight) < 16) {
        URL.revokeObjectURL(url); setError('이미지는 16~4096px, 전체 1600만 화소 이하로 선택해주세요.'); return
      }
      setSource({ url, file, width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => { URL.revokeObjectURL(url); if (token === loading.current) setError('이미지를 읽을 수 없습니다.') }
    image.src = url
  }
  useEffect(() => {
    const paste = event => {
      if (submitting.current) return
      const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'))
      if (!item) return
      const file = item.getAsFile()
      if (file) { event.preventDefault(); loadFile(file) }
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (!source || submitting.current) return
    submitting.current = true; setBusy(true); setSeconds(0); setError(''); setResult(null)
    controller.current = new AbortController()
    try {
      const found = await searchShopImage({ image: source.file, sex, slot, version, includeUnreleased, mode: 'terra' }, controller.current.signal)
      if (dialog.current?.isConnected) setResult(found)
    } catch (failure) {
      if (failure.code !== 'ERR_CANCELED' && failure.name !== 'AbortError' && dialog.current?.isConnected) {
        const detail = failure.response?.data?.detail
        setError(typeof detail === 'string' ? detail : failure.isAxiosError ? failure.response?.status === 429 ? '검색 요청이 많습니다. 잠시 후 다시 시도해주세요.' : '이미지 검색에 실패했습니다. 잠시 후 다시 시도해주세요.' : failure.message || '이미지 검색에 실패했습니다.')
      }
    } finally { submitting.current = false; setBusy(false) }
  }
  const groups = result?.groups || (result?.items ? [{ slot, items: result.items }] : [])
  return <dialog ref={dialog} className="shop-image-search-dialog" aria-label="이미지로 아이템 찾기" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-image-search-heading"><h2>이미지로 아이템 찾기</h2><button aria-label="이미지 검색 닫기" onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={submit}>
      <p className="shop-image-search-intro">전체 캐릭터 이미지를 선택하거나 Ctrl+V로 붙여넣으세요. 부위는 자동으로 인식합니다.</p>
      <div className="shop-image-search-controls"><label>캐릭터 성별<select aria-label="검색할 캐릭터 성별" value={sex} disabled={busy} onChange={e => { setSex(e.target.value); resetResults() }}><option value="auto">자동 인식</option><option value="female">여성</option><option value="male">남성</option></select></label><label>찾을 부위<select aria-label="찾을 부위" value={slot} disabled={busy} onChange={e => { setSlot(e.target.value); resetResults() }}><option value="all">전체</option>{Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="shop-image-search-upload"><ImagePlus size={17} /> 이미지 선택<input aria-label="검색 이미지" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { loadFile(event.target.files?.[0]); event.target.value = '' }} /></label></div>
      <div className="shop-image-search-workspace">
        {source ? <img className="shop-image-search-original" src={source.url} alt="검색할 캐릭터 원본 이미지" /> : <p>캐릭터 이미지를 선택하거나 Ctrl+V로 붙여넣으세요.<br /><small>PNG · JPG · WEBP, 최대 8MB</small></p>}
      </div>
      <p className="shop-image-search-privacy">아이템 분석을 위해 이미지가 OpenAI로 전송됩니다. 이 사이트에는 업로드 이미지를 저장하지 않습니다.</p>
      <div className="shop-image-search-submit"><label><input type="checkbox" checked={includeUnreleased} disabled={busy} onChange={e => { setIncludeUnreleased(e.target.checked); resetResults() }} /> 미출시 아이템 포함</label><button type="submit" disabled={!source || busy}>{busy ? '검색 중…' : '비슷한 아이템 찾기'}</button></div>
      <div className="shop-image-search-status" aria-live="polite"><span role={error ? 'alert' : undefined}>{error || (busy ? `캐릭터의 아이템을 찾고 있습니다. ${seconds}초 경과` : result ? '검색 후보입니다. 정확한 일치가 아닐 수 있으니 아이템을 선택해 확인해주세요.' : '머리·상의·하의·스케이트를 한 번에 찾을 수 있습니다.')}</span></div>
      <div className="shop-image-search-results" aria-busy={busy}>{groups.map(group => <section className="shop-image-search-group" key={group.slot}><h3>{labels[group.slot] || '검색 결과'}{group.exact_match_supported === false && <small>일치 여부 확인 필요</small>}</h3><div>{group.items?.length ? group.items.map((item, index) => <button type="button" key={item.id} onClick={() => onChoose(item)}><span>{index + 1}</span><img src={item.thumbnail} alt="" /><strong>{item.name}</strong>{item.is_unreleased && <small>미출시</small>}</button>) : <p>일치하는 후보를 찾지 못했습니다.</p>}</div></section>)}</div>
    </form>
  </dialog>
}
