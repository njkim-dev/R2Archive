import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react'
import { Check,Copy,X } from 'lucide-react'
import { lockShopScroll } from './shopModalScroll'
import { createShortUrl } from '../../api/shopSharing'
import {getCouples,getCoupleHome} from '../../api/shopCouples'
import {getCharacter} from '../../api/shopCharacters'
import {useCouples} from './ShopCouplesContext'
import { getShopItem } from '../../api/shop'
import { coupleShareUrl,SHOP_SLOTS } from '../../utils/shopUrl'
import useStore from '../../store/useStore'
import useCharacters from './useCharacters'
import ShopCharacterPicker from './ShopCharacterPicker'
import ShopPartnerUrlDialog from './ShopPartnerUrlDialog'
import ShopViewModes from './ShopViewModes'
import ShopViewer from './ShopViewer'

const empty=()=>Object.fromEntries(SHOP_SLOTS.map(slot=>[slot,null]))
const renderSlots=slots=>({...slots,pet:null,accessory:null,summon:null})
const mainSlots=mains=>Object.fromEntries(SHOP_SLOTS.map(slot=>[slot,mains.find(main=>main.slot===slot&&main.item.preview_available&&main.item.model)?.item||null]))

export default function ShopCouplePreview({selection,meta,onStart,onClose}){
  const dialog=useRef(null),[camera,setCamera]=useState({angle:selection.angle??180,zoom:selection.zoom??100,panX:selection.panX??0,panY:selection.panY??0}),[mode,setMode]=useState('rotate')
  const [actors,setActors]=useState(null),[error,setError]=useState(''),[toast,setToast]=useState(''),[fallback,setFallback]=useState(''),[urlPicker,setUrlPicker]=useState(false),[ownPicker,setOwnPicker]=useState(false)
  const timer=useRef(null),fallbackInput=useRef(null),active=useRef(true)
  const couples=useCouples(),partnerReads=useRef(new Map()),fallbackNotified=useRef(false)
  const [fallbackNotice,setFallbackNotice]=useState(false),[viewerReady,setViewerReady]=useState(false)
  function readPartnerOnce(key,load){if(!partnerReads.current.has(key))partnerReads.current.set(key,load());return partnerReads.current.get(key)}
  const {user,authLoaded}=useStore(),characters=useCharacters(ownPicker&&authLoaded?user?.id:null,meta.revision)
  useEffect(()=>{active.current=true;return()=>{active.current=false;clearTimeout(timer.current)}},[])
  useEffect(()=>{if(!fallbackNotice||!viewerReady)return;const timeout=setTimeout(()=>setFallbackNotice(false),2000);return()=>clearTimeout(timeout)},[fallbackNotice,viewerReady])
  useEffect(()=>{if(fallback){fallbackInput.current?.focus();fallbackInput.current?.select()}},[fallback])
  useLayoutEffect(()=>{const node=dialog.current,release=lockShopScroll();node.showModal();return()=>{node.close();release()}},[])
  useEffect(()=>{
    let cancelled=false
    if(!selection.shared&&!selection.disableAutoPartner&&!authLoaded)return
    async function restore(){
      let primary={sex:selection.sex,slots:selection.slots}
      if(selection.useCharacterMains&&selection.characterId&&!selection.shared&&user){
        try{const entry=await readPartnerOnce('character:'+selection.characterId+':'+meta.revision,()=>getCharacter(selection.characterId,meta.revision));primary={sex:entry.character.sex,slots:mainSlots(entry.mains)}}
        catch{throw new Error('선택한 캐릭터의 의상을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')}
        if(cancelled)return
      }
      let savedPartner=null
      if(!selection.shared&&!selection.disableAutoPartner&&!selection.partner&&user){
        try{
          const relationships=couples.ready?couples.items:(await readPartnerOnce('relationships',()=>getCouples())).relationships||[]
          const candidates=relationships.filter(row=>row.status==='accepted'&&row.character.sex===primary.sex)
          const id=selection.characterId?relationships.find(row=>row.status==='accepted'&&row.character.id===selection.characterId)?.character.id:candidates.length===1?candidates[0].character.id:null
          if(id){const entry=await readPartnerOnce(id+':'+meta.revision,()=>getCoupleHome(id,meta.revision));if(entry.character.sex===primary.sex&&!selection.item.couple_preview.same_sex_motions?.[primary.sex]){if(!cancelled&&!fallbackNotified.current){fallbackNotified.current=true;setFallbackNotice(true)}}else savedPartner={sex:entry.character.sex,slots:mainSlots(entry.mains)}}
        }catch(e){if(e.response?.status!==404&&!cancelled)notify('커플 의상을 불러오지 못해 대응 의상으로 표시합니다.')}
      }
      const partner=selection.partner?{sex:selection.partner.sex,slots:{...selection.partner.slots}}:savedPartner||{sex:primary.sex==='male'?'female':'male',slots:empty()}
      if(!selection.partner&&!savedPartner)await Promise.all(SHOP_SLOTS.map(async key=>{
        const item=primary.slots[key];if(!item)return
        if(item.sex==='common'){partner.slots[key]=item;return}
        if(!item.counterpart_id)return
        const other=await getShopItem(item.counterpart_id,meta.revision)
        if(other.sex===partner.sex&&other.slot===key&&other.preview_available&&other.model)partner.slots[key]=other
      }))
      if(partner.sex===primary.sex&&!selection.item.couple_preview.same_sex_motions?.[primary.sex])throw new Error('동성 커플이 불가능한 반지입니다.')
      if(!cancelled)setActors({primary,partner})
    }
    restore().catch(e=>{if(!cancelled)setError(e.message||'선택한 의상을 불러오지 못했습니다.')})
    return()=>{cancelled=true}
  },[selection.slots,selection.sex,selection.partner,selection.item,selection.characterId,selection.useCharacterMains,meta,authLoaded])
  const figures=useMemo(()=>actors?{primary:renderSlots(actors.primary.slots),partner:renderSlots(actors.partner.slots)}:null,[actors])
  const motion=useMemo(()=>{
    if(!actors||!selection.started)return null
    const spec=selection.item.couple_preview
    return actors.primary.sex===actors.partner.sex?{...spec,motion:spec.same_sex_motions[actors.primary.sex]}:spec
  },[actors,selection.started,selection.item])
  function notify(message){clearTimeout(timer.current);setToast(message);timer.current=setTimeout(()=>setToast(''),2600)}
  async function copy(){
    if(!actors)return
    let url
    try{url=await createShortUrl(coupleShareUrl({version:meta.revision,...selection,sex:actors.primary.sex,slots:actors.primary.slots,partner:actors.partner,...camera}))}catch{if(active.current)notify('공유 URL을 만들지 못했습니다. 다시 시도해주세요.');return}
    if(!active.current)return
    setFallback('');let copied=true
    try{await navigator.clipboard.writeText(url)}catch{copied=false}
    if(!active.current)return
    if(!copied)setFallback(url)
    notify(copied?'URL을 복사했습니다':'URL을 직접 복사해주세요')
  }
  function importPartner(entry){
    if(!actors)return false
    if(entry.character.sex===actors.primary.sex&&!selection.item.couple_preview.same_sex_motions?.[actors.primary.sex]){alert('동성 커플이 불가능한 반지입니다.');return false}
    const slots=empty()
    for(const main of entry.mains)if(SHOP_SLOTS.includes(main.slot)&&main.item.preview_available&&main.item.model)slots[main.slot]=main.item
    setActors(previous=>({...previous,partner:{sex:entry.character.sex,slots}}));return true
  }
  return <dialog ref={dialog} className="shop-couple-dialog" aria-label="커플 모션 미리보기" onCancel={event=>{event.preventDefault();onClose()}}>
    <div className="shop-couple-heading"><div><h2>커플 모션 미리보기</h2><p>{selection.item.name||`커플링 ${selection.item.id}`}</p></div><div className="shop-couple-actions"><button disabled={!actors||selection.shared&&(!authLoaded||!user)} title={selection.shared&&!user?'로그인이 필요합니다.':undefined} onClick={()=>selection.shared?setOwnPicker(true):setUrlPicker(true)}>{selection.shared?'내 캐릭터 의상 불러오기':'내 커플 의상 불러오기'}</button><button disabled={!actors} onClick={copy}><Copy size={16}/><span>URL 복사</span></button><button aria-label="커플 모션 미리보기 닫기" onClick={onClose}><X size={22}/><span>닫기</span></button></div></div>
    <div className="shop-couple-viewport">
      {actors&&!error?<ShopViewer meta={meta} sex={actors.primary.sex} partnerSex={actors.partner.sex} slots={figures.primary} counterparts={figures.partner} pair selectedSex={actors.primary.sex} angle={camera.angle} zoom={camera.zoom} panX={camera.panX} panY={camera.panY} mode={mode} onViewChange={setCamera} onReady={()=>setViewerReady(true)} couplePreview={selection.item.couple_preview} motion={motion} audioContext={selection.audioContext} audioReady={selection.audioReady}/>:<div className="shop-stage"><div className="shop-stage-status" role={error?'alert':'status'}>{error||'선택한 의상을 준비 중입니다.'}</div></div>}
      {fallbackNotice&&viewerReady&&<div className="shop-couple-fallback-notice" role="status" aria-live="polite"><span>동성 커플은 이성 커플 정보를 볼 수 없어, 동일한 이성 의상으로 대체합니다.</span><button aria-label="의상 대체 안내 닫기" onClick={()=>setFallbackNotice(false)}><X size={16}/></button></div>}
      {!selection.started&&actors&&!error&&<div className="shop-couple-start"><button onClick={onStart}>커플 모션 시작</button><p>버튼을 누르면 모션과 소리가 함께 재생됩니다.</p></div>}
    </div>
    <ShopViewModes mode={mode} onChange={setMode}/>
    <p className="shop-couple-note">선택하지 않은 부위와 대응 아이템이 없는 부위는 기본 의상으로 표시됩니다.</p>
    <p className="shop-couple-purchase-note">게임 내 아이템과는 차이가 있을 수 있습니다. 반드시 인 게임에서 상세히 확인 후 구매하시기 바랍니다.</p>
    {toast&&<div className="shop-toast" role="status" aria-live="polite"><Check size={16}/>{toast}</div>}
    {fallback&&<div className="shop-couple-copy-fallback" role="dialog" aria-label="커플 모션 URL 직접 복사"><div><b>URL 직접 복사</b><button aria-label="커플 모션 URL 직접 복사 닫기" onClick={()=>setFallback('')}><X size={16}/></button></div><input ref={fallbackInput} aria-label="커플 모션 공유 URL" value={fallback} readOnly onFocus={e=>e.target.select()}/></div>}
    {urlPicker&&<ShopPartnerUrlDialog version={meta.revision} onChoose={importPartner} onClose={()=>setUrlPicker(false)}/>}
    {ownPicker&&user&&<ShopCharacterPicker title="내 캐릭터 의상 불러오기" characters={characters} version={meta.revision} allowCreate={false} onChoose={entry=>{if(importPartner(entry))setOwnPicker(false)}} onClose={()=>setOwnPicker(false)}/>}
  </dialog>
}
