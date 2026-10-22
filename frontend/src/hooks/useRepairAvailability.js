import { useCallback, useEffect, useRef, useState } from 'react'

export const repairStatusError = '복구 서비스 운영 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'

export default function useRepairAvailability() {
  const [status, setStatus] = useState(null)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    let data
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch('/api/game-repair/status', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('status unavailable')
      data = await response.json()
      if (typeof data.enabled !== 'boolean' || typeof data.revision !== 'string' || !data.revision) throw new Error('invalid status')
      if (typeof data.message !== 'string') data.message = ''
    } catch {
      data = { enabled: false, revision: 'unavailable', message: repairStatusError }
    } finally { window.clearTimeout(timeout) }
    if (id === requestId.current) setStatus(data)
    return id === requestId.current ? data : null
  }, [])
  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 10000)
    const focus = () => refresh()
    window.addEventListener('focus', focus)
    return () => { requestId.current++; window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [refresh])
  return { status, refresh }
}
