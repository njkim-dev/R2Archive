import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSongs } from '../src/utils/helpers.js'
import { allowedQuickFilter, buildArtistCatalog, defaultDetailedFilters, detailedFilterStorageKey, isAiSong, normalizeDetailedFilters, readDetailedFilters, serializeDetailedFilters, visibleQuickFilters } from '../src/utils/catalogFilters.js'

const meta = { level_min: 1.5, level_max: 12, bpm_min: 60, bpm_max: 400 }
const song = (id, artist, extra = {}) => ({ id, name: `Song ${id}`, artist, level: 8, bpm: 160, youtube_url: 'https://youtu.be/test', ...extra })
const songs = [
  song(1, 'VALOFE', { is_new: true }),
  song(2, 'High Note'),
  song(3, 'SWING_ART', { is_change: true }),
  song(4, '33_Lacky', { youtube_url: '' }),
  song(5, 'MAZO', { is_new: true, play_count: 20 }),
  song(6, 'SEED9', { is_change: true }),
  song(7, 'SEED9', { name: 'Song 6', level: 5.5 }),
]
const ids = result => [...result.exact, ...result.fuzzy].map(item => item.id)
const filters = overrides => ({ ...defaultDetailedFilters(meta), search: '', favorites: new Set([1, 5]), played: new Set([5]), ...overrides })

test('AI filtering uses only the four specified artists', () => {
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'only' }))), [1, 2, 3, 4])
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'hide' }))), [5, 6, 7])
  assert.equal(ids(filterSongs(songs, filters({ aiMode: 'show' }))).length, 7)
  assert.equal(isAiSong({ artist: ' valofe ' }), true)
  assert.equal(isAiSong({ artist: 'High Note feat. MAZO' }), false)
  assert.equal(isAiSong({ artist: 'VALOFE Remix' }), false)
  assert.equal(isAiSong({ artist: null }), false)
})

test('AI, artist, channel, quick, listening and ranges intersect', () => {
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'hide', quick: 'new' }))), [5])
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'only', listenOnly: true }))), [1, 2, 3])
  assert.deepEqual(ids(filterSongs(songs, filters({ artists: new Set(['SEED9']), category: 'moon' }))), [7])
  assert.deepEqual(ids(filterSongs(songs, filters({ category: 'star' }))), [])
  assert.deepEqual(ids(filterSongs(songs, filters({ bpmMin: 161 }))), [])
  assert.deepEqual(ids(filterSongs(songs, filters({ quick: 'favorite', aiMode: 'hide' }))), [5])
  assert.deepEqual(ids(filterSongs(songs, filters({ quick: 'no_music', listenOnly: true }))), [])
})

test('search and excluded search respect the new filters', () => {
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'hide', search: 'VALOFE' }))), [])
  assert.deepEqual(ids(filterSongs(songs, filters({ aiMode: 'only', search: 'VALOFE', excludeSearch: true }))), [2, 3, 4])
})

test('all artist names are listed by distinct song-name count without a top-N cap', () => {
  const catalog = buildArtistCatalog([...songs, song(8, 'SEED9', { name: 'Other song' }), song(9, 'SEED9', { name: ' song 6 ' })])
  assert.deepEqual(catalog[0], { artist: 'SEED9', count: 2 })
  assert.equal(catalog.length, 6)
  const many = buildArtistCatalog(Array.from({ length: 3000 }, (_, i) => song(i, `Artist ${i}`)))
  assert.equal(many.length, 3000)
})

test('ranges normalize safely when closing, including blank and reversed inputs', () => {
  const result = normalizeDetailedFilters({ levelMin: '9', levelMax: '4', bpmMin: '500', bpmMax: '20' }, meta)
  assert.deepEqual([result.levelMin, result.levelMax, result.bpmMin, result.bpmMax], [4, 9, 60, 400])
  const empty = normalizeDetailedFilters({ levelMin: '', bpmMin: 'invalid', bpmMax: null }, meta)
  assert.deepEqual([empty.levelMin, empty.levelMax, empty.bpmMin, empty.bpmMax], [1.5, 12, 60, 400])
})

test('local storage round trip keeps all detailed settings and Set values', () => {
  const original = filters({ category: 'sun', quick: 'new', aiMode: 'hide', artists: new Set(['MAZO', 'SEED9']), levelMin: 7, bpmMax: 180, listenOnly: true, sort: { key: 'bpm', dir: 'asc' } })
  const serialized = serializeDetailedFilters(original)
  const storage = { getItem: key => key === detailedFilterStorageKey('kr') ? serialized : null }
  const restored = readDetailedFilters('kr', storage)
  assert.deepEqual(restored, normalizeDetailedFilters(original))
  assert.equal(readDetailedFilters('xyx', storage), null)
  restored.artists.delete('MAZO')
  assert(original.artists.has('MAZO'))
})

test('corrupt, unavailable and unknown-version storage cannot crash the page', () => {
  assert.equal(readDetailedFilters('kr', { getItem: () => '{bad' }), null)
  assert.equal(readDetailedFilters('kr', { getItem: () => { throw new Error('blocked') } }), null)
  assert.equal(readDetailedFilters('kr', { getItem: () => '{"version":2,"filters":{}}' }), null)
  const clean = normalizeDetailedFilters({ artists: [null, 1, 'MAZO', 'MAZO'], category: 'invalid', aiMode: 'invalid', quick: 'invalid' })
  assert.deepEqual([...clean.artists], ['MAZO'])
  assert.equal(clean.category, null)
  assert.equal(clean.aiMode, 'show')
  assert.equal(clean.quick, 'all')
})

test('saved full ranges follow changed catalog bounds while custom bounds remain', () => {
  const serialized = serializeDetailedFilters({ ...defaultDetailedFilters(meta), levelMin: 7, meta })
  const restored = readDetailedFilters('kr', { getItem: () => serialized })
  const updated = normalizeDetailedFilters(restored, { ...meta, bpm_max: 450 })
  assert.equal(updated.levelMin, 7)
  assert.equal(updated.bpmMax, 450)
})

test('legacy quick flags become the same selection in both controls', () => {
  assert.equal(normalizeDetailedFilters({ quick: 'all', flagNew: true }).quick, 'new')
  const current = normalizeDetailedFilters({ quick: 'favorite', flagNew: true })
  assert.equal(current.quick, 'favorite')
  assert.equal(current.flagNew, false)
})

test('admin, login and server-specific quick options remain restricted', () => {
  const guest = { user: null, isAdmin: false, xyxMode: false }
  assert.equal(allowedQuickFilter('favorite', guest), 'all')
  assert.equal(allowedQuickFilter('no_music', guest), 'all')
  assert.equal(allowedQuickFilter('new', guest), 'new')
  assert.equal(allowedQuickFilter('favorite', { ...guest, user: { id: 1 } }), 'favorite')
  assert.equal(allowedQuickFilter('popular', { ...guest, isAdmin: true }), 'popular')
  assert.equal(allowedQuickFilter('played', { ...guest, xyxMode: true }), 'all')
  assert(!visibleQuickFilters(guest).some(item => item.adminOnly))
})
