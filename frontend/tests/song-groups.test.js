import assert from 'node:assert/strict'
import test from 'node:test'
import { groupSongDifficulties, songItemLayout } from '../src/components/songs-table/songGroups.js'

const song = (id, level, name = 'Song', artist = 'Artist') => ({ id, name, artist, level, play_count: 123 })

test('groups only identical titles and artists, keeps every chart and orders levels ascending', () => {
  const input = [song(3, 8), song(4, 7, 'Other'), song(1, 2), song(2, 5)]
  const groups = groupSongDifficulties(input)
  assert.deepEqual(groups.map(group => group.songs.map(song => song.id)), [[1, 2, 3], [4]])
  assert.equal(groups[0].songs[0].play_count, 123)
  assert.deepEqual(input.map(song => song.id), [3, 4, 1, 2])
})

test('does not merge different artists, named versions, or same-level duplicates', () => {
  const input = [song(1, 2), song(2, 8, 'Song', 'Other'), song(3, 5, 'Song_EX'), song(4, 2)]
  input.forEach(song => { song.same_music_group_id = 10 })
  assert.equal(groupSongDifficulties(input).length, 4)
  assert.deepEqual(groupSongDifficulties(input).map(group => group.songs[0].id), [1, 2, 3, 4])
})

test('identity keys cannot collide at word boundaries and missing metadata is not grouped', () => {
  assert.equal(groupSongDifficulties([song(1, 2, 'A B', 'C'), song(2, 5, 'A', 'B C')]).length, 2)
  assert.equal(groupSongDifficulties([song(1, 2, '', ''), song(2, 5, '', '')]).length, 2)
})

test('group position follows the first chart in the input sort order', () => {
  const input = [song(4, 10, 'Other'), song(3, 8), song(5, 4, 'Other'), song(1, 2)]
  assert.deepEqual(groupSongDifficulties(input).map(group => group.songs.map(song => song.id)), [[5, 4], [1, 3]])
})

test('virtual offsets include every difficulty and the fuzzy separator', () => {
  const exact = groupSongDifficulties([song(3, 8), song(1, 2)])
  const fuzzy = groupSongDifficulties([song(4, 6, 'Other')])
  const layout = songItemLayout([...exact, { __type: 'separator' }, ...fuzzy], 44, true)
  assert.deepEqual(layout.offsets, [0, 88, 132])
  assert.deepEqual(layout.positions.get(3), { index: 0, offset: 44 })
  assert.deepEqual(layout.positions.get(4), { index: 2, offset: 132 })
  assert.equal(layout.totalHeight, 176)
  assert.equal(songItemLayout([], 44, true).totalHeight, 0)
  assert.equal(songItemLayout([song(1, 2), song(2, 5)], 80, false).totalHeight, 160)
})
