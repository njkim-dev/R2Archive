import { useLayoutEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { lockShopScroll } from './shop/shopModalScroll'
import '../styles/security-notice.css'

const notices = [
  {
    id: 'nginx-http2',
    key: 'r2archive:notice:nginx-traefik-2026-11-20',
    autoShowUntil: Date.parse('2026-11-27T00:00:00+09:00'),
    title: 'NGINX 보안 취약점 안내',
    paragraphs: [
      'R2 Archive는 2026년 11월 19일 공개된 NGINX HTTP/2 보안 취약점에 대응하여, 웹사이트의 외부 접속을 처리하는 리버스 프록시를 NGINX에서 Traefik으로 전환했습니다.',
      'R2Archive는 안심하고 이용할 수 있도록 앞으로도 보안 취약점 발생 시 신속히 대응하겠습니다.',
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

function isUnread(notice) {
  try { return localStorage.getItem(notice.key) !== '1' } catch { return true }
}

function unreadNotices() {
  const current = notices.filter(notice => Date.now() < notice.autoShowUntil && isUnread(notice))
  if (current.some(notice => notice.id === 'nginx-http2') && isUnread(notices[1]) && !current.includes(notices[1])) {
    current.push(notices[1])
  }
  return current
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
  const [page, setPage] = useState(0)
  const visited = useRef(new Set())
  const notice = visibleNotices[page]

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

  useLayoutEffect(() => {
    if (notice) visited.current.add(notice.key)
    dialog.current.scrollTop = 0
    confirm.current.focus({ preventScroll: true })
  }, [notice])

  function dismiss() {
    for (const key of visited.current) {
      try { localStorage.setItem(key, '1') } catch {}
    }
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="security-notice"
      aria-labelledby="security-notice-title"
      aria-describedby={`security-notice-summary-${notice.id}`}
      onCancel={event => { event.preventDefault(); dismiss() }}
    >
      <header>
        <ShieldCheck size={24} aria-hidden="true" />
        <h2 id="security-notice-title">보안 이슈 안내</h2>
      </header>
      {
        <section key={notice.id} aria-labelledby={`security-notice-heading-${notice.id}`}>
          <div className="security-notice-heading">
            <h3 id={`security-notice-heading-${notice.id}`}>{notice.title}</h3>
          </div>
          {notice.paragraphs.map((paragraph, index) => <p key={index} id={index === 0 ? `security-notice-summary-${notice.id}` : undefined}>{paragraph}</p>)}
          <a className="security-notice-source" href={notice.href} target="_blank" rel="noopener noreferrer">{notice.linkText}</a>
        </section>
      }
      <footer>
        {page > 0 && <button className="security-notice-nav" type="button" onClick={() => setPage(value => value - 1)}>이전</button>}
        {page < visibleNotices.length - 1 && <button className="security-notice-nav" type="button" onClick={() => setPage(value => value + 1)}>다음</button>}
        <button ref={confirm} type="button" onClick={dismiss}>확인</button>
      </footer>
    </dialog>
  )
}
