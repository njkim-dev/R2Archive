import { useCallback, useEffect, useState } from 'react'
import { getMyPerceivedLevels } from '../api/client'
import useStore from '../store/useStore'

const EMPTY_LEVELS = Object.freeze({})

export function useMyPerceivedLevels(enabled) {
  const userId = useStore(s => s.user?.id)
  const revision = useStore(s => s.perceivedRevision)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (!enabled || userId == null) {
      setResult(null)
      return
    }
    let cancelled = false
    setResult(null)
    getMyPerceivedLevels().then(levels => {
      if (!cancelled) setResult({ userId, levels, status: 'ready' })
    }).catch(() => {
      if (!cancelled) setResult({ userId, levels: EMPTY_LEVELS, status: 'error' })
    })
    return () => { cancelled = true }
  }, [enabled, userId, revision, attempt])

  // 계정 전환 직후에는 이전 계정의 응답을 표시하지 않는다.
  const current = result?.userId === userId ? result : null
  return {
    levels: enabled && userId != null ? (current?.levels ?? EMPTY_LEVELS) : null,
    status: enabled && userId != null ? (current?.status ?? 'loading') : 'idle',
    retry,
  }
}
