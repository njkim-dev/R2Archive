import { NavLink } from 'react-router-dom'
import useStore from '../store/useStore'

// 모바일 페이지 간 네비게이션 칩 행. 사이드바를 대체.
// 현재 페이지는 NavLink가 active 클래스 자동 부여.
const PAGES = [
  { to: '/',            label: '곡',       end: true },
  { to: '/rankings',    label: '랭킹' },
  { to: '/groups',      label: '그룹',     needLogin: true },
  { to: '/personal-categories', label: '카테고리', needLogin: true },
  { to: '/pmang-songs', label: '피망곡' },
  { to: '/removed-songs', label: '미출시곡', adminOnly: true },
  { to: '/feedback',    label: '피드백' },
]

export default function MobilePageNav() {
  const { user, openLogin, isAdmin } = useStore()
  return (
    <div className="mob-pnav">
      {PAGES.filter(p => !p.adminOnly || isAdmin).map(p => (
        <NavLink
          key={p.to}
          to={p.to}
          end={p.end}
          className={({ isActive }) => `mob-pnav-item${isActive ? ' on' : ''}`}
          onClick={(e) => {
            if (p.needLogin && !user) { e.preventDefault(); openLogin() }
          }}
        >
          {p.label}
        </NavLink>
      ))}
    </div>
  )
}
