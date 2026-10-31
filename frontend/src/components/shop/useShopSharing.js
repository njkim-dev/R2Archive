import { useEffect, useRef, useState } from 'react'
import { getMyHomeLink, getPublicHome, removeMyHomeLink } from '../../api/shopSharing'
import { getCoupleHome } from '../../api/shopCouples'

export function useMyHomeLink(userId,characterId) {
  const [state, setState] = useState({ owner: null, handle: null, ready: false, busy: false, error: '' })
  const owner = useRef(null); const identity=userId&&characterId?`${userId}:${characterId}`:null;owner.current=identity
  useEffect(() => {
    setState({ owner: identity, handle: null, ready: false, busy: false, error: '' })
    if (!identity) return
    const controller = new AbortController()
    getMyHomeLink(characterId,controller.signal).then(data => { if (!controller.signal.aborted) setState({ owner: identity, handle: data.handle, ready: true, busy: false, error: '' }) }).catch(() => { if (!controller.signal.aborted) setState(previous => ({ ...previous, error: '마이홈 공유 정보를 불러오지 못했습니다.' })) })
    return () => controller.abort()
  }, [identity])
  async function remove() {
    if (!identity || state.busy) return
    setState(previous => ({ ...previous, busy: true, error: '' }))
    try { await removeMyHomeLink(characterId); if (owner.current === identity) setState({ owner:identity,handle:null,ready:true,busy:false,error:'' }) }
    catch { if (owner.current === identity) setState(previous => ({ ...previous,busy:false,error:'마이홈 공유 URL을 제거하지 못했습니다.' })) }
  }
  const current = state.owner === identity && !!identity
  return { ...(current ? state : { handle:null,ready:false,busy:false,error:'' }), remove, published: data => { if (owner.current === identity) setState({ owner:identity,handle:data.handle,ready:true,busy:false,error:'' }) } }
}

export function usePublicHome(handle, version) {
  const [state, setState] = useState({ ready:false,ids:new Set(),mains:[],epoch:0,error:'' })
  useEffect(() => {
    if (!handle || !version) return
    const controller = new AbortController()
    let signature, busy = false
    async function load() {
      if (busy || document.hidden) return
      busy = true
      try {
        const data = await (handle.startsWith('partner:')?getCoupleHome(handle.slice(8),version,controller.signal):getPublicHome(handle,version,controller.signal))
        if (controller.signal.aborted) return
        const next = JSON.stringify([data.ids,data.mains.map(main => [main.sex,main.slot,main.item.id])])
        const changed = signature !== undefined && signature !== next
        signature = next
        setState(previous => ({ ...data,ids:new Set(data.ids),ready:true,epoch:previous.epoch+(changed?1:0),error:'' }))
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ ...previous,ready:true,error:error.response?.data?.detail || '공유 마이홈을 불러오지 못했습니다.' }))
      } finally { busy = false }
    }
    load()
    const timer = setInterval(load,30000)
    window.addEventListener('focus',load)
    document.addEventListener('visibilitychange',load)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus',load); document.removeEventListener('visibilitychange',load) }
  }, [handle,version])
  return state
}
