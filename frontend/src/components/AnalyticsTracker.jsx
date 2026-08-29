import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageview } from '../api/client'
import { isXyxMode } from '../utils/serverMode'

function currentPath() {
  return window.location.pathname
}

function currentServer(path) {
  if (isXyxMode()) return 'xyx'
  if (path.startsWith('/pmang-songs')) return 'pmang'
  return 'kr'
}

function currentDevice() {
  if (window.matchMedia?.('(max-width: 767px)').matches) return 'mobile'
  if (window.matchMedia?.('(max-width: 1100px)').matches) return 'tablet'
  return 'desktop'
}

export default function AnalyticsTracker() {
  const location = useLocation()
  const lastSentRef = useRef({ path: '', at: 0 })

  useEffect(() => {
    const send = () => {
      const path = currentPath()
      const now = Date.now()
      const last = lastSentRef.current
      if (last.path === path && now - last.at < 10000) return
      lastSentRef.current = { path, at: now }
      trackPageview({
        path,
        title: document.title,
        server: currentServer(path),
        referrer: document.referrer || null,
        device: currentDevice(),
      })
    }

    const timer = window.setTimeout(send, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [location.pathname])

  return null
}
