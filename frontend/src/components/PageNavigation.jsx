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
      <div className="side-label"><span>페이지</span></div>
      <div className="page-nav">
        <NavLink to="/" end className={linkClass} onClick={handleClick()}><span>곡 목록</span></NavLink>
        {!xyxMode && (
          <NavLink to="/rankings" className={linkClass} onClick={handleClick()}><span>개인 성과</span></NavLink>
        )}
        {!xyxMode && (
          <NavLink to="/groups" className={linkClass} onClick={handleClick(true)}><span>그룹</span></NavLink>
        )}
        <NavLink to="/personal-categories" className={linkClass} onClick={handleClick(true)}>
          <span>음악 카테고리</span>
        </NavLink>
        {!xyxMode && (
          <NavLink to="/pmang-songs" className={linkClass} onClick={handleClick()}><span>과거 피망곡</span></NavLink>
        )}
        {isAdmin && (
          <NavLink to="/removed-songs" className={linkClass} onClick={handleClick()}><span>미출시곡</span></NavLink>
        )}
        {isAdmin && (
          <NavLink to="/analytics" className={linkClass} onClick={handleClick()}><span>접속 통계</span></NavLink>
        )}
        {!xyxMode && (
          <NavLink to="/feedback" className={linkClass} onClick={handleClick()}><span>피드백</span></NavLink>
        )}
      </div>
    </div>
  )
}
