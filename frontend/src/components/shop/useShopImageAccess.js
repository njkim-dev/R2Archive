import { useCallback, useEffect, useRef, useState } from 'react'
import { getShopImageAccess } from '../../api/shop'

export const GUEST_IMAGE_LIMIT_MESSAGE = '비로그인 사용자는 이미지 검색이 5회로 제한됩니다'

export default function useShopImageAccess(authLoaded, userId) {
  const [access, setAccess] = useState(null), [error, setError] = useState('')
  const sequence = useRef(0), owner = useRef(userId)
  owner.current = userId
  const refresh = useCallback(async () => {
    if (!authLoaded || userId) return null
    const request = ++sequence.current
    try {
      const data = await getShopImageAccess()
      if (!Number.isInteger(data.remaining) || data.remaining < 0) throw new Error('Invalid search allowance')
      if (request === sequence.current && !owner.current) { setAccess(data); setError('') }
      return data
    } catch {
      if (request === sequence.current && !owner.current) { setAccess(null); setError('이용 가능 횟수를 확인하지 못했습니다. 새로고침해주세요.') }
      return null
    }
  }, [authLoaded, userId])
  useEffect(() => {
    setAccess(null); setError(''); refresh()
    const focus = () => { refresh() }
    window.addEventListener('focus', focus)
    return () => { sequence.current++; window.removeEventListener('focus', focus) }
  }, [refresh])
  const update = useCallback(data => { if (!owner.current && data) { sequence.current++; setAccess(data); setError('') } }, [])
  const exhausted = !userId && access?.remaining === 0
  return { access, refresh, update, allowed: authLoaded && (!!userId || access?.remaining > 0),
    tooltip: exhausted ? GUEST_IMAGE_LIMIT_MESSAGE : !userId ? error || (!access ? '이용 가능 횟수를 확인하고 있습니다.' : undefined) : undefined }
}
