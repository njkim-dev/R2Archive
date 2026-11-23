const initialEstimates = { bottom: [30, 65], all: [35, 80] }

export function searchEstimate(value, slot = 'all') {
  const lower = Number(value?.min_seconds), upper = Number(value?.max_seconds)
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 1 || upper <= lower || upper > 150) {
    const [min_seconds, max_seconds] = initialEstimates[slot] || [10, 30]
    return { min_seconds, max_seconds }
  }
  return { min_seconds: Math.floor(lower), max_seconds: Math.ceil(upper) }
}

export function searchProgress(seconds, estimate) {
  const elapsed = Math.max(0, Math.floor(seconds))
  if (elapsed >= estimate.max_seconds) return `예상보다 오래 걸리고 있습니다. 계속 검색 중입니다.\n${elapsed}초 경과`
  const upper = estimate.max_seconds - elapsed, lower = Math.max(1, estimate.min_seconds - elapsed)
  return `캐릭터의 아이템을 찾고 있습니다.\n예상 남은 시간 약 ${lower === upper ? upper : `${lower}~${upper}`}초 · ${elapsed}초 경과\n실제 처리 시간은 달라질 수 있습니다.`
}
