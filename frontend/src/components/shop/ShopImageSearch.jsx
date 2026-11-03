import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Minus, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { getSharedShopImage, getShopImageEstimate, publishShopImage, rateShopImage, recordShopImageAction, searchShopImage } from '../../api/shop'
import { lockShopScroll } from './shopModalScroll'
import ShopSearchCrop from './ShopSearchCrop'
import ShopImagePreview from './ShopImagePreview'
import { searchCropFile } from '../../utils/shopSearchImage'
import { notifyImageFeedback } from '../../utils/shopImageFeedback'
import { searchEstimate, searchProgress } from '../../utils/shopImageEstimate'

const labels = { hair: '머리', top: '상의', bottom: '하의', shoes: '스케이트' }
const resultMessage = 'AI 검색 결과는 정확하지 않을 수 있습니다.\n결과가 올바르다면 좋아요를, 틀렸다면 싫어요를 눌러주세요.\n여러분의 참여가 품질을 개선하고 다른 사용자에게 더 좋은 서비스를 제공하게 됩니다.'
const failureText = failure => typeof failure.response?.data?.detail === 'string' ? failure.response.data.detail : failure.response?.status === 429 ? '검색 요청이 많습니다. 잠시 후 다시 시도해주세요.' : failure.message || '요청을 완료하지 못했습니다. 다시 시도해주세요.'

export default function ShopImageSearch({ version, meta, onFavorite, onClose, restoreHost, authenticated, sharedToken, onRestartShared, onSharedVersion }) {
  const dialog = useRef(null), controller = useRef(null), submitting = useRef(false), loading = useRef(0), minimizedRef = useRef(false), voteLocks = useRef(new Set()), scroll = useRef(0), currentResult = useRef(null), mounted = useRef(true)
  const [crop, setCrop] = useState(null), [sharedLoading, setSharedLoading] = useState(!!sharedToken), [shareBusy, setShareBusy] = useState(false), [shareUrl, setShareUrl] = useState(''), [voteStatus, setVoteStatus] = useState({})
  const resultRef = useRef(null)
  const [sex, setSex] = useState(''), [slot, setSlot] = useState('all'), [source, setSource] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null), [seconds, setSeconds] = useState(0)
  const [estimate, setEstimate] = useState(null), [activeEstimate, setActiveEstimate] = useState(() => searchEstimate(null))
  const [previewItems, setPreviewItems] = useState(null)
  const [minimized, setMinimized] = useState(false), [selected, setSelected] = useState({}), [votes, setVotes] = useState({}), [votePending, setVotePending] = useState(new Set()), [actionBusy, setActionBusy] = useState(false), [notice, setNotice] = useState(''), [dragOver, setDragOver] = useState(false)
  minimizedRef.current = minimized
  currentResult.current = result?.search_id || null
  resultRef.current = result
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; loading.current++; controller.current?.abort() }
  }, [])
  useLayoutEffect(() => {
    if (minimized) return
    const node = dialog.current, release = lockShopScroll()
    node.showModal(); node.scrollTop = scroll.current
    return () => { scroll.current = node.scrollTop; node.close(); release() }
  }, [minimized])
  useEffect(() => () => { if (source?.file) URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => {
    if (!sharedToken) return
    const request = new AbortController()
    setSharedLoading(true); setError('')
    getSharedShopImage(sharedToken, request.signal).then(found => {
      if (request.signal.aborted) return
      if (found.version !== version) { onSharedVersion(found); return }
      setResult(found); setSex(found.sex); setSlot(found.slot); setSource({ url: found.image_url })
      setSelected(Object.fromEntries(found.groups.flatMap(group => { const item = group.items.find(item => found.selected_ids.includes(item.id)); return item ? [[group.slot,item]] : [] })))
      setVotes(Object.fromEntries((found.votes || []).map(vote => [`${vote.slot}:${vote.item_id}`, vote.value])))
    }).catch(failure => { if (!request.signal.aborted) setError(failureText(failure)) }).finally(() => { if (!request.signal.aborted) setSharedLoading(false) })
    return () => request.abort()
  }, [sharedToken, authenticated, version])
  useEffect(() => {
    if (!busy) return
    const start = Date.now(), timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])
  useEffect(() => {
    if (!authenticated || sharedToken) return
    const request = new AbortController()
    getShopImageEstimate(slot, request.signal).then(value => {
      if (!request.signal.aborted) setEstimate({ slot, value: searchEstimate(value, slot) })
    }).catch(() => {})
    return () => request.abort()
  }, [slot, authenticated, sharedToken])
  function resetResults() { setResult(null); setSelected({}); setVotes({}); setVoteStatus({}); setNotice(''); setError(''); setShareUrl('') }
  function loadFile(file) {
    if (!file || submitting.current || actionBusy || sharedToken || result) return
    const token = ++loading.current
    resetResults()
    if (file.size > 32 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('32MB 이하의 PNG, JPG, WEBP 이미지를 선택해주세요.'); return }
    const url = URL.createObjectURL(file), image = new window.Image()
    image.onload = () => {
      if (!mounted.current || token !== loading.current) { URL.revokeObjectURL(url); return }
      if (image.naturalWidth * image.naturalHeight > 64000000 || Math.max(image.naturalWidth, image.naturalHeight) > 16384 || Math.min(image.naturalWidth, image.naturalHeight) < 16) { URL.revokeObjectURL(url); setError('원본은 16~16384px, 전체 6400만 화소 이하로 선택해주세요.'); return }
      setSource({ url, file, width: image.naturalWidth, height: image.naturalHeight }); setCrop(null)
    }
    image.onerror = () => { URL.revokeObjectURL(url); if (mounted.current && token === loading.current) setError('이미지를 읽을 수 없습니다.') }
    image.src = url
  }
  const loadCurrent = useRef(loadFile); loadCurrent.current = loadFile
  useEffect(() => {
    const paste = event => {
      if (submitting.current || minimizedRef.current) return
      const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) { event.preventDefault(); loadCurrent.current(file) }
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [])
  function startAgain() {
    if (!authenticated || busy || actionBusy || shareBusy || sharedLoading) return
    if (sharedToken) { onRestartShared(sex); return }
    setCrop(null)
    loading.current++; setSource(null); setSex(''); setSlot('all'); resetResults(); setSeconds(0); scroll.current = 0
    if (dialog.current) dialog.current.scrollTop = 0
  }
  async function submit(event) {
    event.preventDefault()
    if (!authenticated || !source || !crop || !sex || submitting.current || result || sharedToken) return
    submitting.current = true; setActiveEstimate(estimate?.slot === slot ? estimate.value : searchEstimate(null, slot)); setBusy(true); setSeconds(0); resetResults()
    controller.current = new AbortController()
    try {
      const image = await searchCropFile(source, crop, controller.current.signal)
      const found = await searchShopImage({ image, sex, slot, version, mode: 'terra' }, controller.current.signal)
      if (mounted.current) { setSource({ url: URL.createObjectURL(image), file: image }); setResult(found) }
    } catch (failure) {
      if (failure.code !== 'ERR_CANCELED' && failure.name !== 'AbortError' && mounted.current) setError(failureText(failure))
    } finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  function logAction(action, items) {
    if (!result?.search_id) return
    recordShopImageAction(result.search_id, action, items).catch(() => {})
  }
  function toggle(item, groupSlot) {
    const removing = selected[groupSlot]?.id === item.id
    setSelected(previous => { const next = { ...previous }; if (removing) delete next[groupSlot]; else next[groupSlot] = item; return next })
    setNotice(''); setShareUrl(''); logAction(removing ? 'deselect' : 'select', [item])
  }
  async function vote(item, groupSlot, value) {
    const key = `${groupSlot}:${item.id}`, searchId = result?.search_id
    if (!authenticated || !searchId || voteLocks.current.has(key)) return
    const previous = votes[key] || 0, next = previous === value ? 0 : value
    voteLocks.current.add(key); setVotePending(new Set(voteLocks.current)); setVotes(old => ({ ...old, [key]: next })); setError('')
    setVoteStatus(old => ({ ...old, [key]: '저장 중…' }))
    try {
      const saved = await rateShopImage(searchId, groupSlot, item.id, next)
      notifyImageFeedback(searchId)
      if (mounted.current && currentResult.current === searchId) {
        setVotes(old => ({ ...old, [key]: saved.value }))
        setVoteStatus(old => ({ ...old, [key]: saved.value ? '평가 저장됨' : '평가 취소됨' }))
      }
    }
    catch (failure) { if (mounted.current && currentResult.current === searchId) { setVotes(old => ({ ...old, [key]: previous })); setVoteStatus(old => ({ ...old, [key]: '저장 실패' })); setError(failureText(failure)) } }
    finally { voteLocks.current.delete(key); if (mounted.current) setVotePending(new Set(voteLocks.current)) }
  }
  const chosen = Object.values(selected)
  async function favorite() {
    if (!authenticated || !chosen.length || actionBusy) return
    setActionBusy(true); setError(''); setNotice('')
    try {
      if (!await onFavorite(chosen)) throw new Error('일부 의상을 등록하지 못했습니다. 다시 시도해주세요.')
      logAction('favorite', chosen); if (mounted.current) setNotice('선택한 의상을 즐겨찾기에 등록했습니다.')
    } catch (failure) { if (mounted.current) setError(failureText(failure)) }
    finally { if (mounted.current) setActionBusy(false) }
  }
  function preview() {
    if (!chosen.length || actionBusy) return
    const unavailable = chosen.filter(item => !item.preview_available || !item.model)
    if (unavailable.length === chosen.length) { setError(''); setNotice(`선택한 아이템의 3D 모델이 없어 입어볼 수 없습니다: ${unavailable.map(item => item.name).join(', ')}`); return }
    logAction('preview', chosen); setPreviewItems(chosen)
  }
  async function saveResultUrl() {
    if (!result || shareBusy) return
    const entry = result
    setShareBusy(true); setError('')
    try {
      const url = entry.shared ? entry.url : (await publishShopImage(entry.search_id, chosen.map(item => String(item.id)))).url
      if (!mounted.current || resultRef.current !== entry) return
      setShareUrl(url)
      try { await navigator.clipboard.writeText(url); if (mounted.current) setNotice('결과 URL을 복사했습니다.') }
      catch { if (mounted.current) setNotice('결과 URL을 직접 복사해주세요.') }
    } catch (failure) { if (mounted.current && resultRef.current === entry) setError(failureText(failure)) }
    finally { if (mounted.current) setShareBusy(false) }
  }
  const sexHintId = useId()
  const needsSex = !sex && !result && !sharedToken
  const groups = result?.groups || (result?.items ? [{ slot, items: result.items }] : [])
  return <>
    {minimized && createPortal(<button className="shop-image-search-restore" onClick={() => setMinimized(false)}>이미지 검색 다시 열기{busy ? ` · 검색 중 ${seconds}초` : result ? ' · 결과 보기' : ''}</button>, restoreHost || document.body)}
    <dialog ref={dialog} className="shop-image-search-dialog" aria-label="이미지로 아이템 찾기" onCancel={event => { event.preventDefault(); setMinimized(true) }}>
      <div className="shop-image-search-heading"><h2>이미지로 아이템 찾기</h2><div><button type="button" aria-label="이미지 검색 최소화" onClick={() => setMinimized(true)}><Minus size={20} /></button><button type="button" aria-label="이미지 검색 닫기" onClick={onClose}><X size={20} /></button></div></div>
      <form onSubmit={submit}>
        <div id={sexHintId} className={`shop-image-search-sex-notice${needsSex ? ' is-required' : ''}`} role="status"><strong>{needsSex ? '필수 선택' : sex ? '선택 완료' : '확인 중'}</strong><span>{needsSex ? '검색 전 캐릭터 성별을 먼저 선택해주세요.' : sex ? `${sex === 'female' ? '여성' : '남성'} 캐릭터를 선택했습니다.` : '공유 결과의 성별을 불러오고 있습니다.'}</span></div>
        <div className="shop-image-search-controls"><label className={`shop-image-search-sex${needsSex ? ' is-required' : ''}`}><span>캐릭터 성별 <strong>필수</strong></span><select aria-label="검색할 캐릭터 성별" aria-describedby={sexHintId} required value={sex} disabled={busy || !!result || !!sharedToken} onChange={e => { setSex(e.target.value); resetResults() }}><option value="" disabled>성별을 선택해주세요</option><option value="female">여성</option><option value="male">남성</option></select></label><label>찾을 부위<select aria-label="찾을 부위" value={slot} disabled={busy || !!result || !!sharedToken} onChange={e => { setSlot(e.target.value); resetResults() }}><option value="all">전체</option>{Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="shop-image-search-upload"><ImagePlus size={17} /> 이미지 선택<input aria-label="검색 이미지" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !!result || !!sharedToken} onChange={event => { loadFile(event.target.files?.[0]); event.target.value = '' }} /></label></div>
        <div className={`shop-image-search-dropzone${dragOver ? ' is-dragging' : ''}`} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); if (!busy && !result && !sharedToken) setDragOver(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false) }} onDrop={event => { event.preventDefault(); setDragOver(false); if (!busy && !result && !sharedToken) loadFile(event.dataTransfer.files?.[0]) }}>
          {result ? <div className="shop-image-search-crop-summary"><p className="shop-image-search-crop-prompt">검색에 사용한 영역</p><div className="shop-image-search-workspace"><img className="shop-image-search-original" src={source?.url} alt="검색에 사용한 이미지" /></div></div> : <ShopSearchCrop source={source} crop={crop} onChange={setCrop} disabled={busy || !!sharedToken}><p>검색할 이미지를 끌어오세요. Ctrl + V로 붙여넣을 수도 있습니다.<br /><small>PNG · JPG · WEBP, 원본 최대 32MB</small></p></ShopSearchCrop>}
        </div>
        <div className="shop-image-search-submit">{result || sharedToken ? <><button type="button" disabled={!result || shareBusy || sharedLoading} onClick={saveResultUrl}>{shareBusy ? 'URL 저장 중…' : '이 결과 URL 저장'}</button><button type="button" disabled={!authenticated || actionBusy || shareBusy || sharedLoading} onClick={startAgain}>다시 찾기</button></> : <span className="shop-image-search-submit-anchor" data-tooltip={needsSex ? '캐릭터 성별을 먼저 선택해주세요.' : undefined} tabIndex={needsSex ? 0 : undefined} aria-describedby={needsSex ? sexHintId : undefined}><button type="submit" disabled={!authenticated || !source || !crop || !sex || busy}>{busy ? '검색 중…' : '비슷한 아이템 찾기'}</button></span>}</div>
        <div className={`shop-image-search-status${result ? ' is-result' : ''}`} data-result-message={result ? resultMessage : undefined} aria-live="polite"><span role={error ? 'alert' : undefined}>{error || notice || (sharedLoading ? '공유 결과를 불러오는 중입니다.' : busy ? searchProgress(seconds, activeEstimate) : result ? resultMessage : '')}</span>{shareUrl && <label className="shop-image-search-share-url">공유 결과 URL<input aria-label="공유 결과 URL" readOnly value={shareUrl} onFocus={event => event.target.select()} /></label>}</div>
        <div className="shop-image-search-actions"><button type="button" disabled={!chosen.length || actionBusy || busy} onClick={preview}>해당 의상 입어보기</button><button type="button" disabled={!authenticated || !chosen.length || actionBusy || busy} onClick={favorite}>{actionBusy ? '등록 중…' : '해당 의상 즐겨찾기 등록'}</button></div>
        <div className="shop-image-search-results" aria-busy={busy}>{groups.map(group => <section className="shop-image-search-group" key={group.slot}><h3>{labels[group.slot] || '검색 결과'}{group.exact_match_supported === false && <small>일치 여부 확인 필요</small>}</h3><div>{group.items?.length ? group.items.map((item, index) => { const key = `${group.slot}:${item.id}`; return <article className={`shop-image-search-candidate${selected[group.slot]?.id === item.id ? ' is-selected' : ''}`} key={item.id}>
          <button className="shop-image-search-select" type="button" aria-label={`${item.name} 선택`} aria-pressed={selected[group.slot]?.id === item.id} onClick={() => toggle(item, group.slot)}><span>{index + 1}</span><img src={item.thumbnail} alt="" /><strong>{item.name}</strong>{item.is_unreleased && <small>미출시</small>}{(!item.preview_available || !item.model) && <small className="shop-image-search-no-preview">미리보기 불가 · 3D 모델 없음</small>}</button>
          <div className="shop-image-search-votes"><button type="button" aria-label={`${item.name} 좋아요`} aria-pressed={votes[key] === 1} disabled={!authenticated || !result.search_id || votePending.has(key)} onClick={() => vote(item, group.slot, 1)}><ThumbsUp size={15} /> 좋아요</button><button type="button" aria-label={`${item.name} 싫어요`} aria-pressed={votes[key] === -1} disabled={!authenticated || !result.search_id || votePending.has(key)} onClick={() => vote(item, group.slot, -1)}><ThumbsDown size={15} /> 싫어요</button></div><small className="shop-image-search-vote-status" role="status" aria-label={`${item.name} 평가 저장 상태`}>{voteStatus[key] || ''}</small>
        </article> }) : <p>일치하는 후보를 찾지 못했습니다.</p>}</div></section>)}</div>
      </form>
    </dialog>
    {previewItems && <ShopImagePreview meta={meta} sex={sex} items={previewItems} onClose={() => setPreviewItems(null)} />}
  </>
}
