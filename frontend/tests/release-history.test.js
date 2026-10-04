import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReleaseCalendarIndex, filterReleaseHistory, formatReleaseDate, formatReleaseTitle } from '../src/utils/releaseHistory.js'

const entries = [
  {
    release_date: '2026-09-30',
    notice_url: 'https://example.com/notice',
    songs: [
      { name: 'ECHOES OF TIME', artist: 'rb free', levels: [3, 4.5, 8] },
      { name: 'NEW WORLD', artist: 'SEED9', levels: [6] },
    ],
  },
  {
    release_date: '2026-08-27',
    notice_url: null,
    songs: [{ name: '날개', artist: '아이리제', levels: [7.5] }],
  },
  {
    release_date: '2025-12-18',
    notice_url: null,
    songs: [{ name: 'Winter', artist: 'Artist', levels: [5] }],
  },
]

test('release history search filters songs without losing the date group', () => {
  assert.deepEqual(filterReleaseHistory(entries, 'seed9', ''), [{
    ...entries[0],
    songs: [entries[0].songs[1]],
  }])
  assert.equal(filterReleaseHistory(entries, '아이 리 제', '').length, 1)
  assert.equal(filterReleaseHistory(entries, '없는 곡', '').length, 0)
})

test('date and text filters intersect', () => {
  assert.equal(filterReleaseHistory(entries, '날개', '2026-08-27').length, 1)
  assert.equal(filterReleaseHistory(entries, '날개', '2026-09-30').length, 0)
})

test('calendar index exposes only years and months that contain updates', () => {
  const index = buildReleaseCalendarIndex(entries)
  assert.deepEqual(index.dates, ['2025-12-18', '2026-08-27', '2026-09-30'])
  assert.deepEqual(index.years, [2025, 2026])
  assert.deepEqual([...index.monthsByYear.get(2026)], [8, 9])
})

test('release date labels use the update history format', () => {
  assert.equal(formatReleaseDate('2026-09-30'), '2026.09.30')
  assert.equal(formatReleaseDate(''), '전체 날짜')
  assert.equal(formatReleaseTitle('2026-09-30'), '09월 30일 업데이트')
})
