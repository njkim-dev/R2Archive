import {createContext,useContext,useEffect,useRef,useState} from 'react'
import useStore from '../../store/useStore'
import {getCouples,requestCouple,acceptCouple,removeCouple} from '../../api/shopCouples'
import {lockShopScroll} from './shopModalScroll'
import '../../styles/shopRelationships.css'

const Context=createContext({items:[],ready:false,busy:false,request:async()=>{},accept:async()=>{},remove:async()=>{},openRequest:()=>{}})
export const useCouples=()=>useContext(Context)
export default function ShopCouplesProvider({children}){
  const {user,authLoaded}=useStore(),uid=authLoaded?user?.id:null,owner=useRef(uid);owner.current=uid
  const [state,setState]=useState({owner:null,items:[],ready:false}),[epoch,setEpoch]=useState(0),[prompt,setPrompt]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const seen=useRef(new Set()),writeLock=useRef(false)
  useEffect(()=>{setPrompt(null);seen.current.clear();setError('');setBusy(false);writeLock.current=false},[uid])
  useEffect(()=>{
    if(!uid){setState({owner:null,items:[],ready:false});return}
    let active=true,loading=false;const abort=new AbortController()
    async function load(){if(loading||document.hidden)return;loading=true;try{const data=await getCouples(abort.signal);if(active)setState({owner:uid,items:data.relationships||[],ready:true})}catch{if(active)setState(old=>old.owner===uid?{...old,ready:true}:{owner:uid,items:[],ready:true})}finally{loading=false}}
    load();const timer=setInterval(load,30000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load)
    return()=>{active=false;abort.abort();clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load)}
  },[uid,epoch])
  const items=uid&&state.owner===uid?state.items:[],ready=!!uid&&state.owner===uid&&state.ready
  useEffect(()=>{
    const next=items.find(item=>item.status==='pending'&&item.incoming&&!seen.current.has(item.id))
    if(!next||prompt)return
    function show(){if(document.hidden||document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'))return;seen.current.add(next.id);setError('');setPrompt(next)}
    show();const timer=setInterval(show,1000);return()=>clearInterval(timer)
  },[items,prompt])
  useEffect(()=>{if(prompt&&!items.some(item=>item.id===prompt.id&&item.status==='pending'))setPrompt(null)},[items,prompt])
  async function write(operation){if(writeLock.current)return false;const current=uid;writeLock.current=true;setBusy(true);setError('');try{await operation();if(owner.current===current){setEpoch(value=>value+1);return true}return false}catch(e){if(owner.current===current){setEpoch(value=>value+1);setError(e.response?.data?.detail||'커플 정보를 변경하지 못했습니다.')}throw e}finally{if(owner.current===current){writeLock.current=false;setBusy(false)}}}
  const value={items,ready,busy,request:(id,url)=>write(()=>requestCouple(id,url)),accept:(id,rid)=>write(()=>acceptCouple(id,rid)),remove:(id,rid,status)=>write(()=>removeCouple(id,rid,status)),openRequest:item=>{seen.current.add(item.id);setError('');setPrompt(item)}}
  return <Context.Provider value={value}>{children}{prompt&&uid&&state.owner===uid&&<CoupleConsent request={prompt} busy={busy} error={error} onClose={()=>setPrompt(null)} onAccept={async()=>{try{if(await value.accept(prompt.character.id,prompt.id))setPrompt(null)}catch{}}} onReject={async()=>{try{if(await value.remove(prompt.character.id,prompt.id,'pending'))setPrompt(null)}catch{}}}/>}</Context.Provider>
}

function CoupleConsent({request,busy,error,onClose,onAccept,onReject}){
  const dialog=useRef(null)
  useEffect(()=>{const node=dialog.current,release=lockShopScroll();node.showModal();return()=>{node.close();release()}},[])
  return <dialog ref={dialog} className="r2-couple-dialog" aria-label="커플 등록 요청" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}><h2>커플 등록 요청</h2><p>{request.requester_name} 사용자가 커플 등록을 요청했습니다. 수락하시겠습니까?</p><p className="r2-couple-characters">{request.character.name} ↔ {request.partner.name}</p><p className="r2-couple-status" role={error?'alert':'status'}>{error}</p><div><button disabled={busy} onClick={onClose}>나중에</button><button disabled={busy} onClick={onReject}>거절</button><button disabled={busy} onClick={onAccept}>수락</button></div></dialog>
}
