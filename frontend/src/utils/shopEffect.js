export function effectAnimation(data, meshes, expectedFrames) {
  if (data?.relative_duration != null && (!Number.isFinite(data.relative_duration) || data.relative_duration <= 0 || data.relative_duration > 100)) throw new Error('커플링 모델 동작 자료가 올바르지 않습니다.')
  if (data?.schema !== 'shop-couple-effect-v1' || !Number.isInteger(data.frame_count) || data.frame_count < 2 || data.frame_count > 5400 || expectedFrames && data.frame_count !== expectedFrames || !Array.isArray(data.meshes) || data.meshes.length !== meshes.length || !Array.isArray(data.bounds) || data.bounds.length !== 2 || !data.bounds.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)) || data.bounds[0].some((value, axis) => value > data.bounds[1][axis])) throw new Error('커플링 모델 동작 자료가 올바르지 않습니다.')
  const tracks = new Map()
  for (const mesh of data.meshes) {
    if (tracks.has(mesh.name) || !meshes.some(item => item.name === mesh.name) || !Array.isArray(mesh.frames) || mesh.frames.length !== data.frame_count * 16 || !mesh.frames.every(Number.isFinite)) throw new Error('커플링 모델 동작 자료가 올바르지 않습니다.')
    tracks.set(mesh.name, new Float32Array(mesh.frames))
  }
  return { ...data, tracks }
}
