export function hueOf(gid) {
  let h = 0
  const s = String(gid)
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

export function fmtRel(at) {
  if (!at) return '—'
  const d = (Date.now() - new Date(at).getTime()) / 1000
  if (d < 60) return '방금'
  if (d < 3600) return `${Math.floor(d / 60)}분 전`
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
  if (d < 2592000) return `${Math.floor(d / 86400)}일 전`
  const dt = new Date(at)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

export function fmtDayLabel(at) {
  const d = new Date(at)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  const dStart = new Date(d); dStart.setHours(0, 0, 0, 0)
  if (dStart.getTime() === today.getTime()) return '오늘'
  if (dStart.getTime() === yest.getTime()) return '어제'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function judgeColor(s) {
  if (s == null) return 'empty'
  if (s >= 99) return 'gold'
  if (s >= 95) return 'high'
  return ''
}

export function roleLabel(r) {
  if (r === 'owner') return 'OWNER'
  if (r === 'manager') return 'MGR'
  if (r === 'admin') return 'ADMIN'
  return 'MEMBER'
}
