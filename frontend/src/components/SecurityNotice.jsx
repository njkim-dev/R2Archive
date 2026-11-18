import { useLayoutEffect, useRef } from 'react'
import { ShieldCheck } from 'lucide-react'
import { lockShopScroll } from './shop/shopModalScroll'
import '../styles/security-notice.css'

const noticeKey = 'r2archive:notice:CVE-2026-114938'
const autoShowUntil = Date.parse('2026-11-25T00:00:00+09:00')

export function shouldOpenSecurityNotice() {
  if (location.hostname !== 'r2archive.com' || Date.now() >= autoShowUntil) return false
  if (!/^\/(?:music\/?|xyx\/?|shop\/?|game-repair\/?)?$/.test(location.pathname)) return false
  if (new URLSearchParams(location.search).has('auth')) return false
  try {
    return localStorage.getItem(noticeKey) !== '1'
  } catch {
    return true
  }
}

export default function SecurityNotice({ onClose }) {
  const dialog = useRef(null)
  const confirm = useRef(null)

  useLayoutEffect(() => {
    const node = dialog.current
    const releaseScroll = lockShopScroll()
    node.showModal()
    confirm.current.focus()
    return () => {
      node.close()
      releaseScroll()
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(noticeKey, '1') } catch {}
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="security-notice"
      aria-labelledby="security-notice-title"
      aria-describedby="security-notice-summary"
      onCancel={event => { event.preventDefault(); dismiss() }}
    >
      <header>
        <ShieldCheck size={24} aria-hidden="true" />
        <h2 id="security-notice-title">OpenJDK 보안 이슈 안내</h2>
      </header>
      <p id="security-notice-summary">
        R2 Archive는 2026년 11월 17일 공개된 OpenJDK 취약점(CVE-2026-114938)의 영향을 받지 않습니다.
        운영 중인 웹사이트와 API는 OpenJDK를 사용하지 않으며, 사이트는 평소처럼 이용하실 수 있습니다.
      </p>
      <p>앞으로도 R2 Archive를 안심하고 이용하실 수 있도록 운영 환경을 꾸준히 점검하고, 필요한 보안 업데이트를 신속히 적용하겠습니다.</p>
      <footer>
        <a href="https://www.boho.or.kr/kr/bbs/view.do?bbsId=B0000133&menuNo=205020&nttId=72313" target="_blank" rel="noopener noreferrer">KISA 보안 공지 보기</a>
        <button ref={confirm} type="button" onClick={dismiss}>확인</button>
      </footer>
    </dialog>
  )
}
