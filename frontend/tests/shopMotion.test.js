import { test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyPose, extraLocal } from '../src/utils/shopMotion.js'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const point = (value, matrix) => [0, 1, 2].map(axis => value[0] * matrix[axis] + value[1] * matrix[4 + axis] + value[2] * matrix[8 + axis] + matrix[12 + axis])

test('row-vector attachment transforms rotate the item with its hand before moving the character', () => {
  const hand = [...identity], translation = [...identity]
  hand[0] = 0; hand[1] = 1; hand[4] = -1; hand[5] = 0
  translation[12] = 10
  assert.deepEqual(point([3, 0, 0], multiplyPose(hand, translation)), [10, 3, 0])
})

test('a skirt animation keeps the selected garment bind translation and scale when its track omits them', () => {
  const bind = [...identity], rotation = [...identity]
  bind[0] = 2; bind[5] = 3; bind[10] = 4; bind[12] = 8; bind[13] = 20
  rotation[0] = 0; rotation[1] = 1; rotation[4] = -1; rotation[5] = 0
  const result = extraLocal(bind, { rotation: true, position: false, scale: false, frames: new Float32Array(rotation) }, 0)
  assert.deepEqual(point([1, 0, 0], result), [8, 22, 0])
  assert.equal(Math.hypot(...result.slice(4, 7)), 3)
  assert.equal(Math.hypot(...result.slice(8, 11)), 4)
  assert.deepEqual(bind, [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 8, 20, 0, 1])
})
