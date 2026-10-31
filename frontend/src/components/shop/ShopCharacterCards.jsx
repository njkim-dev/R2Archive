import { Plus,Users,UserRound } from 'lucide-react'
export default function ShopCharacterCards({items,onChoose,onCreate,onAll,onDelete,busy=false}){
  return <div className="shop-character-cards">
    {onAll&&<button className="shop-character-special" onClick={onAll}><Users/><strong>모든 캐릭터 표시</strong></button>}
    {items.map(entry=><article className="shop-character-card" key={entry.character.id}>
      <button className="shop-character-open" disabled={busy} onClick={()=>onChoose(entry)} aria-label={`${entry.character.name} 캐릭터 선택`}>
        <div className="shop-character-picture">{entry.thumbnail?<img src={entry.thumbnail} alt="" loading="lazy"/>:<UserRound aria-hidden="true"/>}</div>
        <strong>{entry.character.name}</strong><small>{entry.character.sex==='female'?'여성':'남성'}</small>
      </button>
      {onDelete&&<button className="shop-character-delete" disabled={busy} aria-label={`${entry.character.name} 캐릭터 삭제`} onClick={()=>onDelete(entry)}>삭제</button>}
    </article>)}
    {onCreate&&items.length<17&&<button className="shop-character-special" disabled={busy} onClick={onCreate}><Plus/><strong>새 캐릭터 추가</strong></button>}
  </div>
}
