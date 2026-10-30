import { Star } from 'lucide-react'

export default function ShopFavoriteButton({ item, saved, authenticated, ready, pending, onToggle }) {
  return <button type="button" className="shop-favorite-button" disabled={!authenticated || !ready || pending} aria-pressed={saved} aria-label={`${item.name} 즐겨찾기 ${saved ? '해제' : '추가'}`} title={!authenticated ? '로그인 후 사용할 수 있습니다.' : !ready ? '즐겨찾기를 불러오는 중입니다.' : saved ? '즐겨찾기 해제' : '즐겨찾기 추가'} onClick={() => onToggle(item)}>
    <Star size={18} fill={saved ? 'currentColor' : 'none'} />
  </button>
}
