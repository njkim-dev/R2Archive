import { SHOP_SLOTS } from './shopUrl'

const characterKey = 'r2_active_character'

export function readStorageCharacter() {
  try { return sessionStorage.getItem(characterKey) || null } catch { return null }
}

export function resolveStorageCharacter(items, preferredId) {
  if (preferredId === '') return null
  return (items.find(({ character }) => character.id === preferredId) || items[0])?.character || null
}

export function writeStorageCharacter(id) {
  try {
    if (id) sessionStorage.setItem(characterKey, id)
    else sessionStorage.removeItem(characterKey)
  } catch {}
}

export function readWardrobeSession(version) {
  try {
    const data = JSON.parse(sessionStorage.getItem(`r2_shop_wardrobe:${version}`))
    if (!data || !['male', 'female'].includes(data.sex)) return null
    const wardrobes = Object.fromEntries(['male', 'female'].map(sex => [sex, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, /^\d{1,12}$/.test(data.wardrobes?.[sex]?.[slot] || '') ? data.wardrobes[sex][slot] : null]))]))
    return { sex: data.sex, wardrobes, characterId: data.characterId }
  } catch { return null }
}

export function saveWardrobeSession(version, sex, wardrobes, characterId) {
  try { sessionStorage.setItem(`r2_shop_wardrobe:${version}`, JSON.stringify({ sex, characterId, wardrobes: Object.fromEntries(['male', 'female'].map(gender => [gender, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, wardrobes[gender]?.[slot]?.id || null]))])) })) } catch {}
}
