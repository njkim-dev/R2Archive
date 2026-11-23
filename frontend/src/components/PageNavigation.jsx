import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import useStore from '../store/useStore'
import { isXyxMode } from '../utils/serverMode'

const pages = [
  { to: '/', label: '곡 목록', chinese: true },
  { to: '/pmang-songs', label: '과거 피망곡' },
  { to: '/rankings', label: '개인 성과' },
  { to: '/groups', label: '그룹', login: true },
  { to: '/personal-categories', label: '음악 카테고리', chinese: true, login: true },
  { to: '/updates', label: '업데이트 내역' },
]
const management = [
  { to: '/removed-songs', label: '미출시곡' },
  { to: '/analytics', label: '접속 통계' },
  { to: '/game-repair/admin', label: '복구 기능 관리' },
]

export default function PageNavigation({ onNavigate }) {
  const { user, openLogin, isAdmin } = useStore()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const group = useRef(null), trigger = useRef(null)
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const outside = event => { if (!group.current?.contains(event.target)) setOpen(false) }
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const available = pages.filter(page => !isXyxMode() || page.chinese)
  const link = ({ to, label, login }, className) => <NavLink key={to} to={to} end={to === '/'} className={className} onClick={event => {
    setOpen(false)
    onNavigate?.()
    if (login && !user) { event.preventDefault(); openLogin() }
  }}>{label}</NavLink>
  const extra = available.slice(3)
  return <nav className="archive-music-tabs" aria-label="음악 메뉴">
    {available.map((page, i) => link(page, i < 3 ? 'music-tab' : 'music-tab secondary-tab'))}
    {(extra.length > 0 || isAdmin) && <div ref={group} className={'music-overflow' + (isAdmin ? ' has-admin' : '')}>
      <button type="button" ref={trigger} aria-expanded={open} onClick={() => setOpen(!open)}>더보기 <ChevronDown size={14} /></button>
      {open && <div className="music-overflow-list">{extra.map(page => link(page, 'extra-tab'))}{isAdmin && management.map(page => link(page, 'admin-tab'))}</div>}
    </div>}
  </nav>
}
