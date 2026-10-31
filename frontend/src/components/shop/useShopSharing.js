import { useEffect, useRef, useState } from 'react'
import { getMyHomeLink, getPublicHome, removeMyHomeLink } from '../../api/shopSharing'

export function useMyHomeLink(userId) {
  const [state, setState] = useState({ owner: null, handle: null, ready: false, busy: false, error: '' })
  const owner = useRef(userId); owner.current = userId
  useEffect(() => {
    setState({ owner: userId, handle: null, ready: false, busy: false, error: '' })
    if (!userId) return
    const controller = new AbortController()
    getMyHomeLink(controller.signal).then(data => { if (!controller.signal.aborted) setState({ owner: userId, handle: data.handle, ready: true, busy: false, error: '' }) }).catch(() => { if (!controller.signal.aborted) setState(previous => ({ ...previous, error: '마이홈 공유 정보를 불러오지 못했습니다.' })) })
    return () => controller.abort()
  }, [userId])
  async function remove() {
    if (!userId || state.busy) return
    setState(previous => ({ ...previous, busy: true, error: '' }))
    try { await removeMyHomeLink(); if (owner.current === userId) setState({ owner:userId,handle:null,ready:true,busy:false,error:'' }) }
    catch { if (owner.current === userId) setState(previous => ({ ...previous,busy:false,error:'마이홈 공유 URL을 제거하지 못했습니다.' })) }
  }
  const current = state.owner === userId && !!userId
  return { ...(current ? state : { handle:null,ready:false,busy:false,error:'' }), remove, published: data => { if (owner.current === userId) setState({ owner:userId,handle:data.handle,ready:true,busy:false,error:'' }) } }
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
        const data = await getPublicHome(handle,version,controller.signal)
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
