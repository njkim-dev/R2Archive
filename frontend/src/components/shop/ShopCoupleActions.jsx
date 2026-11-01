import {useEffect,useRef,useState} from 'react'
import {useCouples} from './ShopCouplesContext'
import {lockShopScroll} from './shopModalScroll'
import {myHomeId} from '../../utils/myHomeId'

const homePrefix='https://r2archive.com/myhome/'
function pastedHandle(value){
  const text=value.trim()
  if(!/^https?:\/\//i.test(text))return text
  try{const target=new URL(text),match=/^\/myhome\/([^/]+)\/?$/.exec(target.pathname);if(target.origin==='https://r2archive.com'&&match)return decodeURIComponent(match[1])}catch{}
  return text
}

export default function ShopCoupleActions({characterId}){
  const couples=useCouples(),relation=couples.items.find(item=>item.character.id===characterId),[open,setOpen]=useState(false),[error,setError]=useState('')
  useEffect(()=>setError(''),[relation?.id,relation?.status])
  async function remove(){if(relation.status==='accepted'&&!confirm('정말로 커플을 파기하시겠습니까?'))return;try{await couples.remove(characterId,relation.id,relation.status);setError('')}catch(e){setError(e.response?.data?.detail||'커플 정보를 변경하지 못했습니다.')}}
  return <div className="shop-couple-controls"><div>{relation?.status==='accepted'?<><button disabled={couples.busy} onClick={remove}>커플 파기</button><a className="shop-partner-link" href={relation.url}>커플 마이홈으로 이동</a></>:relation?.incoming?<button disabled={couples.busy} onClick={()=>couples.openRequest(relation)}>커플 수락</button>:relation?<button disabled={couples.busy} onClick={remove}>커플 요청 취소</button>:<button disabled={!couples.ready||couples.busy} onClick={()=>setOpen(true)}>커플 등록</button>}</div>{error&&<span role="alert">{error}</span>}{open&&<RequestDialog onClose={()=>setOpen(false)} onSubmit={async url=>{if(await couples.request(characterId,url))setOpen(false)}} busy={couples.busy}/>}</div>
}

function RequestDialog({onClose,onSubmit,busy}){
  const dialog=useRef(null),[url,setUrl]=useState(''),[error,setError]=useState('')
  useEffect(()=>{const node=dialog.current,release=lockShopScroll();node.showModal();return()=>{node.close();release()}},[])
  async function submit(event){event.preventDefault();if(busy)return;setError('');const id=myHomeId(pastedHandle(url));if(!id.valid){setError('올바른 마이홈 ID를 입력해주세요.');return}try{await onSubmit(homePrefix+encodeURIComponent(id.handle))}catch(e){setError(e.response?.data?.detail||'커플 등록을 요청하지 못했습니다.')}}
  return <dialog ref={dialog} className="r2-couple-dialog" aria-label="커플 등록" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}><form onSubmit={submit}><h2>커플 등록</h2><label htmlFor="shop-couple-url">커플로 등록할 캐릭터의 마이홈 URL</label><section className="shop-couple-url-field"><span>{homePrefix}</span><input id="shop-couple-url" type="text" required maxLength={512} autoFocus value={url} onChange={event=>setUrl(pastedHandle(event.target.value))} onPaste={event=>{const text=event.clipboardData.getData('text').trim(),id=pastedHandle(text);if(id!==text){event.preventDefault();setUrl(id)}}} disabled={busy} autoComplete="off" spellCheck={false}/></section><p className="r2-couple-status" role={error?'alert':'status'}>{error||'상대방이 수락하면 커플로 등록됩니다. 같은 계정의 캐릭터는 즉시 등록됩니다.'}</p><div><button type="button" disabled={busy} onClick={onClose}>닫기</button><button disabled={busy||!url.trim()}>커플 요청 보내기</button></div></form></dialog>
}
