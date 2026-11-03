import test from 'node:test'
import assert from 'node:assert/strict'
import { searchEstimate, searchProgress } from '../src/utils/shopImageEstimate.js'

test('estimate validation uses broad per-slot fallbacks', () => {
  for (const value of [null, [], { min_seconds: 0, max_seconds: 10 }, { min_seconds: 20, max_seconds: 10 }, { min_seconds: 10, max_seconds: 999 }]) {
    assert.deepEqual(searchEstimate(value), { min_seconds: 20, max_seconds: 50 })
    assert.deepEqual(searchEstimate(value, 'hair'), { min_seconds: 10, max_seconds: 30 })
  }
  assert.deepEqual(searchEstimate({ min_seconds: 8, max_seconds: 18 }), { min_seconds: 8, max_seconds: 18 })
})

test('remaining time never stalls at zero and explicitly handles an overrun', () => {
  const estimate = searchEstimate({ min_seconds: 8, max_seconds: 18 })
  assert.match(searchProgress(5, estimate), /약 3~13초 · 5초 경과/)
  assert.match(searchProgress(17, estimate), /약 1초/)
  assert.match(searchProgress(18, estimate), /예상보다 오래/)
  assert.match(searchProgress(300, estimate), /계속 검색 중/)
  assert.doesNotMatch(searchProgress(18, estimate), /남은 시간.*0초/)
})
