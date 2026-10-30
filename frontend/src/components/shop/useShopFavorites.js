import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteShopFavorite, getShopFavorites, saveShopFavorite } from '../../api/shop'

const empty = new Set()
export default function useShopFavorites(userId) {
  const [revision, reload] = useState(0)
  const [state, setState] = useState({ owner: null, ids: empty, ready: false, error: '' })
  const [pending, setPending] = useState(new Set())
  const current = useRef({ owner: null, ids: empty, pending: new Set() })
  useEffect(() => {
    const session = { owner: userId, ids: new Set(), pending: new Set() }
    current.current = session
    setPending(new Set())
    setState({ owner: userId, ids: session.ids, ready: false, error: '' })
    if (!userId) return
    const controller = new AbortController()
    getShopFavorites(controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== session) return
      session.ids = new Set((data.ids || []).map(String))
      setState({ owner: userId, ids: session.ids, ready: true, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted && current.current === session) setState({ owner: userId, ids: session.ids, ready: false, error: error.response?.data?.detail || '즐겨찾기를 불러오지 못했습니다.' })
    })
    return () => { controller.abort(); if (current.current === session) current.current = { owner: null, ids: empty, pending: new Set() } }
  }, [userId, revision])
  const toggle = useCallback(async item => {
    const session = current.current, id = String(item.id)
    if (!userId || session.owner !== userId || session.pending.has(id)) return false
    const wasSaved = session.ids.has(id)
    session.pending.add(id)
    session.ids = new Set(session.ids)
    if (wasSaved) session.ids.delete(id); else session.ids.add(id)
    setPending(new Set(session.pending))
    setState({ owner: userId, ids: session.ids, ready: true, error: '' })
    try {
      if (wasSaved) await deleteShopFavorite(id); else await saveShopFavorite(id, item.version)
      return true
    } catch (error) {
      if (current.current === session) {
        session.ids = new Set(session.ids)
        if (wasSaved) session.ids.add(id); else session.ids.delete(id)
        setState({ owner: userId, ids: session.ids, ready: true, error: error.response?.data?.detail || '즐겨찾기를 저장하지 못했습니다. 다시 시도해주세요.' })
      }
      return false
    } finally {
      session.pending.delete(id)
      if (current.current === session) setPending(new Set(session.pending))
    }
  }, [userId])
  const owned = state.owner === userId && !!userId
  return { ids: owned ? state.ids : empty, ready: owned && state.ready, error: owned ? state.error : '', pending: owned ? pending : empty, toggle, reload: () => reload(value => value + 1) }
}
