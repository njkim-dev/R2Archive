import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../store/useStore'
import { deleteImageSearch, getImageSearchFeedback, getImageSearchHistory, getImageSearchHistoryDetail, getShopItem, getShopItems, reviewImageSearch } from '../api/shop'
import { watchImageFeedback } from '../utils/shopImageFeedback'
import '../styles/shopAdmin.css'

const names = { hair: '머리', top: '상의', bottom: '하의', shoes: '스케이트' }
const states = { pending: '검수 대기', approved: '승인됨', excluded: '학습 제외' }
const errors = error => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : '요청을 완료하지 못했습니다. 다시 시도해주세요.'
const date = value => value ? new Date(value).toLocaleString('ko-KR') : '—'
const previewCount = (votes, value) => (votes || []).filter(vote => vote.value === value).length

function PreviewFeedback({ record }) {
  const candidates = new Map((record.result.groups || []).flatMap(group => group.items || []).map(item => [String(item.id), item]))
  return <section className="shop-admin-preview-votes" aria-label="미리보기 평가 기록"><h3>미리보기 평가</h3><div>
    {record.result.preview_votes?.length ? record.result.preview_votes.map(vote => <article key={vote.item_ids.join(':')}>
      <strong>{vote.value === 1 ? '맞아요' : '아니에요'}</strong><time>{date(vote.updated_at)}</time>
      <p>{vote.item_ids.map(id => `${candidates.get(String(id))?.name || '아이템'} #${id}`).join(' · ')}</p>
    </article>) : <p>등록된 미리보기 평가가 없습니다.</p>}
  </div></section>
}

function RegionEditor({ src, value, onChange }) {
  const area = useRef(null), drag = useRef(null), [points, setPoints] = useState(false)
  const region = value || { bbox_xyxy: [0, 0, 1000, 1000], polygon_xy: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] }
  const position = event => { const bounds = area.current.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1000, (event.clientX - bounds.left) / bounds.width * 1000))), Math.round(Math.max(0, Math.min(1000, (event.clientY - bounds.top) / bounds.height * 1000)))] }
  function move(event) {
    if (!drag.current) return
    const end = position(event)
    if (drag.current.vertex !== undefined) {
      const polygon = region.polygon_xy.map((point, index) => index === drag.current.vertex ? end : point)
      onChange({ bbox_xyxy: [Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1])), Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[1]))], polygon_xy: polygon })
    } else {
      const start = drag.current.start, x = Math.min(start[0], end[0]), y = Math.min(start[1], end[1]), right = Math.max(start[0], end[0]), bottom = Math.max(start[1], end[1])
      if (right - x < 3 || bottom - y < 3) return
      onChange({ bbox_xyxy: [x, y, right, bottom], polygon_xy: [[x, y], [right, y], [right, bottom], [x, bottom]] })
    }
  }
  return <div className="image-review-region"><div className="image-review-region-mode"><span>정답 영역을 확인하거나 다시 그리세요.</span><button type="button" aria-pressed={points} onClick={() => setPoints(old => !old)}>윤곽 점 편집</button></div><div className="image-review-image-area"><div><img src={src} alt="정답 영역을 검수할 원본 이미지" draggable="false" /><svg ref={area} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="정답 영역 편집" onPointerDown={event => { if (event.button !== 0 || points) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { start: position(event) } }} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}><polygon points={region.polygon_xy.map(point => point.join(',')).join(' ')} />{points && region.polygon_xy.map((point, index) => <circle key={index} cx={point[0]} cy={point[1]} r="13" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); area.current.setPointerCapture(event.pointerId); drag.current = { vertex: index } }} />)}</svg></div></div></div>
}

function PartReview({ slot, record, label, onChange }) {
  const [query, setQuery] = useState(''), [matches, setMatches] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const group = record.result.groups?.find(group => group.slot === slot)
  const votes = new Map(record.votes.filter(vote => vote.slot === slot).map(vote => [String(vote.item_id), vote.value]))
  useEffect(() => {
    const text = query.trim(), controller = new AbortController()
    setMatches([]); setError('')
    if (!text) { setBusy(false); return }
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const rows = /^\d+$/.test(text) ? [await getShopItem(text, record.catalog_revision)] : (await getShopItems({ version: record.catalog_revision, department: 'wearable', sex: record.sex, slot, include_unreleased: true, page_size: 12, q: text }, controller.signal)).items
        if (!controller.signal.aborted) setMatches(rows.filter(item => item.slot === slot && [record.sex, 'common'].includes(item.sex)))
      } catch (failure) { if (!controller.signal.aborted) setError(errors(failure)) }
      finally { if (!controller.signal.aborted) setBusy(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, record.id, record.catalog_revision, record.sex, slot])
  const region = label?.region || record.diagnostics.localization?.[slot]
  const choose = item => onChange({ item_id: String(item.id), name: item.name, region: region || { bbox_xyxy: [0, 0, 1000, 1000], polygon_xy: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] } })
  return <section className="image-review-part"><h3>{names[slot]}</h3><p className="image-review-label">확정 정답: <strong>{label?.item_id ? `${label.name || ''} #${label.item_id}` : '지정하지 않음'}</strong><button type="button" disabled={!label?.item_id} onClick={() => onChange(null)}>정답 해제</button></p>
    <div className="image-review-candidates">{group?.items?.map(item => <button type="button" key={item.id} aria-pressed={label?.item_id === item.id} onClick={() => choose(item)}><img src={item.thumbnail} alt="" /><b>{item.name}</b><span>#{item.id}</span><small>{votes.get(item.id) === 1 ? '사용자 좋아요' : votes.get(item.id) === -1 ? '사용자 싫어요' : '사용자 평가 없음'}</small><span>정답으로 지정</span></button>)}{!group?.items?.length && <p>검색 후보가 없습니다. 아래에서 정답을 찾아 지정할 수 있습니다.</p>}</div>
    <label className="image-review-catalogue-search">후보 밖에서 정답 찾기<input aria-label={`${names[slot]} 정답 아이템 검색`} value={query} maxLength={120} placeholder="아이템 이름 또는 번호" onChange={event => setQuery(event.target.value)} /></label>
    <div className="image-review-catalogue-matches" aria-busy={busy}>{busy ? <p>아이템을 찾고 있습니다.</p> : error ? <p role="alert">{error}</p> : matches.length ? matches.map(item => <button type="button" key={item.id} onClick={() => choose(item)}>{item.name} · #{item.id}</button>) : <p>{query ? '찾은 아이템이 없습니다.' : '검색어를 입력하면 카탈로그에서 정답을 찾습니다.'}</p>}</div>
    <RegionEditor src={record.image_url} value={region} onChange={region => onChange({ ...(label || {}), region })} />
  </section>
}

export default function ShopAdminPage() {
  const { authLoaded, adminLoaded, user, isAdmin, openLogin } = useStore()
  const allowed = authLoaded && adminLoaded && !!user && isAdmin
  const [filters, setFilters] = useState({ status: 'pending', sex: '', slot: '', vote: '' }), [epoch, setEpoch] = useState(0), [detailEpoch, setDetailEpoch] = useState(0)
  const [listing, setListing] = useState(null), [listBusy, setListBusy] = useState(false), [moreBusy, setMoreBusy] = useState(false), [listError, setListError] = useState('')
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState('')
  const [labels, setLabels] = useState({}), [notes, setNotes] = useState(''), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const queryKey = JSON.stringify(filters), current = useRef(''), sequence = useRef(0), detailSequence = useRef(0), owner = useRef(user?.id)
  const historyList = useRef(null), selectedId = useRef(selected)
  selectedId.current = selected
  current.current = queryKey; owner.current = user?.id
  useEffect(() => {
    if (!allowed) { setListing(null); setDetail(null); return }
    const controller = new AbortController(), request = ++sequence.current
    setListBusy(true); setListError(''); setMoreBusy(false)
    getImageSearchHistory(filters, controller.signal).then(data => { if (!controller.signal.aborted && request === sequence.current) setListing(data) }).catch(failure => { if (!controller.signal.aborted) setListError(errors(failure)) }).finally(() => { if (!controller.signal.aborted) setListBusy(false) })
    return () => controller.abort()
  }, [allowed, user?.id, queryKey, epoch])
  useEffect(() => {
    if (!allowed || !selected) { setDetail(null); return }
    const controller = new AbortController(), request = ++detailSequence.current
    setDetailBusy(true); setDetailError(''); setDetail(null); setLabels({}); setNotes(''); setMessage('')
    getImageSearchHistoryDetail(selected, controller.signal).then(data => {
      if (!controller.signal.aborted && request === detailSequence.current) { setDetail(data); setLabels(data.review_labels || {}); setNotes(data.review_notes || '') }
    }).catch(failure => { if (!controller.signal.aborted) setDetailError(errors(failure)) }).finally(() => { if (!controller.signal.aborted) setDetailBusy(false) })
    return () => controller.abort()
  }, [allowed, user?.id, selected, detailEpoch])
  useEffect(() => {
    if (!allowed) return
    let request, active = true
    const refresh = () => {
      const area = historyList.current, bounds = area?.getBoundingClientRect()
      const visible = area ? [...area.querySelectorAll('[data-history-id]')].filter(row => { const box = row.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom }).map(row => row.dataset.historyId) : []
      const ids = [...new Set([selectedId.current, ...visible].filter(Boolean))].slice(0, 60)
      if (!ids.length) return
      request?.abort(); request = new AbortController()
      const controller = request
      getImageSearchFeedback(ids, controller.signal).then(data => {
        if (!active || controller.signal.aborted || !Array.isArray(data.items)) return
        const rows = new Map(data.items.map(row => [row.id, row]))
        setListing(old => old ? { ...old, items: old.items.map(row => rows.has(row.id) ? { ...row, likes: rows.get(row.id).likes, dislikes: rows.get(row.id).dislikes, preview_votes: rows.get(row.id).preview_votes ?? row.preview_votes } : row) } : old)
        setDetail(old => old && rows.has(old.id) ? { ...old, votes: rows.get(old.id).votes, result: { ...old.result, preview_votes: rows.get(old.id).preview_votes ?? old.result.preview_votes } } : old)
      }).catch(() => {})
    }
    const stop = watchImageFeedback(refresh)
    return () => { active = false; request?.abort(); stop() }
  }, [allowed, user?.id, queryKey])
  async function more() {
    if (!listing?.next_cursor || moreBusy) return
    const key = queryKey, request = sequence.current, uid = user.id
    setMoreBusy(true)
    try {
      const data = await getImageSearchHistory({ ...filters, before: listing.next_cursor })
      if (owner.current === uid && current.current === key && request === sequence.current) setListing(old => ({ ...data, items: [...old.items, ...data.items] }))
    } catch (failure) { if (owner.current === uid && current.current === key) setListError(errors(failure)) }
    finally { if (owner.current === uid && current.current === key) setMoreBusy(false) }
  }
  async function review(decision) {
    if (!detail || saving) return
    const uid = user.id, id = detail.id
    setSaving(true); setMessage(''); setDetailError('')
    try {
      const selectedLabels = Object.fromEntries(Object.entries(labels).filter(([,label]) => label?.item_id).map(([slot,label]) => [slot, { item_id: label.item_id, region: label.region }]))
      const result = await reviewImageSearch(id, { decision, expected_version: detail.review_version, labels: selectedLabels, notes })
      if (owner.current !== uid) return
      setDetail(old => old?.id === id ? { ...old, review_status: result.status, review_version: result.review_version, review_labels: selectedLabels } : old)
      setMessage(decision === 'approved' ? `승인했습니다. ${result.examples}개 부위가 검색 자료에 반영됐습니다.` : '검색 자료에서 제외했습니다.')
      setEpoch(old => old + 1)
    } catch (failure) { if (owner.current === uid) setDetailError(errors(failure)) }
    finally { if (owner.current === uid) setSaving(false) }
  }
  async function remove() {
    if (!detail || saving || !window.confirm('원본 이미지, 검색 결과, 평가와 승인 자료를 영구 삭제합니다. 계속하시겠습니까?')) return
    const uid = user.id
    setSaving(true); setDetailError('')
    try {
      const result = await deleteImageSearch(detail.id)
      if (owner.current !== uid) return
      setSelected(null); setDetail(null); setMessage(result.warning || '검색 기록과 원본 이미지를 삭제했습니다.'); setEpoch(old => old + 1)
    } catch (failure) { if (owner.current === uid) setDetailError(errors(failure)) }
    finally { if (owner.current === uid) setSaving(false) }
  }
  const approvedCount = Object.values(labels).filter(label => label?.item_id).length
  const parts = detail?.slot === 'all' ? Object.keys(names) : detail ? [detail.slot] : []
  return <main className="shop-admin-page"><header><Link to="/shop">← 상점으로</Link><h1>관리자 도구</h1><p>이미지 검색 기록 · 사용자 평가 · 정답 검수</p></header>
    {!allowed ? <section className="shop-admin-access"><p>{!authLoaded || user && !adminLoaded ? '관리자 권한을 확인 중입니다.' : '관리자만 이용할 수 있습니다.'}</p>{authLoaded && !user && <button onClick={openLogin}>로그인</button>}</section> : <>
      <div className="shop-admin-stats"><span>전체 기록 <b>{listing?.stats.total ?? '—'}</b></span><span>검수 대기 <b>{listing?.stats.pending ?? '—'}</b></span><span>승인 <b>{listing?.stats.approved ?? '—'}</b></span><span>검색 자료 <b>{listing?.stats.examples ?? '—'}</b></span><span>원본 보관 <b>{listing ? `${(listing.stats.image_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</b></span></div>
      <div className="shop-admin-filters">{[['status', '검수 상태', [['', '전체'], ...Object.entries(states)]], ['sex', '성별', [['', '전체'], ['male', '남성'], ['female', '여성']]], ['slot', '부위', [['', '전체 검색'], ['all', '네 부위 동시'], ...Object.entries(names)]], ['vote', '사용자 평가', [['', '모든 평가'], ['like', '좋아요 있음'], ['dislike', '싫어요 있음']]]].map(([key,label,options]) => <label key={key}>{label}<select aria-label={`관리자 ${label}`} value={filters[key]} onChange={event => setFilters(old => ({ ...old, [key]: event.target.value }))}>{options.map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}<button disabled={listBusy} onClick={() => setEpoch(old => old + 1)}>새로고침</button></div>
      <p className="shop-admin-list-status" role={listError ? 'alert' : 'status'}>{listError || (listBusy ? '기록을 불러오는 중입니다.' : '원본은 관리자가 삭제할 때까지 보관됩니다. 좋아요·싫어요는 검수 참고 자료이며 정답으로 자동 승인되지 않습니다.')}</p>
      <div className="shop-admin-layout"><aside ref={historyList} className="shop-admin-history-list" aria-label="이미지 검색 기록 목록" aria-busy={listBusy}>{listing?.items.map(row => <button key={row.id} data-history-id={row.id} className="shop-admin-history-row" aria-pressed={selected === row.id} onClick={() => { if (!saving) setSelected(row.id) }}><img src={`${row.image_url}?thumbnail=true`} alt="검색 이미지 축소판" loading="lazy" /><span><b>{date(row.created_at)}</b><span>{row.sex === 'male' ? '남성' : '여성'} · {names[row.slot] || '전체'} · {row.is_guest ? '비로그인 사용자' : `사용자 #${row.user_id ?? '삭제됨'}`}</span><span>{states[row.review_status]} · {row.status === 'failed' ? '검색 실패' : row.status === 'running' ? '검색 중' : '검색 완료'}</span><small>좋아요 {row.likes} · 싫어요 {row.dislikes}</small><small>미리보기 맞아요 {previewCount(row.preview_votes, 1)} · 아니에요 {previewCount(row.preview_votes, -1)}</small></span></button>)}{!listBusy && !listing?.items.length && <p>표시할 검색 기록이 없습니다.</p>}{listing?.has_more && <button disabled={moreBusy} onClick={more}>{moreBusy ? '불러오는 중…' : '더 보기'}</button>}</aside>
        <section className="shop-admin-detail" aria-label="검색 기록 검수" aria-busy={detailBusy}>
          <div className="shop-admin-review-status" role={detailError ? 'alert' : 'status'}>{detailError || message || (detailBusy ? '검색 내용을 불러오는 중입니다.' : detail ? `${states[detail.review_status]} · 검수 버전 ${detail.review_version}` : '왼쪽에서 검수할 검색 기록을 선택해주세요.')}</div>
          {detail && <><div className="shop-admin-detail-heading"><h2>검색 기록</h2><p>{date(detail.created_at)} · {detail.model} · {detail.pipeline_version}</p><p>{detail.original_filename} · {detail.image_width}×{detail.image_height} · {(detail.image_bytes / 1024).toFixed(1)} KB</p>{detail.error && <p role="alert">{detail.error}</p>}</div>
            <p className="shop-admin-review-guide">확인한 부위의 정답과 영역을 지정한 뒤 승인하세요. 지정하지 않은 부위는 검색 자료에 추가하지 않습니다. 승인 자료는 후보 검색에 반영되며, 모델 추가 학습은 별도 검토 대상입니다.</p>
            <div className="shop-admin-review-actions"><button disabled={saving || !approvedCount} onClick={() => review('approved')}>승인</button><button disabled={saving} onClick={() => review('excluded')}>학습 제외</button><button disabled={saving} onClick={() => setDetailEpoch(old => old + 1)}>검수 내용 새로고침</button><button className="is-danger" disabled={saving} onClick={remove}>기록과 원본 삭제</button></div>
            <label className="shop-admin-review-notes">검수 메모<textarea aria-label="검수 메모" maxLength={2000} value={notes} disabled={saving} onChange={event => setNotes(event.target.value)} /></label>
            <PreviewFeedback record={detail} />
            <fieldset disabled={saving}>{parts.map(slot => <PartReview key={`${detail.id}:${slot}:${detailEpoch}`} slot={slot} record={detail} label={labels[slot]} onChange={label => setLabels(old => ({ ...old, [slot]: label }))} />)}</fieldset>
            <details><summary>분석·후보 순위·시간·토큰·비용 기록</summary><pre>{JSON.stringify(detail.diagnostics, null, 2)}</pre></details>
            <details><summary>사용자 선택·입어보기·즐겨찾기 기록</summary><pre>{JSON.stringify(detail.actions, null, 2)}</pre></details>
            <details><summary>관리자 검수 이력</summary><pre>{JSON.stringify(detail.reviews, null, 2)}</pre></details>
          </>}
        </section>
      </div>
    </>}
  </main>
}
