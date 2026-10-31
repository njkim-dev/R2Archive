import { useLayoutEffect,useRef,useState } from 'react'
import { getPublicHome } from '../../api/shopSharing'
import { myHomeId } from '../../utils/myHomeId'
import { lockShopScroll } from './shopModalScroll'
export default function ShopPartnerUrlDialog({version,onChoose,onClose}){
  const dialog=useRef(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useLayoutEffect(()=>{const node=dialog.current,release=lockShopScroll();node.showModal();return()=>{node.close();release()}},[])
  async function submit(event){
    event.preventDefault();if(busy)return;setBusy(true);setError('')
    try{
      const target=new URL(url),match=/^\/myhome\/([^/]+)\/?$/.exec(target.pathname)
      if(target.origin!=='https://r2archive.com'||!match||!myHomeId(decodeURIComponent(match[1])).valid)throw new Error('친구 캐릭터의 마이홈 URL을 입력해주세요.')
      const entry=await getPublicHome(decodeURIComponent(match[1]),version)
      if(onChoose(entry)!==false)onClose()
    }catch(e){setError(typeof e.response?.data?.detail==='string'?e.response.data.detail:e.message||'의상을 불러오지 못했습니다.')}
    finally{setBusy(false)}
  }
  return <dialog ref={dialog} className="shop-home-id-dialog" aria-label="내 커플 의상 불러오기" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}><form onSubmit={submit}><h2>내 커플 의상 불러오기</h2><label htmlFor="couple-home-url">친구 캐릭터의 마이홈 URL</label><input id="couple-home-url" type="url" autoFocus value={url} onChange={e=>setUrl(e.target.value)} disabled={busy} required/><p className="shop-home-id-status" role={error?'alert':'status'}>{error||(busy?'의상을 불러오는 중입니다.':'')}</p><div><button type="button" onClick={onClose} disabled={busy}>닫기</button><button disabled={busy||!url}>의상 불러오기</button></div></form></dialog>
}
