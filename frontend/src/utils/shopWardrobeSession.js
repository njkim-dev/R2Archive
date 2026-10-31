import { SHOP_SLOTS } from './shopUrl'

export function readWardrobeSession(version) {
  try {
    const data = JSON.parse(sessionStorage.getItem(`r2_shop_wardrobe:${version}`))
    if (!data || !['male', 'female'].includes(data.sex)) return null
    const wardrobes = Object.fromEntries(['male', 'female'].map(sex => [sex, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, /^\d{1,12}$/.test(data.wardrobes?.[sex]?.[slot] || '') ? data.wardrobes[sex][slot] : null]))]))
    return { sex: data.sex, wardrobes }
  } catch { return null }
}

export function saveWardrobeSession(version, sex, wardrobes) {
  try { sessionStorage.setItem(`r2_shop_wardrobe:${version}`, JSON.stringify({ sex, wardrobes: Object.fromEntries(['male', 'female'].map(gender => [gender, Object.fromEntries(SHOP_SLOTS.map(slot => [slot, wardrobes[gender]?.[slot]?.id || null]))])) })) } catch {}
}
