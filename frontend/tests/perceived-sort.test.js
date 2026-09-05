import assert from 'node:assert/strict'
import test from 'node:test'
import { sortSongs } from '../src/utils/helpers.js'

const songs = [
  { id: 1, user_level_avg: 9 },
  { id: 2, user_level_avg: 8 },
  { id: 3, user_level_avg: null },
  { id: 4 },
]
const ids = (result) => result.map(song => song.id)

test('community difficulty remains the default', () => {
  assert.deepEqual(ids(sortSongs(songs, { key: 'userLevel', dir: 'desc' })), [1, 2, 3, 4])
})

test('personal difficulty sorts independently and keeps unrated songs last', () => {
  const mine = { 1: 7, 2: 10 }
  assert.deepEqual(ids(sortSongs(songs, { key: 'userLevel', dir: 'desc' }, mine)), [2, 1, 3, 4])
  assert.deepEqual(ids(sortSongs(songs, { key: 'userLevel', dir: 'asc' }, mine)), [1, 2, 3, 4])
  assert.deepEqual(songs.map(song => song.user_level_avg), [9, 8, null, undefined])
})

test('no personal votes does not fall back to community difficulty', () => {
  assert.deepEqual(ids(sortSongs(songs, { key: 'userLevel', dir: 'asc' }, {})), [1, 2, 3, 4])
})
