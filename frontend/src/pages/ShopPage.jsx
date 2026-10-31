import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUp, Box, Check, Copy, Search, Star, Users, X } from 'lucide-react'
import useStore from '../store/useStore'
import { getShopItem, getShopItems, getShopMeta } from '../api/shop'
import { itemShareUrl, outfitShareUrl, readShopUrl, rememberShopReturn, SHOP_SLOTS, SLOT_LABELS, OPTIONAL_SLOT_LABELS } from '../utils/shopUrl'
import { SHOP_GROUPS, PET_GROUPS, PET_SUPPLY_GROUPS } from '../utils/shopCategories'
import ShopViewer from '../components/shop/ShopViewer'
import ItemImage, { ShopImageSession } from '../components/shop/ShopImage'
import ShopVirtualGrid from '../components/shop/ShopVirtualGrid'
import ShopFavoriteButton from '../components/shop/ShopFavoriteButton'
import ShopFavoritePicker from '../components/shop/ShopFavoritePicker'
import useShopFavorites from '../components/shop/useShopFavorites'
import ShopMobilePanel from '../components/shop/ShopMobilePanel'
import '../styles/shop.css'

const emptySlots = () => Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null]))
const DEPARTMENTS = [['wearable', '꾸미기ㆍ펫'], ['functional', '기능성ㆍ소모품'], ['other', '기타']]
const currency = value => value === 'cash' ? '캐시' : '알코인'
const defaultPrice = item => item?.prices?.find(p => p.key === 'PI') || item?.prices?.find(p => p.key === 'P30') || item?.prices?.[0]
const errorText = error => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : Array.isArray(error?.response?.data?.detail) ? '검색어나 공유 URL을 확인해주세요.' : error?.message || '상점 정보를 불러오지 못했습니다.'

export default function ShopPage() {
  const location = useLocation()
  return <div className="shop-app"><ShopImageSession><ShopContent key={location.search} search={location.search} /></ShopImageSession></div>
}

function ShopContent({ search }) {
  const location = useLocation(), navigate = useNavigate()
  const navigationOwner = useRef(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).current
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 800px)').matches)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('outfit')
  const [awayFromTop, setAwayFromTop] = useState(() => window.scrollY > 600)
  const { authLoaded, user, openLogin, logout } = useStore()
  const favorites = useShopFavorites(authLoaded ? user?.id : null)
  const authenticated = authLoaded && !!user
  const [favoriteSlot, setFavoriteSlot] = useState(null)
  useEffect(() => { setFavoriteSlot(null) }, [user?.id])
  const initial = useRef(readShopUrl(search)).current
  const [meta, setMeta] = useState(null)
  const [ready, setReady] = useState(false)
  const [catalogDepartment, setDepartment] = useState('wearable')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteDepartment, setFavoriteDepartment] = useState('')
  const [favoriteSex, setFavoriteSex] = useState('')
  const department = favoritesOnly ? favoriteDepartment : catalogDepartment
  const [sex, setSex] = useState(initial.sex)
  const [slot, setSlot] = useState('')
  const [group, setGroup] = useState('')
  const [subgroup, setSubgroup] = useState('')
  const [query, setQuery] = useState('')
  const [pairedOnly, setPairedOnly] = useState(false)
  const [hideUnavailable, setHideUnavailable] = useState(true)
  const [listing, setListing] = useState({ items: [], total: 0, has_more: false })
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState(emptySlots)
  const [detail, setDetail] = useState(null)
  const [priceKey, setPriceKey] = useState(initial.price)
  const navigation = location.state?.shopNavigation
  const view = navigation?.owner === navigationOwner ? navigation.view : initial.preview ? 'preview' : 'browse'
  const [applied, setApplied] = useState(null)
  const [pair, setPair] = useState(initial.pair)
  const [counterparts, setCounterparts] = useState(emptySlots)
  const [pairLoading, setPairLoading] = useState(false)
  const [angle, setAngle] = useState(initial.angle)
  const [zoom, setZoom] = useState(initial.zoom)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  const listRequest = useRef(null)
  const scrollPosition = useRef(0)
  const restoreScroll = useRef(false)
  const toastTimer = useRef(null)
  const listSex = favoritesOnly ? favoriteSex : department === 'wearable' ? sex : null
  const showWardrobe = department === 'wearable' || favoritesOnly && !department
  const needsSex = !favoritesOnly && department === 'wearable' && !sex
  const visibleItems = favoritesOnly ? listing.items.filter(item => favorites.ids.has(item.id)) : listing.items
  const visibleTotal = Math.max(0, listing.total - (listing.items.length - visibleItems.length))
  const listKey = JSON.stringify([ready, meta?.revision, department, listSex, slot, group, subgroup, query, pairedOnly, hideUnavailable, favoritesOnly, favoritesOnly ? user?.id : null, favoritesOnly && favorites.ready])
  useEffect(() => { if (!authenticated) setFavoritesOnly(false) }, [authenticated])
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  function notify(text) { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(() => setToast(''), 2600) }
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const resize = () => { setMobile(media.matches); if (!media.matches) setPanelOpen(false) }
    media.addEventListener('change', resize)
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    let frame
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setAwayFromTop(window.scrollY > 600)) }
    window.addEventListener('scroll', scroll, { passive: true })
    return () => { media.removeEventListener('change', resize); window.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); history.scrollRestoration = previous }
  }, [])
  useLayoutEffect(() => { setPanelOpen(false); setFavoriteSlot(null) }, [location.key])
  useLayoutEffect(() => {
    if (view === 'preview') { restoreScroll.current = true; window.scrollTo({ top: 0, behavior: 'instant' }) }
  }, [view])
  function top() {
    setPanelOpen(false)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }))
  }
  function openPanel(mode = 'outfit') { setPanelMode(mode); setPanelOpen(true) }
  function framePanel(content) { return mobile ? <ShopMobilePanel open={panelOpen} onClose={() => setPanelOpen(false)}>{content}{panelOpen && copyTools}</ShopMobilePanel> : content }
  const panelHeading = title => <div className="shop-panel-heading"><h2>{title}</h2><div><button className="shop-panel-top" aria-label="페이지 맨 위로 이동" onClick={top}><ArrowUp size={14} /> 맨 위로</button>{mobile && <button className="shop-panel-close" aria-label="아이템 현황 닫기" onClick={() => setPanelOpen(false)}><X size={19} /></button>}</div></div>
  const panelTabs = mobile && detail && <div className="shop-panel-tabs" role="tablist" aria-label="아이템 현황 표시">{[['outfit', '선택한 의상'], ['detail', '아이템 정보']].map(([value, label]) => <button key={value} role="tab" aria-selected={panelMode === value} onClick={() => setPanelMode(value)}>{label}</button>)}</div>

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const catalog = await getShopMeta(initial.version)
        if (cancelled) return
        setMeta(catalog)
        if (initial.preview || SHOP_SLOTS.some(key => initial.slots[key])) {
          const gender = initial.sex || 'male'
          const chosen = emptySlots()
          await Promise.all(SHOP_SLOTS.map(async key => {
            if (!initial.slots[key]) return
            const item = await getShopItem(initial.slots[key], catalog.revision)
            if (item.slot !== key || !item.preview_available || !item.model || !['common', gender].includes(item.sex)) throw new Error('공유된 의상의 일부 아이템을 미리볼 수 없습니다.')
            chosen[key] = item
          }))
          if (cancelled) return
          setSex(gender); setSlots(chosen)
          if (initial.preview) setApplied({ sex: gender, slots: chosen })
        } else if (initial.item) {
          const item = await getShopItem(initial.item, catalog.revision)
          if (cancelled) return
          const gender = item.sex === 'common' ? initial.sex || 'male' : item.sex
          setDepartment(item.department); setSex(gender); setDetail(item)
          if (item.department === 'wearable' && (!item.preview_available || !item.model)) setHideUnavailable(false)
          if (item.department !== 'wearable' && SHOP_GROUPS[item.department]?.some(([key]) => key === item.group)) {
            setGroup(item.group)
            if (item.group === 'pet_supplies') setSubgroup(item.subgroup || '')
          }
          if (item.slot && item.preview_available && item.model) setSlots({ ...emptySlots(), [item.slot]: item })
          setQuery(item.name.slice(0, 120))
          if (window.matchMedia('(max-width: 800px)').matches && (item.department !== 'wearable' || !item.preview_available || !item.model)) { setPanelMode('detail'); setPanelOpen(true) }
        }
        setReady(true)
      } catch (failure) { if (!cancelled) { setError(errorText(failure)); setLoading(false) } }
    }
    restore()
    return () => { cancelled = true }
  }, [initial])

  const requestPage = useCallback(async (context) => {
    if (context !== listRequest.current || context.busy || !context.hasMore) return
    context.busy = true
    context.error = false
    setLoading(true)
    try {
      const first = context.cursor === ''
      const result = await getShopItems({ ...context.params, cursor: context.cursor }, context.controller.signal)
      if (context !== listRequest.current || context.controller.signal.aborted) return
      context.cursor = result.next_cursor
      context.hasMore = !!result.has_more && !!result.next_cursor
      setListing(previous => {
        if (context !== listRequest.current || context.controller.signal.aborted) return previous
        const known = new Set(first ? [] : previous.items.map(item => item.id))
        const extra = result.items.filter(item => !known.has(item.id) && known.add(item.id))
        return { items: first ? extra : [...previous.items, ...extra], total: result.total ?? previous.total, has_more: context.hasMore }
      })
      setError('')
    } catch (failure) {
      if (context === listRequest.current && !context.controller.signal.aborted) { context.error = true; setError(errorText(failure)); setListing(previous => ({ ...previous, has_more: true })) }
    } finally {
      context.busy = false
      if (context === listRequest.current && !context.controller.signal.aborted) setLoading(false)
    }
  }, [])
  const loadMore = useCallback((retry = false) => {
    const context = listRequest.current
    if (context && (!context.error || retry === true)) requestPage(context)
  }, [requestPage])
  useEffect(() => {
    scrollPosition.current = 0
    setListing({ items: [], total: 0, has_more: false })
    if (!ready || !meta || needsSex || favoritesOnly && (!authenticated || !favorites.ready)) { listRequest.current = null; setLoading(false); return }
    const context = { controller: new AbortController(), cursor: '', hasMore: true, busy: false, error: false, params: { version: meta.revision, department: department || undefined, sex: listSex || undefined, slot: slot || undefined, group: group || undefined, subgroup: subgroup || undefined, q: query, paired_only: department === 'wearable' && pairedOnly, preview_only: department === 'wearable' && hideUnavailable, favorites_only: favoritesOnly || undefined, page_size: 24 } }
    listRequest.current = context
    setError('')
    setLoading(true)
    const timer = setTimeout(() => requestPage(context), query ? 220 : 0)
    return () => { clearTimeout(timer); context.controller.abort() }
  }, [listKey, requestPage])

  useEffect(() => {
    if (!pair || !applied || !meta) { setPairLoading(false); return }
    let cancelled = false
    setPairLoading(true)
    const next = emptySlots()
    Promise.all(SHOP_SLOTS.filter(key => key !== 'pet').map(async key => {
      if (applied.slots[key]?.sex === 'common') { next[key] = applied.slots[key]; return }
      const id = applied.slots[key]?.counterpart_id
      if (!id) return
      const item = await getShopItem(id, meta.revision)
      if (item.slot === key && item.sex === (applied.sex === 'male' ? 'female' : 'male') && item.preview_available && item.model) next[key] = item
    })).then(() => { if (!cancelled) setCounterparts(next) }).catch(failure => { if (!cancelled) { setError(errorText(failure)); setPair(false) } }).finally(() => { if (!cancelled) setPairLoading(false) })
    return () => { cancelled = true }
  }, [pair, applied, meta])

  async function copy(url) {
    setCopyFallback('')
    try { await navigator.clipboard.writeText(url); notify('URL을 복사했습니다') }
    catch { setCopyFallback(url); notify('URL을 직접 복사해주세요') }
  }
  function choose(item) {
    if (!favoritesOnly && item.department === 'wearable' && item.slot && (!sex || !['common', sex].includes(item.sex))) return
    setDetail(item); setPriceKey(defaultPrice(item)?.key)
    if (mobile && (item.department !== 'wearable' || !item.preview_available || !item.model)) openPanel('detail')
    if (item.department === 'wearable' && item.slot && item.preview_available && item.model) {
      const gender = item.sex === 'common' ? sex || favoriteSex || 'male' : item.sex
      if (gender !== sex) setSex(gender)
      setSlots(current => { const chosen = gender !== sex ? emptySlots() : current; return { ...chosen, [item.slot]: chosen[item.slot]?.id === item.id ? null : item } })
    }
  }
  function resetFilters() { setSlot(''); setGroup(''); setSubgroup(''); setQuery(''); setDetail(null); setError('') }
  function changeDepartment(next) { setFavoritesOnly(false); setDepartment(next); resetFilters() }
  function openFavorites() { setFavoritesOnly(true); setFavoriteDepartment(''); setFavoriteSex(sex || ''); resetFilters() }
  function changeSex(next) { if (sex !== next) { setSex(next); setSlots(emptySlots()); setDetail(null); setQuery(''); setListing({ items: [], total: 0, has_more: false }); setLoading(true) } }
  function preview() {
    if (!sex || !meta) return
    scrollPosition.current = window.scrollY
    setApplied({ sex, slots: { ...slots } }); setCounterparts(emptySlots()); setPair(false); setError('')
    navigate(location.pathname + location.search + location.hash, { state: { ...location.state, shopNavigation: { owner: navigationOwner, view: 'preview', fromBrowse: true } } })
  }
  function browse() {
    if (navigation?.owner === navigationOwner && navigation.fromBrowse) navigate(-1)
    else navigate(location.pathname + location.search + location.hash, { replace: true, state: { ...location.state, shopNavigation: { owner: navigationOwner, view: 'browse' } } })
  }
  function login() {
    let target = location.pathname + location.search
    if (view === 'preview' && applied && meta) {
      const url = new URL(outfitShareUrl({ version: meta.revision, ...applied, pair, angle, zoom }))
      target = url.pathname + url.search
    } else if (detail && department !== 'wearable') {
      const url = new URL(itemShareUrl(detail, sex, selectedPrice?.key))
      target = url.pathname + url.search
    } else if (sex && meta) {
      const url = new URL(outfitShareUrl({ version: meta.revision, sex, slots, pair, angle, zoom }))
      if (view !== 'preview') url.searchParams.delete('view')
      target = url.pathname + url.search
    } else if (detail) {
      const url = new URL(itemShareUrl(detail, sex, selectedPrice?.key))
      target = url.pathname + url.search
    }
    rememberShopReturn(target); openLogin()
  }
  function equipFavorite(item) {
    const key = favoriteSlot
    setFavoriteSlot(null)
    setSlots(current => ({ ...current, [key]: item }))
    setApplied(current => current.slots[key]?.id === item?.id ? current : ({ ...current, slots: { ...current.slots, [key]: item } }))
  }
  const chosenCount = Object.values(slots).filter(Boolean).length
  const selectedPrice = detail?.prices.find(p => p.key === priceKey) || defaultPrice(detail)
  const renderCard = item => {
    const price = defaultPrice(item), selected = item.slot && slots[item.slot]?.id === item.id
    const categoryLabel = [...PET_GROUPS, ...PET_SUPPLY_GROUPS, ...(SHOP_GROUPS[item.department] || [])].find(([key]) => key === item.subgroup || key === item.group)?.[1] || SLOT_LABELS[item.slot] || (item.department === 'functional' ? '공용 아이템' : '장식ㆍ기타')
    return <article className={`shop-card${selected || detail?.id === item.id ? ' is-selected' : ''}`} key={item.id} data-item-id={item.id}>
      <ShopFavoriteButton item={item} saved={favorites.ids.has(item.id)} authenticated={authenticated} ready={favorites.ready} pending={favorites.pending.has(item.id)} onToggle={favorites.toggle} />
      <button className="shop-card-select" onClick={() => choose(item)} aria-label={`${item.name} ${item.slot && item.preview_available ? '의상 선택' : '자세히 보기'}`} aria-pressed={!!selected}>
        <div className="shop-card-image"><ItemImage item={item} />{item.is_new && <span className="shop-new-tag">NEW</span>}{(!item.preview_available || !item.model) && <span className="shop-preview-unavailable">미리보기 불가능</span>}{selected && <span className="shop-check"><Check size={13} /></span>}</div>
        <div className="shop-card-copy"><small>{categoryLabel}{item.sex !== 'common' ? ` ㆍ ${item.sex === 'male' ? '남성' : '여성'}` : ''}</small><strong title={item.name}>{item.name}</strong><div className="shop-card-price">{price ? <><span>{price.amount.toLocaleString()} <small>{currency(price.currency)}</small></span><small>{price.label}</small></> : <small>가격 정보 없음</small>}</div></div>
      </button><div className="shop-card-actions"><button onClick={() => choose(item)}>{item.slot && item.preview_available ? selected ? '선택 해제' : '의상에 추가' : '자세히 보기'}</button><button aria-label={`${item.name} URL 복사`} onClick={() => copy(itemShareUrl(item, item.sex === 'common' ? sex : item.sex, defaultPrice(item)?.key))}><Copy size={12} /> URL 복사</button></div>
    </article>
  }
  const wardrobe = (chosen, removable = true) => <div className="shop-slots">{SHOP_SLOTS.map(key => <div className="shop-slot" key={key}>
    <div className="shop-slot-thumb">{chosen[key] ? <ItemImage item={chosen[key]} /> : OPTIONAL_SLOT_LABELS[key] ? '없음' : '기본'}</div>
    <div><small>{SLOT_LABELS[key]}</small><span title={chosen[key]?.name}>{chosen[key]?.name || OPTIONAL_SLOT_LABELS[key] || (key === 'face' ? '기본 얼굴' : `기본 ${SLOT_LABELS[key]} 착용`)}</span></div>
    {chosen[key] && removable && <button aria-label={`${SLOT_LABELS[key]} 선택 해제`} onClick={() => setSlots(current => ({ ...current, [key]: null }))}><X size={15} /></button>}
    {!removable && <button className="shop-slot-favorites" disabled={!authenticated || !favorites.ready} aria-label={`${SLOT_LABELS[key]} 즐겨찾기 열기`} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : '즐겨찾기에서 의상 바꾸기'} onClick={() => { setPanelOpen(false); setFavoriteSlot(key) }}>즐겨찾기</button>}
  </div>)}</div>

  const copyTools = <>
    {toast && <div className="shop-toast" role="status" aria-live="polite"><Check size={16} />{toast}</div>}
    {copyFallback && <div className="shop-copy-fallback" role="dialog" aria-label="URL 직접 복사"><div><b>URL 직접 복사</b><button aria-label="URL 직접 복사 닫기" onClick={() => setCopyFallback('')}><X size={16} /></button></div><input aria-label="공유 URL" value={copyFallback} readOnly onFocus={event => event.target.select()} /></div>}
  </>

  return <><header className="shop-header"><Link to="/" className="shop-brand"><b>R2</b> ARCHIVE</Link><nav><a href="https://music.r2archive.com">음악</a><span aria-current="page">상점</span><Link to="/game-repair">게임 복구</Link></nav><div className="shop-header-actions"><button className="shop-item-status" onClick={() => openPanel()}><Box size={15} /> 아이템 현황</button><button className="shop-login" disabled={!authLoaded} onClick={user ? logout : login}>{!authLoaded ? '확인 중' : user ? '로그아웃' : '로그인'}</button></div></header><main className="shop-main">
    <div className="shop-title"><div><span>ITEM ARCHIVE</span><h1>{view === 'preview' ? '의상 미리보기' : '아이템 상점'}</h1></div></div>
    <div className="shop-feedback" aria-live="polite"><span role={error || favorites.error ? 'alert' : undefined}>{error || favorites.error}</span>{favorites.error && <button disabled={favorites.pending.size > 0} onClick={favorites.reload}>즐겨찾기 다시 불러오기</button>}</div>
    {view === 'preview' && applied && meta ? <>
      <div className="shop-preview-toolbar"><button onClick={browse}><ArrowLeft size={16} /> 아이템 다시 고르기</button><button className="shop-primary" onClick={() => copy(outfitShareUrl({ version: meta.revision, ...applied, pair, angle, zoom }))}><Copy size={16} /> 의상 URL 복사</button></div>
      <div className="shop-preview-grid"><section>
        {pairLoading ? <div className="shop-stage"><div className="shop-stage-status">이성 아이템을 확인 중입니다.</div></div> : <ShopViewer meta={meta} sex={applied.sex} slots={applied.slots} counterparts={counterparts} pair={pair} angle={angle} zoom={zoom} />}
        <div className="shop-view-controls"><label>회전 <input aria-label="캐릭터 회전" type="range" min="0" max="360" value={angle} onChange={event => setAngle(Number(event.target.value))} /></label><label>확대 <input aria-label="캐릭터 확대" type="range" min="75" max="135" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label></div>
        <button className="shop-pair" aria-pressed={pair} disabled={pairLoading} onClick={() => setPair(value => !value)}><Users size={17} /> 이성 아이템 함께 보기</button>
        <div className="shop-pair-note">{pair && !pairLoading && SHOP_SLOTS.filter(key => key !== 'pet' && applied.slots[key] && !counterparts[key]).length > 0 ? '대응 아이템이 없는 부위는 상대 캐릭터의 기본 의상으로 표시합니다.' : '선택하지 않은 부위는 기본 의상으로 표시됩니다.'}</div>
        {applied.slots.summon && <p className="shop-panel-note">소환물ㆍ날개는 정적인 3D 모습으로 표시합니다.</p>}
      </section>{framePanel(<aside className="shop-panel">{panelHeading('선택한 의상')}{wardrobe(applied.slots, false)}<p className="shop-panel-note">공유 URL은 선택한 아이템, 캐릭터, 회전ㆍ확대와 이성 함께 보기 상태를 포함합니다.</p></aside>)}</div>
    </> : <>
      <div className="shop-departments" role="tablist" aria-label="상점 분류">{DEPARTMENTS.map(([value, label]) => <button key={value} role="tab" aria-selected={!favoritesOnly && department === value} onClick={() => changeDepartment(value)}>{label}</button>)}<button className="shop-favorites-tab" role="tab" aria-selected={favoritesOnly} disabled={!authenticated || !favorites.ready} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : '저장한 모든 아이템 보기'} onClick={openFavorites}><Star size={15} /> 즐겨찾기</button></div>
      {favoritesOnly && <div className="shop-favorite-categories" role="group" aria-label="즐겨찾기 아이템 분류">{[['', '전체'], ...DEPARTMENTS].map(([value, label]) => <button key={value} aria-pressed={department === value} onClick={() => { setFavoriteDepartment(value); resetFilters() }}>{label}</button>)}</div>}
      <div className="shop-gender-row">{favoritesOnly ? <><b>성별</b><div>{[['', '전체 성별'], ['female', '여성'], ['male', '남성']].map(([value, label]) => <button key={value} aria-pressed={favoriteSex === value} onClick={() => setFavoriteSex(value)}>{label}</button>)}</div>{showWardrobe && <button className="shop-mobile-preview" aria-label="선택한 아이템으로 미리보기" disabled={!sex || !ready} onClick={preview}>미리보기 ({chosenCount})</button>}</> : department === 'wearable' ? <><b>캐릭터 성별</b><div>{[['female', '여성'], ['male', '남성']].map(([value, label]) => <button key={value} aria-pressed={sex === value} onClick={() => changeSex(value)}>{label}</button>)}</div><button className="shop-mobile-preview" aria-label="선택한 아이템으로 미리보기" disabled={!sex || !ready} onClick={preview}>미리보기 ({chosenCount})</button></> : <><b>{department === 'functional' ? '기능성ㆍ소모품' : '기타 아이템'}</b><span>아이템 설명과 기간별 가격을 확인해보세요.</span></>}</div>
      <div className="shop-workspace"><section className="shop-library" aria-label="아이템 목록">
        <label className="shop-search"><Search size={17} /><input aria-label="아이템 이름으로 검색" type="search" maxLength={120} placeholder="아이템 이름으로 검색" value={query} onChange={event => { setQuery(event.target.value) }} /></label>
        <div className="shop-filters" role="group" aria-label="아이템 세부 분류"><button aria-pressed={department === 'wearable' ? !slot : !group} onClick={() => { setSlot(''); setGroup(''); setSubgroup('') }}>전체</button>{department === 'wearable' ? SHOP_SLOTS.map(key => <button key={key} aria-pressed={slot === key} onClick={() => { setSlot(key); setSubgroup('') }}>{SLOT_LABELS[key]}</button>) : (SHOP_GROUPS[department] || []).map(([key, label]) => <button key={key} aria-pressed={group === key} onClick={() => { setGroup(key); setSubgroup('') }}>{label}</button>)}</div>
        {(department === 'wearable' && slot === 'pet' || group === 'pet_supplies') && <div className="shop-filters shop-subfilters" role="group" aria-label={department === 'wearable' ? '펫 종류' : '펫 용품 종류'}><button aria-pressed={!subgroup} onClick={() => setSubgroup('')}>{department === 'wearable' ? '전체 펫' : '전체 펫 용품'}</button>{(department === 'wearable' ? PET_GROUPS : PET_SUPPLY_GROUPS).map(([key, label]) => <button key={key} aria-pressed={subgroup === key} onClick={() => setSubgroup(key)}>{label}</button>)}</div>}
        <div className="shop-pair-filter">{department === 'wearable' && <><label><input type="checkbox" checked={pairedOnly} onChange={event => setPairedOnly(event.target.checked)} /> 남녀 모두 존재하는 의상만</label><label><input type="checkbox" checked={hideUnavailable} onChange={event => setHideUnavailable(event.target.checked)} /> 미리보기 불가능 아이템 가리기</label></>}</div>
        <div className="shop-list-status" aria-live="polite">{!ready ? '상점 데이터를 불러오는 중입니다.' : needsSex ? '성별을 먼저 선택해주세요.' : loading ? visibleItems.length ? '아이템을 더 불러오는 중입니다.' : '아이템을 불러오는 중입니다.' : `아이템 ${visibleTotal.toLocaleString()}개`}</div>
        {initial.item && <div className="shop-shared-item"><b>공유된 아이템</b><span>{detail?.name || '아이템 정보를 확인 중입니다.'}</span></div>}
        <ShopVirtualGrid key={listKey} resetKey={listKey} scrollPosition={scrollPosition} restoreScroll={restoreScroll} items={visibleItems} hasMore={listing.has_more} loading={loading} error={error} loadMore={loadMore} renderItem={renderCard} empty={<div className="shop-empty">{needsSex ? <>어떤 캐릭터로 입어볼까요?<br />위에서 성별을 선택해주세요.</> : !ready || loading ? '아이템을 불러오는 중입니다.' : error ? '목록을 불러오지 못했습니다.' : favoritesOnly ? <>표시할 즐겨찾기가 없습니다.<br />아이템의 ☆를 눌러 등록해주세요.</> : <>표시할 아이템이 없습니다.<br />다른 이름이나 분류로 검색해보세요.</>}</div>} />
      </section>{framePanel(<aside className="shop-panel">
        {panelHeading(mobile && panelMode === 'outfit' || !mobile && showWardrobe ? '선택한 의상' : '아이템 정보')}{panelTabs}
        {(mobile ? panelMode === 'outfit' : showWardrobe) ? <><p className="shop-panel-count">직접 선택 {chosenCount}개</p>{wardrobe(slots)}<p className="shop-panel-note">선택하지 않은 부위는 기본 의상으로 표시됩니다.</p><button className="shop-primary" disabled={!sex || !ready} onClick={preview}><Box size={17} /> 선택한 아이템으로 미리보기</button></> : null}
        {detail && <section className="shop-detail" hidden={mobile && panelMode !== 'detail'} aria-label="선택한 아이템 정보"><h2>아이템 정보</h2><div className="shop-detail-image"><ItemImage item={detail} />{detail.is_new && <span className="shop-new-tag">NEW</span>}{(!detail.preview_available || !detail.model) && <span className="shop-preview-unavailable">미리보기 불가능</span>}</div><h3>{detail.name}</h3><div className="shop-price-options" role="group" aria-label="가격 옵션">{detail.prices.map(price => <button key={price.key} aria-pressed={selectedPrice?.key === price.key} onClick={() => setPriceKey(price.key)}>{price.label}</button>)}</div><div className="shop-detail-price">{selectedPrice ? <>{selectedPrice.amount.toLocaleString()} <small>{currency(selectedPrice.currency)}</small></> : '가격 정보 없음'}</div><h4>아이템 설명</h4><p className="shop-description">{detail.description || '등록된 추가 설명이 없습니다.'}</p><button className="shop-copy-item" onClick={() => copy(itemShareUrl(detail, detail.sex === 'common' ? sex : detail.sex, selectedPrice?.key))}><Copy size={15} /> 이 아이템 URL 복사</button></section>}
        {!detail && !(mobile ? panelMode === 'outfit' : showWardrobe) && <div className="shop-info-empty">아이템을 누르면 설명과 가격을 확인할 수 있습니다.</div>}
      </aside>)}</div>
    </>}
    {mobile && awayFromTop && !panelOpen && <button className="shop-floating-top" aria-label="페이지 맨 위로 이동" onClick={top}><ArrowUp size={18} /><span>맨 위로</span></button>}
    {(!mobile || !panelOpen) && copyTools}
    {favoriteSlot && authenticated && applied && meta && <ShopFavoritePicker key={`${user.id}:${favoriteSlot}:${applied.sex}`} slot={favoriteSlot} sex={applied.sex} version={meta.revision} selected={applied.slots[favoriteSlot]} favorites={favorites} onChoose={equipFavorite} onClose={() => setFavoriteSlot(null)} />}
    <footer className="shop-footer"><span>R2 ARCHIVE ㆍ 아이템 미리보기</span></footer>
  </main></>
}
