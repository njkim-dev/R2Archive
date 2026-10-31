import { useEffect, useRef, useState } from 'react'
import { getShopWardrobe } from '../../api/shop'
import { getCharacter,saveCharacterItems,removeCharacterItem,setCharacterMain } from '../../api/shopCharacters'

const empty = { ids: new Set(),privateIds:new Set(), mains: [], ready: false, pending: false, error: '' }
const message = error => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : '내 의상을 저장하거나 불러오지 못했습니다. 다시 시도해주세요.'
export default function useShopWardrobe(userId, version, characterId = null) {
  const [state, setState] = useState(empty)
  const [retry, setRetry] = useState(0)
  const current = useRef(null)
  useEffect(() => {
    const session = { owner: userId, version, characterId, busy: false }
    current.current = session
    setState(previous=>previous.owner===userId&&previous.version===version&&previous.characterId===characterId?{...previous,error:''}:{...empty,owner:userId,version,characterId})
    if (!userId || !version) return
    const controller = new AbortController()
    const request=characterId ? getCharacter(characterId,version,controller.signal) : getShopWardrobe(version, controller.signal)
    request.then(data => {
      if (controller.signal.aborted || current.current !== session) return
      setState({ owner: userId, version, characterId, character:data.character, ids: new Set(data.ids.map(String)),privateIds:new Set(data.private_ids||[]), mains: data.mains, ready: true, pending: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted && current.current === session) setState(previous => ({ ...previous, error: message(error) }))
    })
    return () => { controller.abort(); if (current.current === session) current.current = null }
  }, [userId, version, characterId, retry])
  async function write(item, sex, operation) {
    const session = current.current
    if (!characterId || !session || session.owner !== userId || session.version !== version || session.busy || !state.ready) return false
    session.busy = true
    setState(previous => ({ ...previous, pending: true, error: '' }))
    try {
      const data = operation === 'remove' ? await removeCharacterItem(characterId,item.id,version) : sex ? await setCharacterMain(characterId,item.id,version) : await saveCharacterItems(characterId,operation==='all'?item:[item.id],version)
      if (current.current !== session) return false
      setState({ owner: userId, version, characterId, character:data.character, ids: new Set(data.ids.map(String)),privateIds:new Set(data.private_ids||[]), mains: data.mains, ready: true, pending: false, error: '' })
      return true
    } catch (error) {
      if (current.current === session) setState(previous => ({ ...previous, pending: false, error: message(error) }))
      return false
    } finally { session.busy = false }
  }
  const owned = !!userId && state.owner === userId && state.version === version && state.characterId === characterId
  return { ...(owned ? state : empty), save: item => write(item), remove: item => write(item, null, 'remove'), saveAll: items => write(items, null, 'all'), setMain: (item, sex) => write(item, sex), reload: () => setRetry(value => value + 1) }
}
