const finite = value => Number.isFinite(value) && Math.abs(value) < 1e7
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(finite)

export function particleSystem(data, expectedFrames) {
  const fail = () => { throw new Error('커플링 입자효과 자료가 올바르지 않습니다.') }
  if (data?.schema !== 'shop-particles-v1' || !Number.isInteger(data.frame_count) || data.frame_count !== expectedFrames || data.frame_count < 2 || data.frame_count > 5400 || !finite(data.source_duration) || data.source_duration <= 0 || !/^[a-f0-9]{20}$/.test(data.texture_revision) || !Array.isArray(data.emitters) || data.emitters.length > 256 || !data.anchors || typeof data.anchors !== 'object' || Object.keys(data.anchors).length > 256) fail()
  const anchors = new Map()
  for (const [name, values] of Object.entries(data.anchors)) {
    if (!Array.isArray(values) || values.length !== data.frame_count * 16 || !values.every(finite)) fail()
    anchors.set(name, new Float32Array(values))
  }
  for (const emitter of data.emitters) {
    if (!anchors.has(emitter.anchor) || !/^[a-f0-9]{64}\.webp$/.test(emitter.texture) || !['xml', 'binary-v3'].includes(emitter.format) || !Number.isInteger(emitter.count) || emitter.count < 0 || emitter.count > 100000 || !finite(emitter.interval) || emitter.interval < 0 || !Number.isInteger(emitter.seed) || emitter.seed < 0 || emitter.seed > 4294967295 || !finite(emitter.start_tick) || !finite(emitter.end_tick) || emitter.start_tick < 0 || emitter.end_tick < 0 || !finite(emitter.midpoint) || !finite(emitter.uv_fps) || emitter.uv_fps < 0 || emitter.uv_fps > 1000) fail()
    for (const name of ['position', 'min_position', 'max_position', 'position_scale', 'min_direction', 'max_direction', 'gravity', 'acceleration', 'attachment_position', 'attachment_rotation']) if (!vector(emitter[name], 3)) fail()
    if (!vector(emitter.lifetime, 2) || Math.min(...emitter.lifetime) <= 0 || !vector(emitter.velocity, 2) || !Array.isArray(emitter.colors) || emitter.colors.length !== 3 || !emitter.colors.every(color => vector(color, 4)) || !Array.isArray(emitter.sizes) || emitter.sizes.length !== 3 || !emitter.sizes.every(size => vector(size, 4)) || !Array.isArray(emitter.uv) || !emitter.uv.length || emitter.uv.length > 256 || !emitter.uv.every(uv => vector(uv, 4))) fail()
  }
  return { ...data, anchors }
}

function random(seed) {
  let value = seed >>> 0
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 }
}
const mix = (a, b, amount) => a + (b - a) * amount
function transform(point, matrix, vector = false) {
  return [0, 1, 2].map(axis => point[0] * matrix[axis] + point[1] * matrix[4 + axis] + point[2] * matrix[8 + axis] + (vector ? 0 : matrix[12 + axis]))
}

export function ornamentPlacement(bounds) {
  const scale = Math.min(3, 240 / Math.max(bounds[1][0] - bounds[0][0], 1), 220 / Math.max(bounds[1][1] - bounds[0][1], 1))
  return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, -(bounds[0][0] + bounds[1][0]) / 2 * scale, 350 - (bounds[0][1] + bounds[1][1]) / 2 * scale, 80 - (bounds[0][2] + bounds[1][2]) / 2 * scale, 1])
}

export function particleBatches(system, elapsed, period, radians, placement, budget = 320) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(period) || period <= 0) return []
  const batches = [], ticksPerSecond = system.source_duration / period
  let remaining = Math.min(512, Math.max(0, Math.floor(budget)))
  const perEmitter = Math.max(1, Math.floor(remaining / Math.max(1, system.emitters.length)))
  for (const emitter of system.emitters) {
    const count = Math.min(emitter.count, perEmitter, remaining)
    remaining -= count
    if (!count) continue
    const values = [], binary = emitter.format === 'binary-v3', clock = binary ? elapsed * ticksPerSecond : elapsed
    const timed = emitter.start_tick > 0 || emitter.end_tick > emitter.start_tick
    const parentCycle = Math.floor(elapsed / period), windowStartSeconds = parentCycle * period + emitter.start_tick / ticksPerSecond
    const windowStart = binary ? windowStartSeconds * ticksPerSecond : windowStartSeconds
    const endTick = emitter.end_tick > emitter.start_tick ? emitter.end_tick : system.source_duration
    const windowEnd = binary ? (parentCycle * system.source_duration + endTick) : parentCycle * period + endTick / ticksPerSecond
    const track = system.anchors.get(emitter.anchor)
    for (let index = 0; index < count; index++) {
      const next = random((emitter.seed + Math.imul(index + 1, 2654435761)) >>> 0)
      const life = mix(emitter.lifetime[0], emitter.lifetime[1], next())
      const initial = timed ? windowStart + index * emitter.interval : index * emitter.interval - next() * life
      if (clock < initial) continue
      const birth = initial + Math.floor((clock - initial) / life) * life
      if (timed && (birth < windowStart || birth >= windowEnd)) continue
      const age = Math.max(0, clock - birth), progress = Math.min(1, age / life), seconds = binary ? age / ticksPerSecond : age
      const birthSeconds = binary ? birth / ticksPerSecond : birth
      const phase = ((birthSeconds % period) + period) % period
      const frame = Math.min(system.frame_count - 1, Math.floor(phase / period * system.frame_count))
      const anchor = track.subarray(frame * 16, frame * 16 + 16)
      const local = [0, 1, 2].map(axis => (emitter.position[axis] + emitter.attachment_position[axis] + mix(emitter.min_position[axis], emitter.max_position[axis], next()) * emitter.position_scale[axis]) * 100)
      const direction = [0, 1, 2].map(axis => mix(emitter.min_direction[axis], emitter.max_direction[axis], next()))
      const length = Math.hypot(...direction) || 1, velocity = mix(emitter.velocity[0], emitter.velocity[1], next()) * 100
      for (let axis = 0; axis < 3; axis++) local[axis] += direction[axis] / length * velocity * seconds + (emitter.gravity[axis] + emitter.acceleration[axis]) * 50 * seconds * seconds
      let position = transform(local, anchor)
      if (placement) position = transform(position, placement)
      const middle = Math.min(.99, Math.max(.01, emitter.midpoint)), segment = progress < middle ? 0 : 1
      const amount = progress < middle ? progress / middle : (progress - middle) / (1 - middle)
      const color = emitter.colors[segment].map((value, axis) => Math.min(1, Math.max(0, mix(value, emitter.colors[segment + 1][axis], amount))))
      if (color[3] < .005) continue
      const widthRandom = next(), heightRandom = next()
      const size = [0, 1].map(axis => {
        const offset = axis * 2, fraction = axis ? heightRandom : widthRandom
        return Math.abs(mix(mix(emitter.sizes[segment][offset], emitter.sizes[segment][offset + 1], fraction), mix(emitter.sizes[segment + 1][offset], emitter.sizes[segment + 1][offset + 1], fraction), amount)) * 100
      })
      const particleScale = placement ? Math.hypot(placement[0], placement[1], placement[2]) : 1
      const uv = emitter.uv[Math.floor(seconds * emitter.uv_fps) % emitter.uv.length]
      const turn = emitter.format === 'xml' ? emitter.angular_velocity * seconds : 0, cosine = Math.cos(turn), sine = Math.sin(turn)
      for (const [x, y, u, v] of [[-1, -1, uv[0], uv[3]], [1, -1, uv[2], uv[3]], [1, 1, uv[2], uv[1]], [-1, -1, uv[0], uv[3]], [1, 1, uv[2], uv[1]], [-1, 1, uv[0], uv[1]]]) {
        const horizontal = (x * size[0] * cosine - y * size[1] * sine) * particleScale / 2
        const vertical = (x * size[0] * sine + y * size[1] * cosine) * particleScale / 2
        values.push(position[0] - Math.cos(radians) * horizontal, position[1] + vertical, position[2] - Math.sin(radians) * horizontal, u, v, ...color)
      }
    }
    if (values.length) batches.push({ texture: emitter.texture, additive: emitter.additive, vertices: new Float32Array(values) })
  }
  return batches
}
