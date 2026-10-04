export function normalizeReleaseSearch(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '')
}

export function filterReleaseHistory(entries, query, selectedDate) {
  const normalizedQuery = normalizeReleaseSearch(query)
  return entries.flatMap(entry => {
    if (selectedDate && entry.release_date !== selectedDate) return []
    if (!normalizedQuery) return [entry]
    const songs = entry.songs.filter(song => normalizeReleaseSearch(`${song.name} ${song.artist}`).includes(normalizedQuery))
    return songs.length ? [{ ...entry, songs }] : []
  })
}

export function buildReleaseCalendarIndex(entries) {
  const dates = [...new Set(entries.map(entry => entry.release_date).filter(Boolean))].sort()
  const years = [...new Set(dates.map(date => Number(date.slice(0, 4))))]
  const monthsByYear = new Map()
  for (const date of dates) {
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    if (!monthsByYear.has(year)) monthsByYear.set(year, new Set())
    monthsByYear.get(year).add(month)
  }
  return { dates, years, monthsByYear }
}

export function formatReleaseDate(isoDate) {
  if (!isoDate) return '전체 날짜'
  return isoDate.replaceAll('-', '.')
}

export function formatReleaseTitle(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${month}월 ${day}일 업데이트`
}

export function releaseWeekday(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(new Date(year, month - 1, day))
}
