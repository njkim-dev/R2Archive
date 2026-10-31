import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowUp, Box, Check, Copy, Search, Star, Users, X } from 'lucide-react'
import useStore from '../store/useStore'
import { getShopItem, getShopItems, getShopMeta } from '../api/shop'
import { itemShareUrl, outfitShareUrl, readShopUrl, rememberShopReturn, SHOP_SLOTS, SLOT_LABELS, OPTIONAL_SLOT_LABELS } from '../utils/shopUrl'
import { SHOP_GROUPS, PET_GROUPS, PET_SUPPLY_GROUPS } from '../utils/shopCategories'
import ShopOutfitPreview from '../components/shop/ShopOutfitPreview'
import { readWardrobeSession, saveWardrobeSession } from '../utils/shopWardrobeSession'
import ShopViewModes from '../components/shop/ShopViewModes'
import ShopViewer from '../components/shop/ShopViewer'
import ItemImage, { ShopImageSession } from '../components/shop/ShopImage'
import ShopVirtualGrid from '../components/shop/ShopVirtualGrid'
import ShopFavoriteButton from '../components/shop/ShopFavoriteButton'
import ShopFavoritePicker from '../components/shop/ShopFavoritePicker'
import useShopFavorites from '../components/shop/useShopFavorites'
import useShopWardrobe from '../components/shop/useShopWardrobe'
import ShopMobilePanel from '../components/shop/ShopMobilePanel'
import ShopCouplePreview from '../components/shop/ShopCouplePreview'
import { canPreviewItem } from '../utils/shopPreview'
import ShopHomeIdDialog from '../components/shop/ShopHomeIdDialog'
import { useMyHomeLink, usePublicHome } from '../components/shop/useShopSharing'
import { createShortUrl, myHomeUrl } from '../api/shopSharing'
import '../styles/shop.css'
import '../styles/shopWardrobe.css'
import '../styles/shopSharing.css'
import '../styles/shopCharacters.css'
import useCharacters from '../components/shop/useCharacters'
import ShopCharacterPicker from '../components/shop/ShopCharacterPicker'
import { saveCharacterItems,removeCharacterItem } from '../api/shopCharacters'

const emptySlots = () => Object.fromEntries(SHOP_SLOTS.map(slot => [slot, null]))
const DEPARTMENTS = [['wearable', '꾸미기ㆍ펫'], ['functional', '기능성ㆍ소모품'], ['other', '기타']]
const currency = value => value === 'cash' ? '캐시' : '알코인'
const defaultPrice = item => item?.is_unreleased ? null : item?.prices?.find(p => p.key === 'PI') || item?.prices?.find(p => p.key === 'P30') || item?.prices?.[0]
const errorText = error => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : Array.isArray(error?.response?.data?.detail) ? '검색어나 공유 URL을 확인해주세요.' : error?.message || '상점 정보를 불러오지 못했습니다.'
function coupleAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext
  let audioContext, audioReady
  try { audioContext = new Audio(); audioReady = audioContext.resume().then(() => true, () => false) } catch { audioReady = Promise.resolve(false) }
  return { audioContext, audioReady, started: true }
}

export default function ShopPage({allCharacters=false}) {
  const location = useLocation(), { handle,characterId } = useParams()
  return <div className="shop-app"><ShopImageSession><ShopContent key={`${handle || ''}:${characterId||''}:${allCharacters}:${location.search}`} search={location.search} publicHome={handle || null} characterId={characterId||null} privateHome={allCharacters||!!characterId} /></ShopImageSession></div>
}

function ShopContent({ search, publicHome,characterId,privateHome }) {
  const location = useLocation(), navigate = useNavigate()
  const navigationOwner = useRef(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).current
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 800px)').matches)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('outfit')
  const [awayFromTop, setAwayFromTop] = useState(() => window.scrollY > 600)
  const { authLoaded, user, openLogin, logout } = useStore()
  const currentOwner=useRef(user?.id);currentOwner.current=user?.id
  const favorites = useShopFavorites(authLoaded ? user?.id : null)
  const authenticated = authLoaded && !!user
  const [favoriteSlot, setFavoriteSlot] = useState(null)
  useEffect(() => { setFavoriteSlot(null) }, [user?.id])
  const initial = useRef(readShopUrl(search)).current
  const [meta, setMeta] = useState(null)
  const [targetCharacter,setTargetCharacter]=useState(null)
  const [saveRequest,setSaveRequest]=useState(null)
  const [savingOwned,setSavingOwned]=useState(false),saveLock=useRef(false)
  const storageCharacter=characterId||(!privateHome?targetCharacter:null)
  const characters=useCharacters(authLoaded?user?.id:null,meta?.revision)
  const owned = useShopWardrobe(authLoaded ? user?.id : null, meta?.revision,storageCharacter)
  const [homeOnly, setHomeOnly] = useState(!!publicHome||privateHome)
  const sharing = useMyHomeLink(authLoaded && !publicHome ? user?.id : null,characterId)
  const publicData = usePublicHome(publicHome, meta?.revision)
  const homeData = publicHome ? publicData : owned
  const [idDialog, setIdDialog] = useState(false)
  useEffect(() => { setIdDialog(false) }, [user?.id])
  const mainOwner = useRef(null)
  const touched = useRef({ male: new Set(), female: new Set() })
  const [ready, setReady] = useState(false)
  const [catalogDepartment, setDepartment] = useState('wearable')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteDepartment, setFavoriteDepartment] = useState('')
  const [favoriteSex, setFavoriteSex] = useState('')
  const department = favoritesOnly ? favoriteDepartment : catalogDepartment
  const [sex, setSex] = useState(initial.sex || (publicHome ? 'female' : null))
  const [slot, setSlot] = useState('')
  const [group, setGroup] = useState('')
  const [subgroup, setSubgroup] = useState('')
  const [query, setQuery] = useState('')
  const [pairedOnly, setPairedOnly] = useState(false)
  const [hideUnavailable, setHideUnavailable] = useState(true)
  const [hideUnreleased, setHideUnreleased] = useState(true)
  const [listing, setListing] = useState({ items: [], total: 0, has_more: false })
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState(emptySlots)
  const wardrobes = useRef({ male: emptySlots(), female: emptySlots() })
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
  const [pan, setPan] = useState({ panX: initial.panX, panY: initial.panY })
  const [viewMode, setViewMode] = useState('rotate')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  const [couple, setCouple] = useState(null)
  const coupleWasOpen = useRef(false)
  const previousCoupleNavigation = useRef(false)
  const coupleOpen = !!couple && location.state?.shopCoupleMotion === navigationOwner
  useEffect(() => {
    if (coupleOpen) coupleWasOpen.current = true
    else if (coupleWasOpen.current && couple) {
      coupleWasOpen.current = false
      if (couple.audioContext && couple.audioContext.state !== 'closed') couple.audioContext.close().catch(() => {})
      setCouple(null)
    }
  }, [coupleOpen, couple])
  useEffect(() => () => {
    if (couple?.audioContext && couple.audioContext.state !== 'closed') couple.audioContext.close().catch(() => {})
  }, [couple])
  function openCouple() {
    if (!detail?.couple_preview) return
    setCouple({ item: detail, sex: sex || 'male', slots: { ...slots }, ...coupleAudio() })
    navigate(location.pathname + location.search, { state: { ...location.state, shopCoupleMotion: navigationOwner }, preventScrollReset: true })
  }
  function startCouple() {
    if (couple && !couple.started) setCouple({ ...couple, ...coupleAudio() })
  }
  const listRequest = useRef(null)
  const scrollPosition = useRef(0)
  const restoreScroll = useRef(false)
  const toastTimer = useRef(null)
  const listSex = favoritesOnly ? favoriteSex : department === 'wearable' ? sex : null
  const showWardrobe = homeOnly || department === 'wearable' || favoritesOnly && !department
  const needsSex = !favoritesOnly && department === 'wearable' && !sex
  const visibleItems = publicHome ? listing.items : homeOnly ? listing.items.filter(item => owned.ids.has(item.id)) : favoritesOnly ? listing.items.filter(item => favorites.ids.has(item.id)) : listing.items
  const visibleTotal = Math.max(0, listing.total - (listing.items.length - visibleItems.length))
  const listKey = JSON.stringify([ready, meta?.revision, department, listSex, slot, group, subgroup, query, pairedOnly, hideUnavailable, hideUnreleased, favoritesOnly, homeOnly,characterId,homeOnly?[...owned.ids].join(','):'', (favoritesOnly || homeOnly) ? user?.id : null, favoritesOnly && favorites.ready, homeOnly && homeData.ready, publicHome, publicData.epoch])
  useEffect(()=>{setSaveRequest(null);setTargetCharacter(null)},[user?.id])
  useEffect(()=>{if(homeOnly&&homeData.character?.sex)setSex(homeData.character.sex)},[homeOnly,homeData.character?.sex,sex])
  useEffect(() => { if (!authenticated) { setFavoritesOnly(false); if (!publicHome&&!privateHome) setHomeOnly(false) } }, [authenticated, publicHome,privateHome])
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
  useLayoutEffect(() => {
    const active = location.state?.shopCoupleMotion === navigationOwner
    if (!active && !previousCoupleNavigation.current) { setPanelOpen(false); setFavoriteSlot(null) }
    previousCoupleNavigation.current = active
  }, [location.key, location.state, navigationOwner])
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
        const saved = publicHome||privateHome ? null : readWardrobeSession(catalog.revision)
        const remembered = { male: emptySlots(), female: emptySlots() }
        if (saved) await Promise.all(['male', 'female'].flatMap(gender => SHOP_SLOTS.map(async key => {
          const id = saved.wardrobes[gender][key]
          if (!id) return
          try {
            const item = await getShopItem(id, catalog.revision)
            if (item.slot === key && item.preview_available && item.model && ['common', gender].includes(item.sex)) remembered[gender][key] = item
          } catch {}
        })))
        if (cancelled) return
        wardrobes.current = remembered
        const rememberedSex = privateHome||publicHome?null:initial.sex || saved?.sex
        if (rememberedSex) { setSex(rememberedSex); setSlots(remembered[rememberedSex]) }
        if (initial.couple || initial.preview || SHOP_SLOTS.some(key => initial.slots[key])) {
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
          if (initial.couple) {
            if (!initial.item) throw new Error('공유된 커플링 정보를 확인해주세요.')
            const item = await getShopItem(initial.item, catalog.revision)
            if (cancelled) return
            if (item.category !== '507' || !item.couple_preview) throw new Error('공유된 커플링은 모션 미리보기를 지원하지 않습니다.')
            setDepartment('functional'); setGroup('couple'); setDetail(item); setQuery(item.name.slice(0, 120))
            let partner=null
            if(initial.partner){const otherSlots=emptySlots();await Promise.all(SHOP_SLOTS.map(async key=>{const id=initial.partner.slots[key];if(!id)return;const other=await getShopItem(id,catalog.revision);if(other.slot!==key||!other.preview_available||!other.model||!['common',initial.partner.sex].includes(other.sex))throw new Error('공유된 상대 의상을 확인해주세요.');otherSlots[key]=other}));if(cancelled)return;partner={sex:initial.partner.sex,slots:otherSlots}}
            setCouple({ item, sex: gender, slots: chosen, partner, shared:true, angle: initial.angle, zoom: initial.zoom, panX: initial.panX, panY: initial.panY, started: false })
            navigate(location.pathname + location.search, { replace: !!location.state?.shopCoupleMotion, state: { ...location.state, shopCoupleMotion: navigationOwner }, preventScrollReset: true })
          }
        } else if (initial.item) {
          const item = await getShopItem(initial.item, catalog.revision)
          if (cancelled) return
          const gender = item.sex === 'common' ? initial.sex || saved?.sex || 'male' : item.sex
          setDepartment(item.department); setSex(gender); setSlots(remembered[gender]); setDetail(item)
          if (item.is_unreleased) setHideUnreleased(false)
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

  useEffect(() => {
    const ownerKey = publicHome ? `${publicHome}:${homeData.epoch}` : characterId?`character:${characterId}`:user?.id
    if (!ready || !homeData.ready || mainOwner.current === ownerKey) return
    mainOwner.current = ownerKey
    if (initial.item || initial.preview || initial.couple || SHOP_SLOTS.some(key => initial.slots[key])) return
    for (const gender of ['male', 'female']) {
      const defaults = homeData.mains.filter(main => main.sex === gender && !touched.current[gender].has(main.slot) && main.item.preview_available && main.item.model)
      const updates = Object.fromEntries(defaults.map(main => [main.slot, main.item]))
      if (publicHome) for (const key of SHOP_SLOTS) if (!touched.current[gender].has(key) && !updates[key]) updates[key] = null
      wardrobes.current[gender] = { ...wardrobes.current[gender], ...updates }
      if (gender === (homeData.character?.sex||sex) && Object.keys(updates).length) setSlots(current => ({ ...current, ...updates }))
    }
  }, [ready, homeData.ready, homeData.mains, homeData.epoch, user?.id, initial, sex, publicHome])

  useEffect(() => {
    if (publicHome || privateHome || !ready || !meta || !sex) return
    wardrobes.current[sex] = slots
    saveWardrobeSession(meta.revision, sex, wardrobes.current)
  }, [ready, meta, sex, slots])

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
    if (!ready || !meta || needsSex || favoritesOnly && (!authenticated || !favorites.ready) || homeOnly && (publicHome ? !publicData.ready : !authenticated || !owned.ready)) { listRequest.current = null; setLoading(false); return }
    const context = { controller: new AbortController(), cursor: '', hasMore: true, busy: false, error: false, params: { version: meta.revision, department: department || undefined, sex: listSex || undefined, slot: slot || undefined, group: group || undefined, subgroup: subgroup || undefined, q: query, paired_only: !homeOnly && department === 'wearable' && pairedOnly, preview_only: !homeOnly && department === 'wearable' && hideUnavailable, include_unreleased: homeOnly || ['wearable','functional'].includes(department) && !hideUnreleased, owned_only: !publicHome && homeOnly || undefined, character_id:characterId||undefined, home: publicHome || undefined, favorites_only: favoritesOnly || undefined, page_size: 24 } }
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

  async function copy(url, shorten = true) {
    setCopyFallback('')
    let target
    try { target = shorten ? await createShortUrl(url) : url } catch (error) { notify(errorText(error)); return }
    try { await navigator.clipboard.writeText(target); notify('URL을 복사했습니다') }
    catch { setCopyFallback(target); notify('URL을 직접 복사해주세요') }
  }
  function choose(item) {
    if (homeOnly && !publicHome && characterId && item.department==='wearable') { chooseMain(item); return }
    if (!favoritesOnly && item.department === 'wearable' && item.slot && (!sex || !['common', sex].includes(item.sex))) return
    setDetail(item); setPriceKey(defaultPrice(item)?.key)
    if (mobile && (item.department !== 'wearable' || !item.preview_available || !item.model)) openPanel('detail')
    if (item.department === 'wearable' && item.slot && item.preview_available && item.model) {
      const gender = item.sex === 'common' ? sex || favoriteSex || 'male' : item.sex
      touched.current[gender].add(item.slot)
      if (gender !== sex) setSex(gender)
      setSlots(current => { const chosen = gender !== sex ? wardrobes.current[gender] : current; return { ...chosen, [item.slot]: chosen[item.slot]?.id === item.id ? null : item } })
    }
  }
  function resetFilters() { setSlot(''); setGroup(''); setSubgroup(''); setQuery(''); setDetail(null); setError('') }
  function changeDepartment(next) { setFavoritesOnly(false); setDepartment(next); resetFilters() }
  function changeSpace(home) { if(home){navigate('/myhome');return} if(privateHome||publicHome){navigate('/shop');return}setHomeOnly(false);setFavoritesOnly(false);setDepartment('wearable');resetFilters() }
  async function chooseMain(item) {
    if (!sex || !owned.ids.has(item.id) || !await owned.setMain(item, sex)) return
    if (item.preview_available && item.model) { touched.current[sex].add(item.slot); setSlots(current => ({ ...current, [item.slot]: item })) }
    setDetail(item); notify('메인 의상을 저장했습니다')
  }
  async function writeToCharacter(action,entry){
    const owner=user?.id
    if(!owner||owner!==currentOwner.current)return
    if(action.mode==='create'){setTargetCharacter(entry.character.id);setSaveRequest(null);return}
    if(saveLock.current)return
    saveLock.current=true;setSavingOwned(true)
    try{
      if(action.mode==='remove')await removeCharacterItem(entry.character.id,action.ids[0],meta.revision)
      else await saveCharacterItems(entry.character.id,action.ids,meta.revision)
      if(owner!==currentOwner.current)return
      if(!homeOnly&&!publicHome)setTargetCharacter(entry.character.id)
      characters.reload();owned.reload();setSaveRequest(null);notify(action.mode==='remove'?'내 의상에서 제거했습니다':'내 의상으로 저장했습니다')
    }finally{saveLock.current=false;setSavingOwned(false)}
  }
  function requestOwned(action){
    if(!authenticated)return
    if(characterId){writeToCharacter(action,{character:{id:characterId}}).catch(e=>setError(errorText(e)));return}
    const target=characters.items.find(entry=>entry.character.id===storageCharacter)
    if(target&&(!action.sex||target.character.sex===action.sex)){writeToCharacter(action,target).catch(e=>setError(errorText(e)));return}
    setSaveRequest(action)
  }
  function saveOwned(item){requestOwned({mode:'save',ids:[item.id],sex:item.sex==='common'?null:item.sex})}
  function removeOwned(item){requestOwned({mode:'remove',ids:[item.id],sex:item.sex==='common'?null:item.sex})}
  function saveAllOwned(){const ids=[...new Set(Object.values(applied?.slots||{}).filter(Boolean).map(item=>item.id))];if(ids.length)requestOwned({mode:'save',ids,sex:applied.sex})}
  async function copyHome(data) { if (data) { sharing.published(data); setIdDialog(false) } if (data?.handle || sharing.handle) await copy(myHomeUrl(data?.handle || sharing.handle), false); else setIdDialog(true) }
  function openFavorites() { setFavoritesOnly(true); setFavoriteDepartment(''); setFavoriteSex(sex || ''); resetFilters() }
  function changeSex(next) { if (sex !== next) { wardrobes.current[sex] = slots; setSex(next); setSlots(wardrobes.current[next] || emptySlots()); setDetail(null); setQuery(''); setListing({ items: [], total: 0, has_more: false }); setLoading(true) } }
  function preview() {
    if (!sex || !meta) return
    scrollPosition.current = window.scrollY
    restoreScroll.current = true
    setPanelOpen(false)
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
      const url = new URL(outfitShareUrl({ version: meta.revision, ...applied, pair, angle, zoom, ...pan }))
      target = url.pathname + url.search
    } else if (detail && department !== 'wearable') {
      const url = new URL(itemShareUrl(detail, sex, selectedPrice?.key))
      target = url.pathname + url.search
    } else if (sex && meta) {
      const url = new URL(outfitShareUrl({ version: meta.revision, sex, slots, pair, angle, zoom, ...pan }))
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
    touched.current[applied.sex].add(key)
    setFavoriteSlot(null)
    setSlots(current => ({ ...current, [key]: item }))
    setApplied(current => current.slots[key]?.id === item?.id ? current : ({ ...current, slots: { ...current.slots, [key]: item } }))
  }
  const chosenCount = Object.values(slots).filter(Boolean).length
  const selectedPrice = detail?.is_unreleased ? null : detail?.prices.find(p => p.key === priceKey) || defaultPrice(detail)
  const tags = item => <div className="shop-card-tags">{item.is_unreleased ? <span className="shop-unreleased-tag">미출시</span> : item.is_new ? <span className="shop-new-tag">NEW</span> : null}{owned.ids.has(item.id) && <span className="shop-owned-tag">내 아이템</span>}{homeOnly && homeData.mains.some(main => main.sex === sex && main.item.id === item.id) && <span className="shop-main-tag">메인</span>}</div>
  const renderCard = item => {
    const price = defaultPrice(item), selected = item.slot && slots[item.slot]?.id === item.id, savable=item.department==='wearable'&&item.slot||['couple','friend'].includes(item.group), saved=!!storageCharacter&&owned.ids.has(item.id)
    const ownerNames=privateHome&&!characterId?characters.items.filter(entry=>entry.ids.includes(item.id)).map(entry=>entry.character.name):[]
    const categoryLabel = [...PET_GROUPS, ...PET_SUPPLY_GROUPS, ...(SHOP_GROUPS[item.department] || [])].find(([key]) => key === item.subgroup || key === item.group)?.[1] || SLOT_LABELS[item.slot] || (item.department === 'functional' ? '공용 아이템' : '장식ㆍ기타')
    return <article className={`shop-card${selected || detail?.id === item.id ? ' is-selected' : ''}`} key={item.id} data-item-id={item.id} title={ownerNames.length?ownerNames.join('ㆍ'):undefined}>
      <ShopFavoriteButton item={item} saved={favorites.ids.has(item.id)} authenticated={authenticated} ready={favorites.ready} pending={favorites.clearing || favorites.pending.has(item.id)} onToggle={favorites.toggle} />
      <button className="shop-card-select" onClick={() => choose(item)} aria-label={`${item.name} ${item.slot && item.preview_available ? '의상 선택' : '자세히 보기'}`} aria-pressed={!!selected}>
        <div className="shop-card-image"><ItemImage item={item} />{tags(item)}{!canPreviewItem(item) && <span className="shop-preview-unavailable">미리보기 불가능</span>}{selected && <span className="shop-check"><Check size={13} /></span>}</div>
        <div className="shop-card-copy"><small>{categoryLabel}{item.sex !== 'common' ? ` ㆍ ${item.sex === 'male' ? '남성' : '여성'}` : ''}</small><strong title={item.name}>{item.name}</strong><div className="shop-card-price">{!item.is_unreleased && (price ? <><span>{price.amount.toLocaleString()} <small>{currency(price.currency)}</small></span><small>{price.label}</small></> : <small>가격 정보 없음</small>)}</div></div>
      </button><div className="shop-card-actions">{!publicHome && (homeOnly || item.department !== 'wearable'&&!savable) && <button disabled={homeOnly && (owned.pending||savingOwned)} onClick={() => homeOnly ? removeOwned(item) : choose(item)}>{homeOnly ? '내 의상에서 제거' : '자세히 보기'}</button>}{!publicHome && !homeOnly && savable && <button className="shop-save-owned" disabled={!authenticated || !owned.ready || !characters.ready || (owned.pending||savingOwned)} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : undefined} onClick={() => saved ? removeOwned(item) : saveOwned(item)}>{saved ? '내 의상에서 제거' : '내 의상으로 저장'}</button>}<button className="shop-card-copy-url" aria-label={`${item.name} URL 복사`} onClick={() => copy(itemShareUrl(item, item.sex === 'common' ? sex : item.sex, defaultPrice(item)?.key))}><Copy size={12} /> URL 복사</button></div>
      {ownerNames.length>0&&<><div className="shop-card-owner-names" role="note">{ownerNames.join('ㆍ')}</div><button className="shop-owner-info" aria-label={`${item.name} 보유 캐릭터 보기`} onClick={()=>alert(ownerNames.join('\n'))}><Users size={12}/></button></>}
    </article>
  }
  const wardrobe = (chosen, removable = true) => <div className="shop-slots">{SHOP_SLOTS.map(key => <div className="shop-slot" key={key}>
    <div className="shop-slot-thumb">{chosen[key] ? <ItemImage item={chosen[key]} /> : OPTIONAL_SLOT_LABELS[key] ? '없음' : '기본'}</div>
    <div><small>{SLOT_LABELS[key]}</small><span title={chosen[key]?.name}>{chosen[key]?.name || OPTIONAL_SLOT_LABELS[key] || (key === 'face' ? '기본 얼굴' : `기본 ${SLOT_LABELS[key]} 착용`)}</span></div>
    {chosen[key] && removable && <button aria-label={`${SLOT_LABELS[key]} 착용 해제`} onClick={() => { touched.current[sex].add(key); setSlots(current => ({ ...current, [key]: null })) }}><X size={15} /></button>}
    {!removable && <div className="shop-slot-actions"><button className="shop-slot-favorites" disabled={!authenticated || !favorites.ready} aria-label={`${SLOT_LABELS[key]} 즐겨찾기 열기`} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : '즐겨찾기에서 의상 바꾸기'} onClick={() => { setPanelOpen(false); setFavoriteSlot(key) }}>즐겨찾기</button><button className="shop-slot-save" disabled={!authenticated || !owned.ready || !characters.ready || (owned.pending||savingOwned) || !chosen[key] || !!storageCharacter&&owned.ids.has(chosen[key]?.id)} aria-label={`${SLOT_LABELS[key]} 내 의상으로 저장`} onClick={() => saveOwned(chosen[key])}>{!!storageCharacter&&owned.ids.has(chosen[key]?.id) ? '저장됨' : '저장'}</button></div>}
  </div>)}</div>

  const copyTools = <>
    {toast && <div className="shop-toast" role="status" aria-live="polite"><Check size={16} />{toast}</div>}
    {copyFallback && <div className="shop-copy-fallback" role="dialog" aria-label="URL 직접 복사"><div><b>URL 직접 복사</b><button aria-label="URL 직접 복사 닫기" onClick={() => setCopyFallback('')}><X size={16} /></button></div><input aria-label="공유 URL" value={copyFallback} readOnly onFocus={event => event.target.select()} /></div>}
  </>

  if(privateHome&&authLoaded&&!user)return <main className="share-link-status"><p>로그인 후 이용할 수 있습니다.</p><button onClick={openLogin}>로그인</button><Link to="/">홈으로</Link></main>
  if (publicHome && publicData.error) return <main className="share-link-status"><p role="alert">{publicData.error}</p><Link to="/shop">상점으로 이동</Link></main>
  return <><header className="shop-header" aria-hidden={view === 'preview' || undefined} inert={view === 'preview' ? '' : undefined}><Link to="/" className="shop-brand"><b>R2</b> ARCHIVE</Link><nav><a href="/music/">음악</a><span aria-current="page">상점</span><Link to="/game-repair">게임 복구</Link></nav><div className="shop-header-actions"><button className="shop-item-status" onClick={() => openPanel()}><Box size={15} /> 아이템 현황</button><button className="shop-login" disabled={!authLoaded} onClick={user ? logout : login}>{!authLoaded ? '확인 중' : user ? '로그아웃' : '로그인'}</button></div></header><main className="shop-main">
    <div className="shop-title" aria-hidden={view === 'preview' || undefined}><div><span>ITEM ARCHIVE</span><h1>{view === 'preview' ? '의상 미리보기' : publicHome ? `${homeData.character?.name || publicData.handle || publicHome}님의 마이홈` : characterId ? `${owned.character?.name||'캐릭터'}의 마이홈` : homeOnly ? '모든 캐릭터' : '아이템 상점'}</h1></div></div>
    <div className="shop-spaces" hidden={!!publicHome} role="tablist" aria-label="상점 공간" aria-hidden={view === 'preview' || undefined} inert={view === 'preview' ? '' : undefined}><button role="tab" aria-selected={!homeOnly} onClick={() => changeSpace(false)}>상점</button><button role="tab" aria-selected={homeOnly} disabled={!authenticated} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : undefined} onClick={() => changeSpace(true)}>마이홈</button></div>
    {privateHome&&<Link className="shop-back-characters" to="/myhome">← 캐릭터 목록</Link>}
    {!homeOnly&&!publicHome&&<div className="shop-storage-target"><label htmlFor="shop-storage-character">저장할 캐릭터</label><select id="shop-storage-character" value={targetCharacter||''} onChange={e=>setTargetCharacter(e.target.value||null)} disabled={!authenticated||!characters.ready||savingOwned}><option value="">캐릭터 선택</option>{characters.items.map(entry=><option key={entry.character.id} value={entry.character.id}>{entry.character.name} ({entry.character.sex==='female'?'여':'남'})</option>)}</select><button onClick={()=>setSaveRequest({mode:'create',ids:[],sex:null})} disabled={!authenticated||!characters.ready||characters.items.length>=17}>새 캐릭터 추가</button></div>}
    <div className="shop-feedback" aria-live="polite"><span role={error || favorites.error || owned.error || sharing.error ? 'alert' : undefined}>{error || favorites.error || owned.error || sharing.error}</span>{favorites.error && <button disabled={favorites.pending.size > 0} onClick={favorites.reload}>즐겨찾기 다시 불러오기</button>}{owned.error && <button disabled={(owned.pending||savingOwned)} onClick={owned.reload}>내 의상 다시 불러오기</button>}</div>
    {view === 'preview' && applied && meta ? <>
      <ShopOutfitPreview onClose={browse} onCopy={() => copy(outfitShareUrl({ version: meta.revision, ...applied, pair, angle, zoom, ...pan }))} tools={!panelOpen && copyTools} saveTools={<button disabled={!authenticated || !owned.ready || !characters.ready || (owned.pending||savingOwned) || !Object.values(applied.slots).some(Boolean)} onClick={saveAllOwned}>전부 내 의상으로 저장</button>} headerTools={<>{mobile && <button onClick={() => openPanel()}>아이템 현황</button>}{!user && <button disabled={!authLoaded} onClick={login}>로그인</button>}</>}>
      <div className="shop-preview-grid"><section>
        {pairLoading ? <div className="shop-stage"><div className="shop-stage-status">이성 아이템을 확인 중입니다.</div></div> : <ShopViewer meta={meta} sex={applied.sex} slots={applied.slots} counterparts={counterparts} pair={pair} angle={angle} zoom={zoom} panX={pan.panX} panY={pan.panY} mode={viewMode} onViewChange={next => { setAngle(next.angle); setZoom(next.zoom); setPan({ panX: next.panX, panY: next.panY }) }} />}
        <ShopViewModes mode={viewMode} onChange={setViewMode} />
        <button className="shop-pair" aria-pressed={pair} disabled={pairLoading} onClick={() => setPair(value => !value)}><Users size={17} /> 이성 아이템 함께 보기</button>
        <div className="shop-pair-note">{pair && !pairLoading && SHOP_SLOTS.filter(key => key !== 'pet' && applied.slots[key] && !counterparts[key]).length > 0 ? '대응 아이템이 없는 부위는 상대 캐릭터의 기본 의상으로 표시합니다.' : '선택하지 않은 부위는 기본 의상으로 표시됩니다.'}</div>
      </section>{framePanel(<aside className="shop-panel">{panelHeading('선택한 의상')}{wardrobe(applied.slots, false)}</aside>)}</div>
      <p className="shop-couple-purchase-note">게임 내 아이템과는 차이가 있을 수 있습니다. 반드시 인 게임에서 상세히 확인 후 구매하시기 바랍니다.</p>
      </ShopOutfitPreview>
    </> : <>
      <div className="shop-departments" role="tablist" aria-label="상점 분류">{(homeOnly ? DEPARTMENTS.slice(0, 2) : DEPARTMENTS).map(([value, label]) => <button key={value} role="tab" aria-selected={!favoritesOnly && department === value} onClick={() => changeDepartment(value)}>{label}</button>)}{!homeOnly && <><button className="shop-clear-favorites" disabled={!authenticated || !favorites.ready || favorites.clearing || favorites.pending.size > 0 || !favorites.ids.size} onClick={() => { if (window.confirm('등록된 모든 즐겨찾기가 전부 제거됩니다. 계속 하시겠습니까?')) favorites.clear() }}>즐겨찾기 초기화</button><button className="shop-favorites-tab" role="tab" aria-selected={favoritesOnly} disabled={!authenticated || !favorites.ready} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : '저장한 모든 아이템 보기'} onClick={openFavorites}><Star size={15} /> 즐겨찾기</button></>}</div>
      {homeOnly && !publicHome && characterId && <div className="shop-home-share"><button disabled={!sharing.ready || sharing.busy} onClick={() => copyHome()}>내 마이홈 URL 복사</button>{sharing.handle && <button disabled={sharing.busy} onClick={sharing.remove}>내 마이홈 URL 제거</button>}</div>}
      {favoritesOnly && <div className="shop-favorite-categories" role="group" aria-label="즐겨찾기 아이템 분류">{[['', '전체'], ...DEPARTMENTS].map(([value, label]) => <button key={value} aria-pressed={department === value} onClick={() => { setFavoriteDepartment(value); resetFilters() }}>{label}</button>)}</div>}
      <div className="shop-gender-row">{favoritesOnly ? <><b>성별</b><div>{[['', '전체 성별'], ['female', '여성'], ['male', '남성']].map(([value, label]) => <button key={value} aria-pressed={favoriteSex === value} onClick={() => setFavoriteSex(value)}>{label}</button>)}</div>{showWardrobe && <button className="shop-mobile-preview" aria-label="선택한 아이템으로 미리보기" disabled={!sex || !ready} onClick={preview}>미리보기 ({chosenCount})</button>}</> : department === 'wearable' ? <><b>캐릭터 성별</b><div>{[['female', '여성'], ['male', '남성']].map(([value, label]) => <button key={value} aria-pressed={sex === value} disabled={!!characterId||!!publicHome} onClick={() => changeSex(value)}>{label}</button>)}</div><button className="shop-mobile-preview" aria-label="선택한 아이템으로 미리보기" disabled={!sex || !ready} onClick={preview}>미리보기 ({chosenCount})</button></> : <><b>{department === 'functional' ? '기능성ㆍ소모품' : '기타 아이템'}</b><span>아이템 설명과 기간별 가격을 확인해보세요.</span></>}</div>
      <div className="shop-workspace"><section className="shop-library" aria-label="아이템 목록">
        <label className="shop-search"><Search size={17} /><input aria-label="아이템 이름으로 검색" type="search" maxLength={120} placeholder="아이템 이름으로 검색" value={query} onChange={event => { setQuery(event.target.value) }} /></label>
        <div className="shop-filters" role="group" aria-label="아이템 세부 분류"><button aria-pressed={department === 'wearable' ? !slot : !group} onClick={() => { setSlot(''); setGroup(''); setSubgroup('') }}>전체</button>{department === 'wearable' ? SHOP_SLOTS.map(key => <button key={key} aria-pressed={slot === key} onClick={() => { setSlot(key); setSubgroup('') }}>{SLOT_LABELS[key]}</button>) : (SHOP_GROUPS[department] || []).filter(([key])=>!homeOnly||['couple','friend'].includes(key)).map(([key, label]) => <button key={key} aria-pressed={group === key} onClick={() => { setGroup(key); setSubgroup('') }}>{label}</button>)}</div>
        {(department === 'wearable' && slot === 'pet' || group === 'pet_supplies') && <div className="shop-filters shop-subfilters" role="group" aria-label={department === 'wearable' ? '펫 종류' : '펫 용품 종류'}><button aria-pressed={!subgroup} onClick={() => setSubgroup('')}>{department === 'wearable' ? '전체 펫' : '전체 펫 용품'}</button>{(department === 'wearable' ? PET_GROUPS : PET_SUPPLY_GROUPS).map(([key, label]) => <button key={key} aria-pressed={subgroup === key} onClick={() => setSubgroup(key)}>{label}</button>)}</div>}
        {!homeOnly && <div className="shop-pair-filter">{department === 'wearable' && <><label><input type="checkbox" checked={pairedOnly} onChange={event => setPairedOnly(event.target.checked)} /> 남녀 모두 존재하는 의상만</label><label><input type="checkbox" checked={hideUnavailable} onChange={event => setHideUnavailable(event.target.checked)} /> 미리보기 불가능 아이템 가리기</label><label><input type="checkbox" checked={hideUnreleased} onChange={event => setHideUnreleased(event.target.checked)} /> 미출시 아이템 가리기</label></>}{department==='functional'&&<label><input type="checkbox" checked={hideUnreleased} onChange={event=>setHideUnreleased(event.target.checked)}/> 미출시 아이템 가리기</label>}</div>}
        <div className="shop-list-status" aria-live="polite">{!ready ? '상점 데이터를 불러오는 중입니다.' : homeOnly && !homeData.ready ? '내 의상을 불러오는 중입니다.' : needsSex ? '성별을 먼저 선택해주세요.' : loading ? visibleItems.length ? '아이템을 더 불러오는 중입니다.' : '아이템을 불러오는 중입니다.' : `아이템 ${visibleTotal.toLocaleString()}개`}</div>
        {initial.item && <div className="shop-shared-item"><b>공유된 아이템</b><span>{detail?.name || '아이템 정보를 확인 중입니다.'}</span></div>}
        <ShopVirtualGrid key={listKey} resetKey={listKey} scrollPosition={scrollPosition} restoreScroll={restoreScroll} items={visibleItems} hasMore={listing.has_more} loading={loading} error={error} loadMore={loadMore} renderItem={renderCard} empty={<div className="shop-empty">{needsSex ? <>어떤 캐릭터로 입어볼까요?<br />위에서 성별을 선택해주세요.</> : !ready || loading || homeOnly && !homeData.ready ? '아이템을 불러오는 중입니다.' : error ? '목록을 불러오지 못했습니다.' : homeOnly ? <>저장한 의상이 없습니다.<br />상점에서 내 의상으로 저장해주세요.</> : favoritesOnly ? <>표시할 즐겨찾기가 없습니다.<br />아이템의 ☆를 눌러 등록해주세요.</> : <>표시할 아이템이 없습니다.<br />다른 이름이나 분류로 검색해보세요.</>}</div>} />
      </section>{framePanel(<aside className="shop-panel">
        {panelHeading(mobile && panelMode === 'outfit' || !mobile && showWardrobe ? '선택한 의상' : '아이템 정보')}{panelTabs}
        {(mobile ? panelMode === 'outfit' : showWardrobe) ? <><p className="shop-panel-count">직접 선택 {chosenCount}개</p>{wardrobe(slots)}<p className="shop-panel-note">선택하지 않은 부위는 기본 의상으로 표시됩니다.</p><button className="shop-primary" disabled={!sex || !ready} onClick={preview}><Box size={17} /> 선택한 아이템으로 미리보기</button></> : null}
        {detail && <section className="shop-detail" hidden={mobile && panelMode !== 'detail'} aria-label="선택한 아이템 정보"><h2>아이템 정보</h2><div className="shop-detail-image"><ItemImage item={detail} />{tags(detail)}{!canPreviewItem(detail) && <span className="shop-preview-unavailable">미리보기 불가능</span>}</div><h3>{detail.name}</h3>{!detail.is_unreleased && <><div className="shop-price-options" role="group" aria-label="가격 옵션">{detail.prices.map(price => <button key={price.key} aria-pressed={selectedPrice?.key === price.key} onClick={() => setPriceKey(price.key)}>{price.label}</button>)}</div><div className="shop-detail-price">{selectedPrice ? <>{selectedPrice.amount.toLocaleString()} <small>{currency(selectedPrice.currency)}</small></> : '가격 정보 없음'}</div></>}<h4>아이템 설명</h4><p className="shop-description">{detail.description || '등록된 추가 설명이 없습니다.'}</p>{detail.category === '507' && <button className="shop-couple-preview-button" disabled={!detail.couple_preview} onClick={openCouple}>선택한 커플링 미리보기</button>}<button className="shop-copy-item" onClick={() => copy(itemShareUrl(detail, detail.sex === 'common' ? sex : detail.sex, selectedPrice?.key))}><Copy size={15} /> 이 아이템 URL 복사</button></section>}
        {!detail && !(mobile ? panelMode === 'outfit' : showWardrobe) && <div className="shop-info-empty">아이템을 누르면 설명과 가격을 확인할 수 있습니다.</div>}
      </aside>)}</div>
    </>}
    {mobile && awayFromTop && !panelOpen && <button className="shop-floating-top" aria-label="페이지 맨 위로 이동" onClick={top}><ArrowUp size={18} /><span>맨 위로</span></button>}
    {view !== 'preview' && (!mobile || !panelOpen) && copyTools}
    {idDialog && authenticated && !publicHome && <ShopHomeIdDialog onClose={() => setIdDialog(false)} onPublished={copyHome} characterId={characterId} initialName={owned.character?.name||''} />}
    {saveRequest&&authenticated&&<ShopCharacterPicker characters={{...characters,items:saveRequest.mode==='remove'?characters.items.filter(entry=>saveRequest.ids.some(id=>entry.ids.includes(id))):characters.items}} version={meta?.revision} title={saveRequest.mode==='remove'?'제거할 캐릭터 선택':'저장할 캐릭터 선택'} sexFilter={saveRequest.sex} create={saveRequest.mode==='create'||characters.ready&&!characters.items.length} allowCreate={saveRequest.mode!=='remove'} onChoose={entry=>writeToCharacter(saveRequest,entry)} onClose={()=>setSaveRequest(null)}/>}
    {favoriteSlot && authenticated && applied && meta && <ShopFavoritePicker key={`${user.id}:${favoriteSlot}:${applied.sex}`} slot={favoriteSlot} sex={applied.sex} version={meta.revision} selected={applied.slots[favoriteSlot]} favorites={favorites} onChoose={equipFavorite} onClose={() => setFavoriteSlot(null)} />}
    {coupleOpen && <ShopCouplePreview selection={couple} meta={meta} onStart={startCouple} onClose={() => navigate(-1)} />}
    <footer className="shop-footer"><span>R2 ARCHIVE ㆍ 아이템 미리보기</span></footer>
  </main></>
}
