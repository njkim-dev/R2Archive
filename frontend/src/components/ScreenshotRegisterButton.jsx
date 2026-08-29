import { lazy, Suspense, useEffect, useState } from 'react'
import useStore from '../store/useStore'

const ScreenshotRegisterModal = lazy(() => import('./ScreenshotRegisterModal'))

export default function ScreenshotRegisterButton({
  className = 'reg-btn',
  title = '스크린샷으로 개인 성과 등록',
  label = '성과 등록',
}) {
  const user = useStore(state => state.user)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (open) setLoaded(true)
  }, [open])

  if (!user) return null

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title={title}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        {label}
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <ScreenshotRegisterModal open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
