export function estimateScanTime({ bytesRead, remainingBytes, elapsedMs }) {
  if (![bytesRead, remainingBytes, elapsedMs].every(value => Number.isFinite(value) && value >= 0)) return '남은 시간 계산 중…'
  if (!remainingBytes) return '검사 마무리 중…'
  if (!bytesRead || elapsedMs < 2000 || (bytesRead < 1024 ** 2 && remainingBytes >= 1024 ** 2)) return '남은 시간 계산 중…'
  const seconds = Math.max(5, Math.ceil(remainingBytes / bytesRead * elapsedMs / 5000) * 5)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const rest = seconds % 60
  return `약 ${hours ? `${hours}시간 ` : ''}${minutes ? `${minutes}분 ` : ''}${rest ? `${rest}초 ` : ''}남음`
}
