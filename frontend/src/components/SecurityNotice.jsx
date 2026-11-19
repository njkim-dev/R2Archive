import { useLayoutEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { lockShopScroll } from './shop/shopModalScroll'
import '../styles/security-notice.css'

const notices = [
  {
    id: 'nginx-http2',
    key: 'r2archive:notice:nginx-http2-2026-11-19',
    autoShowUntil: Date.parse('2026-11-26T00:00:00+09:00'),
    title: '웹 서버 보안 대응 안내 — 11월 19일',
    paragraphs: [
      'R2 Archive는 2026년 11월 19일 공개된 NGINX HTTP/2 보안 취약점에 대응하여 HTTP/2를 일시적으로 비활성화했습니다.',
      '이미지가 많은 화면의 초기 로딩이 평소보다 느려질 수 있습니다.',
      '해당 조치는 공식 수정 패치 적용 여부를 확인할 때까지 유지합니다.',
      '앞으로도 필요한 보안 이슈에 대해 신속히 대응하겠습니다.',
    ],
    href: 'https://nginx.org/en/security_advisories.html',
    linkText: 'NGINX 공식 보안 공지 보기',
  },
  {
    id: 'openjdk',
    key: 'r2archive:notice:CVE-2026-114938',
    autoShowUntil: Date.parse('2026-11-25T00:00:00+09:00'),
    title: 'OpenJDK 보안 이슈 안내',
    paragraphs: [
      'R2 Archive는 2026년 11월 17일 공개된 OpenJDK 취약점(CVE-2026-114938)의 영향을 받지 않습니다. 운영 중인 웹사이트와 API는 OpenJDK를 사용하지 않으며, 사이트는 평소처럼 이용하실 수 있습니다.',
      '앞으로도 R2 Archive를 안심하고 이용하실 수 있도록 운영 환경을 꾸준히 점검하고, 필요한 보안 업데이트를 신속히 적용하겠습니다.',
    ],
    href: 'https://www.boho.or.kr/kr/bbs/view.do?bbsId=B0000133&menuNo=205020&nttId=72313',
    linkText: 'KISA 보안 공지 보기',
  },
]

function unreadNotices() {
  return notices.filter(notice => {
    if (Date.now() >= notice.autoShowUntil) return false
    try { return localStorage.getItem(notice.key) !== '1' } catch { return true }
  })
}

export function shouldOpenSecurityNotice() {
  if (location.hostname !== 'r2archive.com') return false
  if (!/^\/(?:music\/?|xyx\/?|shop\/?|game-repair\/?)?$/.test(location.pathname)) return false
  if (new URLSearchParams(location.search).has('auth')) return false
  return unreadNotices().length > 0
}

export default function SecurityNotice({ onClose, showAll = false }) {
  const dialog = useRef(null)
  const confirm = useRef(null)
  const [visibleNotices] = useState(() => showAll ? notices : unreadNotices())

  useLayoutEffect(() => {
    const node = dialog.current
    const releaseScroll = lockShopScroll()
    node.showModal()
    confirm.current.focus({ preventScroll: true })
    node.scrollTop = 0
    return () => {
      node.close()
      releaseScroll()
    }
  }, [])

  function dismiss() {
    for (const notice of visibleNotices) {
      try { localStorage.setItem(notice.key, '1') } catch {}
    }
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="security-notice"
      aria-labelledby="security-notice-title"
      aria-describedby={visibleNotices.map(notice => `security-notice-summary-${notice.id}`).join(' ')}
      onCancel={event => { event.preventDefault(); dismiss() }}
    >
      <header>
        <ShieldCheck size={24} aria-hidden="true" />
        <h2 id="security-notice-title">보안 이슈 안내</h2>
      </header>
      {visibleNotices.map(notice => (
        <section key={notice.id} aria-labelledby={`security-notice-heading-${notice.id}`}>
          <div className="security-notice-heading">
            <h3 id={`security-notice-heading-${notice.id}`}>{notice.title}</h3>
          </div>
          {notice.paragraphs.map((paragraph, index) => <p key={index} id={index === 0 ? `security-notice-summary-${notice.id}` : undefined}>{paragraph}</p>)}
          <a className="security-notice-source" href={notice.href} target="_blank" rel="noopener noreferrer">{notice.linkText}</a>
        </section>
      ))}
      <footer>
        <button ref={confirm} type="button" onClick={dismiss}>확인</button>
      </footer>
    </dialog>
  )
}
