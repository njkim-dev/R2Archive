import { ListMusic, History, Trophy, Users, Tags, Archive, BarChart3, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import useStore from '../store/useStore'
import { isXyxMode } from '../utils/serverMode'

export default function PageNavigation({ onNavigate }) {
  const { user, openLogin, isAdmin } = useStore()
  const xyxMode = isXyxMode()

  const handleClick = (requiresLogin = false) => (event) => {
    onNavigate?.()
    if (requiresLogin && !user) {
      event.preventDefault()
      openLogin()
    }
  }

  const linkClass = ({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`

  return (
    <div className="side-section" style={{ marginTop: 0 }}>
      <div className="side-label"><span>음악 메뉴</span></div>
      <div className="page-nav">
        <NavLink to="/" end className={linkClass} onClick={handleClick()}><ListMusic size={16} strokeWidth={1.8} aria-hidden="true" /><span>곡 목록</span></NavLink>
        {!xyxMode && (
          <NavLink to="/updates" className={linkClass} onClick={handleClick()}><History size={16} strokeWidth={1.8} aria-hidden="true" /><span>업데이트 내역</span></NavLink>
        )}
        {!xyxMode && (
          <NavLink to="/rankings" className={linkClass} onClick={handleClick()}><Trophy size={16} strokeWidth={1.8} aria-hidden="true" /><span>개인 성과</span></NavLink>
        )}
        {!xyxMode && (
          <NavLink to="/groups" className={linkClass} onClick={handleClick(true)}><Users size={16} strokeWidth={1.8} aria-hidden="true" /><span>그룹</span></NavLink>
        )}
        <NavLink to="/personal-categories" className={linkClass} onClick={handleClick(true)}>
          <Tags size={16} strokeWidth={1.8} aria-hidden="true" /><span>음악 카테고리</span>
        </NavLink>
        {!xyxMode && (
          <NavLink to="/pmang-songs" className={linkClass} onClick={handleClick()}><Archive size={16} strokeWidth={1.8} aria-hidden="true" /><span>과거 피망곡</span></NavLink>
        )}
        {isAdmin && (
          <NavLink to="/removed-songs" className={linkClass} onClick={handleClick()}><Archive size={16} strokeWidth={1.8} aria-hidden="true" /><span>미출시곡</span></NavLink>
        )}
        {isAdmin && (
          <NavLink to="/analytics" className={linkClass} onClick={handleClick()}><BarChart3 size={16} strokeWidth={1.8} aria-hidden="true" /><span>접속 통계</span></NavLink>
        )}
        {isAdmin && <NavLink to="/game-repair/admin" className={linkClass} onClick={handleClick()}><ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" /><span>복구 기능 관리</span></NavLink>}
      </div>
    </div>
  )
}
