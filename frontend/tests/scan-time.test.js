import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateScanTime } from '../src/utils/scanTime.js'
const MB = 1024 ** 2

test('ETA waits for enough real reading data and formats rounded durations', () => {
  assert.match(estimateScanTime({ bytesRead: 0, remainingBytes: MB, elapsedMs: 10000 }), /계산 중/)
  assert.match(estimateScanTime({ bytesRead: MB, remainingBytes: MB, elapsedMs: 1000 }), /계산 중/)
  assert.match(estimateScanTime({ bytesRead: 4, remainingBytes: 100 * MB, elapsedMs: 3000 }), /계산 중/)
  assert.match(estimateScanTime({ bytesRead: NaN, remainingBytes: MB, elapsedMs: 3000 }), /계산 중/)
  assert.equal(estimateScanTime({ bytesRead: MB, remainingBytes: 75 * MB, elapsedMs: 2000 }), '약 2분 30초 남음')
  assert.equal(estimateScanTime({ bytesRead: MB, remainingBytes: 1800 * MB, elapsedMs: 2000 }), '약 1시간 남음')
  assert.equal(estimateScanTime({ bytesRead: MB, remainingBytes: MB, elapsedMs: 2000 }), '약 5초 남음')
  assert.equal(estimateScanTime({ bytesRead: MB, remainingBytes: 0, elapsedMs: 2000 }), '검사 마무리 중…')
})
