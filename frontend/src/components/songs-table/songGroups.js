export const SONG_ROW_HEIGHT = 44
const identity = song => song.name && song.artist && !song.youtube_candidate
  ? JSON.stringify([song.name, song.artist])
  : `id:${song.id}`

// 입력은 이미 필터링/정렬된 목록이다. 첫 등장 곡을 그룹의 정렬 기준으로 유지한다.
export function groupSongDifficulties(songs) {
  const groups = new Map()
  for (const song of songs) {
    const key = identity(song)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(song)
  }
  const merged = new Map([...groups.entries()]
    .filter(([, members]) => new Set(members.map(song => song.level)).size > 1)
    .map(([key, members]) => [key, {
      key,
      songs: [...members].sort((a, b) => a.level - b.level || a.id - b.id),
    }]))
  const emitted = new Set()
  return songs.flatMap(song => {
    const key = identity(song)
    if (!merged.has(key)) return [{ key: `id:${song.id}`, songs: [song] }]
    if (emitted.has(key)) return []
    emitted.add(key)
    return [merged.get(key)]
  })
}

export function songItemLayout(items, rowHeight, grouped) {
  let totalHeight = 0
  const positions = new Map()
  const offsets = items.map((item, index) => {
    const offset = totalHeight
    const songs = item.__type === 'separator' ? [] : grouped ? item.songs : [item]
    songs.forEach((song, row) => positions.set(song.id, {
      index, offset: offset + row * rowHeight,
    }))
    totalHeight += Math.max(1, songs.length) * rowHeight
    return offset
  })
  return { offsets, positions, totalHeight }
}
