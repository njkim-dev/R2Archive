import test from 'node:test'
import assert from 'node:assert/strict'
import { ornamentPlacement, particleBatches, particleSystem } from '../src/utils/shopParticles.js'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]
const emitter = () => ({ anchor: '', texture: 'a'.repeat(64) + '.webp', format: 'xml', count: 1, interval: 0, seed: 4294967295, start_tick: 1, end_tick: 3, midpoint: .5, uv_fps: 2,
  position: [0, 0, 0], attachment_position: [0, 0, 0], attachment_rotation: [0, 0, 0], min_position: [0, 0, 0], max_position: [0, 0, 0], position_scale: [1, 1, 1],
  min_direction: [1, 0, 0], max_direction: [1, 0, 0], gravity: [0, 0, 0], acceleration: [0, 0, 0], lifetime: [4, 4], velocity: [2, 2],
  colors: [[1, 1, 1, 0], [1, 1, 1, 1], [1, 1, 1, 0]], sizes: [[.2, .2, .2, .2], [.2, .2, .2, .2], [.2, .2, .2, .2]], uv: [[0, 0, .5, 1], [.5, 0, 1, 1]], additive: true, angular_velocity: 0 })
const payload = () => ({ schema: 'shop-particles-v1', frame_count: 2, source_duration: 10, texture_revision: 'b'.repeat(20), anchors: { '': [...identity, ...identity] }, emitters: [emitter()] })

test('particle sprites follow their source anchor, velocity, fade keys and atlas frame', () => {
  const system = particleSystem(payload(), 2)
  assert.deepEqual(particleBatches(system, .5, 10, Math.PI, null), [])
  const [batch] = particleBatches(system, 1.5, 10, Math.PI, null)
  assert.equal(batch.vertices.length, 54)
  const centerX = [0, 9, 18, 27, 36, 45].reduce((sum, offset) => sum + batch.vertices[offset], 0) / 6
  assert.equal(centerX, 110)
  assert.equal(batch.vertices[8], .25)
  assert.equal(batch.vertices[3], .5)
  assert.deepEqual(particleBatches(system, 9, 10, Math.PI, null), [])
})

test('seeded particle pools are deterministic and retain a fixed live-particle budget', () => {
  const data = payload(); data.emitters = Array.from({ length: 30 }, (_, index) => ({ ...emitter(), seed: index, start_tick: 0, end_tick: 0, count: 100000, colors: Array.from({ length: 3 }, () => [1, 1, 1, 1]) }))
  const system = particleSystem(data, 2)
  const batches = particleBatches(system, 12345, 10, Math.PI, null, 64)
  assert.ok(batches.reduce((sum, batch) => sum + batch.vertices.length / 54, 0) <= 64)
  assert.deepEqual(batches, particleBatches(system, 12345, 10, Math.PI, null, 64))
  assert.ok(batches.every(batch => [...batch.vertices].every(Number.isFinite)))
})

test('start-only attachment windows wait for their source cue on every animation loop', () => {
  const data = payload(); data.emitters[0].start_tick = 3; data.emitters[0].end_tick = 0
  const system = particleSystem(data, 2)
  assert.deepEqual(particleBatches(system, 2.5, 10, Math.PI, null), [])
  assert.equal(particleBatches(system, 3.5, 10, Math.PI, null)[0].vertices[8], .25)
  assert.deepEqual(particleBatches(system, 12.5, 10, Math.PI, null), [])
  assert.equal(particleBatches(system, 13.5, 10, Math.PI, null)[0].vertices[8], .25)
})

test('the lobby model is framed in the main scene above both characters', () => {
  const pose = ornamentPlacement([[-50, -50, -10], [50, 50, 10]])
  assert.equal(Math.abs(pose[12]), 0)
  assert.equal(pose[13], 350)
  assert.equal(pose[14], 80)
  assert.ok(pose[0] * 100 <= 240)
  assert.ok(pose[5] * 100 <= 220.00001)
})

test('invalid particle definitions fail before any GPU allocation', () => {
  for (const mutate of [data => { data.frame_count = 3 }, data => { data.anchors[''][0] = NaN }, data => { data.emitters[0].lifetime[0] = 0 }, data => { data.emitters[0].texture = '../../secret' }, data => { data.emitters[0].count = -1 }, data => { data.emitters[0].anchor = 'missing' }]) {
    const data = payload(); mutate(data); assert.throws(() => particleSystem(data, 2))
  }
})
