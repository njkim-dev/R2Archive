import test from 'node:test'
import assert from 'node:assert/strict'
import { effectAnimation } from '../src/utils/shopEffect.js'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const payload = () => ({ schema: 'shop-couple-effect-v1', frame_count: 2, bounds: [[0, 0, 0], [1, 1, 1]], meshes: [{ name: 'ring', frames: [...identity, ...identity] }] })

test('effect tracks preserve matching model nodes and the shared motion frame count', () => {
  const result = effectAnimation(payload(), [{ name: 'ring' }], 2)
  assert.ok(result.tracks.get('ring') instanceof Float32Array)
  assert.deepEqual([...result.tracks.get('ring').subarray(16)], identity)
})

test('effect loading rejects unrelated tracks, damaged matrices and invalid envelopes', () => {
  const invalid = [
    { ...payload(), schema: 'other' }, { ...payload(), frame_count: 5401 },
    { ...payload(), meshes: [] }, { ...payload(), meshes: [{ name: 'missing', frames: [...identity, ...identity] }] },
    { ...payload(), meshes: [{ name: 'ring', frames: identity }] },
    { ...payload(), meshes: [{ name: 'ring', frames: [NaN, ...identity.slice(1), ...identity] }] },
    { ...payload(), bounds: [[1, 0, 0], [0, 1, 1]] }, { ...payload(), bounds: [[0, 0, 0], [Infinity, 1, 1]] },
    { ...payload(), relative_duration: 0 }, { ...payload(), relative_duration: Infinity },
  ]
  for (const data of invalid) assert.throws(() => effectAnimation(data, [{ name: 'ring' }], 2))
  assert.throws(() => effectAnimation(payload(), [{ name: 'ring' }], 3))
})
