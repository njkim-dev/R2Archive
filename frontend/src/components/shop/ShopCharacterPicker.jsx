import { useLayoutEffect,useRef,useState } from 'react'
import { createCharacter } from '../../api/shopCharacters'
import { myHomeId } from '../../utils/myHomeId'
import { lockShopScroll } from './shopModalScroll'
import ShopCharacterCards from './ShopCharacterCards'

export default function ShopCharacterPicker({characters,version,onChoose,onClose,create=false,sexFilter=null,title='캐릭터 선택',allowCreate=true}){
  const dialog=useRef(null),[creating,setCreating]=useState(create),[sex,setSex]=useState(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useLayoutEffect(()=>{const node=dialog.current,release=lockShopScroll();node.showModal();return()=>{node.close();release()}},[])
  async function choose(entry){if(busy)return;setBusy(true);setError('');try{await onChoose(entry)}catch(e){setError(typeof e.response?.data?.detail==='string'?e.response.data.detail:e.message||'불러오지 못했습니다.')}finally{setBusy(false)}}
  async function submit(event){event.preventDefault();if(!sex||!myHomeId(name).valid||busy)return;setBusy(true);setError('');try{const entry=await createCharacter(name,sex,version);characters.reload();await onChoose(entry)}catch(e){setError(typeof e.response?.data?.detail==='string'?e.response.data.detail:'캐릭터를 생성하지 못했습니다.')}finally{setBusy(false)}}
  const items=characters.items.filter(entry=>!sexFilter||entry.character.sex===sexFilter)
  return <dialog className="shop-character-dialog" data-creating={creating} ref={dialog} aria-label={creating?'새 캐릭터 추가':title} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <header><h2>{creating?'새 캐릭터 추가':title}</h2><button disabled={busy} onClick={onClose}>닫기</button></header>
    <p className="shop-character-status" role={error?'alert':'status'}>{error||characters.error||(!characters.ready?'캐릭터를 불러오는 중입니다.':'')}</p>
    {creating?<form onSubmit={submit}><h3>성별을 선택해주세요.</h3><div className="shop-character-sex">{[['male','남성'],['female','여성']].map(([value,label])=><button key={value} type="button" aria-pressed={sex===value} disabled={busy||!!sexFilter&&sexFilter!==value} onClick={()=>setSex(value)}>{label}</button>)}</div>{sex&&<><label htmlFor="character-name">캐릭터 이름</label><input id="character-name" autoComplete="off" maxLength={20} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/><small>영어ㆍ숫자ㆍ한글ㆍ[ ] - _ / {myHomeId(name).bytes} / 20byte</small><button className="shop-primary" disabled={busy||!myHomeId(name).valid}>캐릭터 만들기</button></>}</form>:<ShopCharacterCards items={items} busy={busy} onChoose={choose} onCreate={allowCreate&&characters.items.length<17?()=>setCreating(true):undefined}/>}
  </dialog>
}
