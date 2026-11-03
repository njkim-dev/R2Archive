import { NavLink } from 'react-router-dom'
import { CornerDownRight } from 'lucide-react'

export default function MyHomeNavigation({ characters = [], children }) {
  return <nav className="archive-context-menu" aria-label="마이홈 메뉴">
    <small>마이홈 메뉴</small>
    <NavLink to="/myhome" end>내 캐릭터</NavLink>
    {characters.length > 0 && <div className="archive-character-links">{characters.map(({ character }) => <NavLink key={character.id} to={'/myhome/characters/' + character.id} end><CornerDownRight size={14} aria-hidden="true" /><span>{character.name} 의상</span></NavLink>)}</div>}
    <NavLink to="/myhome/characters/all" end>모든 의상</NavLink>
    {children}
  </nav>
}
