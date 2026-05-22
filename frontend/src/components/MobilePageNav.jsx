import { NavLink } from 'react-router-dom'
import useStore from '../store/useStore'

const PAGES = [
  { to: '/',            label: '곡',       end: true },
  { to: '/rankings',    label: '랭킹' },
  { to: '/groups',      label: '그룹',     needLogin: true },
  { to: '/pmang-songs', label: '피망곡' },
  { to: '/feedback',    label: '피드백' },
]

export default function MobilePageNav() {
  const { user, openLogin } = useStore()
  return (
    <div className="mob-pnav">
      {PAGES.map(p => (
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
