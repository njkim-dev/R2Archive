import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { checkMyHomeId, publishMyHome } from '../../api/shopSharing'
import { myHomeId } from '../../utils/myHomeId'
import { lockShopScroll } from './shopModalScroll'

export const HOME_DISCLOSURE='다른사람이 해당 URL로 접속 시, 내 마이홈에 등록된 아이템을 다른사람이 실시간으로 볼 수 있습니다.\n공개하고 싶지 않은 아이템은 비공개하세요.'
export default function ShopHomeIdDialog({ onClose, onPublished, characterId, initialName = '',anchorRef }) {
  const dialog = useRef(null)
  const [input, setInput] = useState(initialName), [status, setStatus] = useState(''), [available, setAvailable] = useState(false), [saving, setSaving] = useState(false)
  const value = myHomeId(input)
  useLayoutEffect(() => { const node = dialog.current, release = lockShopScroll(); node.showModal();function position(){if(!anchorRef?.current)return;const anchor=anchorRef.current.getBoundingClientRect(),box=node.getBoundingClientRect();node.style.left=Math.max(14,Math.min(anchor.left,innerWidth-box.width-14))+'px';node.style.top=Math.max(14,Math.min(anchor.bottom+8,innerHeight-box.height-14))+'px'}position();window.addEventListener('resize',position);return () => {window.removeEventListener('resize',position);node.close();release() } }, [])
  useEffect(() => {
    setAvailable(false)
    if (!input) { setStatus(''); return }
    if (!value.valid) { setStatus('영어ㆍ숫자ㆍ한글ㆍ[ㆍ]ㆍ-ㆍ_만 사용하여 20byte 이내로 입력해주세요.'); return }
    setStatus('중복 확인 중입니다.')
    const controller = new AbortController()
    const timer = setTimeout(() => checkMyHomeId(value.handle, controller.signal,characterId).then(data => {
      if (!controller.signal.aborted) { setAvailable(data.available); setStatus(data.available ? '사용할 수 있는 ID입니다.' : '이미 사용 중인 ID입니다.') }
    }).catch(error => { if (!controller.signal.aborted) setStatus(error.response?.data?.detail || '중복 확인에 실패했습니다.') }), 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [input])
  async function submit(event) {
    event.preventDefault()
    if (!value.valid || !available || saving) return
    setSaving(true)
    try { const result = await publishMyHome(value.handle,characterId); onPublished(result) }
    catch (error) { setStatus(error.response?.data?.detail || '공유 ID를 저장하지 못했습니다.'); setAvailable(false) }
    finally { setSaving(false) }
  }
  return <dialog ref={dialog} className={'shop-home-id-dialog'+(anchorRef?' shop-home-id-anchored':'')} aria-label="내 마이홈 복사" onCancel={event => { event.preventDefault(); if (!saving) onClose() }}>
    <form onSubmit={submit}><h2>내 마이홈 복사</h2><p className="shop-home-id-disclosure" style={{whiteSpace:'pre-line'}}>{HOME_DISCLOSURE}</p><label htmlFor="shop-home-id">원하는 ID를 입력하세요.</label><input id="shop-home-id" autoFocus autoComplete="off" maxLength={20} value={input} onChange={event => setInput(event.target.value)} disabled={saving} /><small>{value.bytes} / 20byte ㆍ 영어ㆍ숫자ㆍ한글ㆍ[ ] - _</small><p className="shop-home-id-status" role="status">{status}</p><div><button type="button" disabled={saving} onClick={onClose}>닫기</button><button type="submit" disabled={!value.valid || !available || saving}>{saving ? '저장 중' : 'URL 생성ㆍ복사'}</button></div></form></dialog>
}
