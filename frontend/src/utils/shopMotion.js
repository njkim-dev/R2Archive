export function multiplyPose(a, b) {
  const result = new Float32Array(16)
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) for (let k = 0; k < 4; k++) result[row * 4 + column] += a[row * 4 + k] * b[k * 4 + column]
  return result
}
export function extraLocal(bind, track, frame) {
  if (!track) return bind
  const result = new Float32Array(bind), sample = track.frames.subarray(frame * 16, frame * 16 + 16)
  for (let row = 0; row < 3; row++) {
    const offset = row * 4
    const oldLength = Math.hypot(...bind.slice(offset, offset + 3)) || 1
    const newLength = Math.hypot(...sample.slice(offset, offset + 3)) || 1
    for (let column = 0; column < 3; column++) {
      if (track.rotation) result[offset + column] = sample[offset + column] / newLength * (track.scale ? newLength : oldLength)
      else if (track.scale) result[offset + column] = bind[offset + column] / oldLength * newLength
    }
  }
  if (track.position) for (let axis = 0; axis < 3; axis++) result[12 + axis] = sample[12 + axis]
  return result
}
