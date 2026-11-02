export function cropPixels(crop, width, height) {
  if (!Array.isArray(crop) || crop.length !== 4 || crop.some(value => !Number.isFinite(value) || value < 0 || value > 1000)) throw new Error('검색할 영역을 지정해주세요.')
  const [left, top, right, bottom] = crop
  const x = Math.floor(left * width / 1000), y = Math.floor(top * height / 1000)
  const w = Math.min(width, Math.ceil(right * width / 1000)) - x, h = Math.min(height, Math.ceil(bottom * height / 1000)) - y
  if (w < 16 || h < 16) throw new Error('검색 영역은 가로와 세로가 각각 16px 이상이어야 합니다.')
  return { x, y, width: w, height: h }
}

export async function searchCropFile(source, crop, signal) {
  const image = new Image()
  image.src = source.url
  await image.decode()
  signal?.throwIfAborted()
  const area = cropPixels(crop, image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1, 4096 / area.width, 4096 / area.height, Math.sqrt(16000000 / (area.width * area.height)))
  const canvas = document.createElement('canvas')
  for (let attempt = 0; attempt < 8; attempt++) {
    signal?.throwIfAborted()
    canvas.width = Math.max(16, Math.floor(area.width * scale * .8 ** attempt))
    canvas.height = Math.max(16, Math.floor(area.height * scale * .8 ** attempt))
    canvas.getContext('2d').drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    signal?.throwIfAborted()
    if (blob && blob.size <= 8 * 1024 * 1024) return new File([blob], 'search-region.png', { type: 'image/png' })
  }
  throw new Error('검색 영역이 너무 큽니다. 더 작은 영역을 지정해주세요.')
}
