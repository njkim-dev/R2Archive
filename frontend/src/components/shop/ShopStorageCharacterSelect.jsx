export default function ShopStorageCharacterSelect({ id, characters, value, onChange, disabled }) {
  return <>
    <label htmlFor={id}>저장할 캐릭터</label>
    <select id={id} value={value || ''} onChange={event => onChange(event.target.value)} disabled={!characters.ready || disabled}>
      <option value="">캐릭터 선택</option>
      {characters.items.map(({ character }) => <option key={character.id} value={character.id}>
        {character.name} ({character.sex === 'female' ? '여' : '남'})
      </option>)}
    </select>
  </>
}
