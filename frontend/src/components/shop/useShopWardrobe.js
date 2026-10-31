import { useEffect, useRef, useState } from 'react'
import { getShopWardrobe, saveShopWardrobe, setShopWardrobeMain } from '../../api/shop'

const empty = { ids: new Set(), mains: [], ready: false, pending: false, error: '' }
const message = error => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : '내 의상을 저장하거나 불러오지 못했습니다. 다시 시도해주세요.'
export default function useShopWardrobe(userId, version) {
  const [state, setState] = useState(empty)
  const [retry, setRetry] = useState(0)
  const current = useRef(null)
  useEffect(() => {
    const session = { owner: userId, version, busy: false }
    current.current = session
    setState({ ...empty, owner: userId, version })
    if (!userId || !version) return
    const controller = new AbortController()
    getShopWardrobe(version, controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== session) return
      setState({ owner: userId, version, ids: new Set(data.ids.map(String)), mains: data.mains, ready: true, pending: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted && current.current === session) setState(previous => ({ ...previous, error: message(error) }))
    })
    return () => { controller.abort(); if (current.current === session) current.current = null }
  }, [userId, version, retry])
  async function write(item, sex) {
    const session = current.current
    if (!session || session.owner !== userId || session.version !== version || session.busy || !state.ready) return false
    session.busy = true
    setState(previous => ({ ...previous, pending: true, error: '' }))
    try {
      const data = sex ? await setShopWardrobeMain(item.id, sex, version) : await saveShopWardrobe(item.id, version)
      if (current.current !== session) return false
      setState({ owner: userId, version, ids: new Set(data.ids.map(String)), mains: data.mains, ready: true, pending: false, error: '' })
      return true
    } catch (error) {
      if (current.current === session) setState(previous => ({ ...previous, pending: false, error: message(error) }))
      return false
    } finally { session.busy = false }
  }
  const owned = !!userId && state.owner === userId && state.version === version
  return { ...(owned ? state : empty), save: item => write(item), setMain: (item, sex) => write(item, sex), reload: () => setRetry(value => value + 1) }
}
