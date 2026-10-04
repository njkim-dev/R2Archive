import useRankingsStore from '../../store/useRankingsStore'

export const SPEED_LABELS = {
  normal: '보통',
  fast: '고속',
  ultra: '초고속',
}

const OPTIONS = [
  ['all', '전체 보기'],
  ['normal', '보통만 보기'],
  ['fast', '고속만 보기'],
  ['ultra', '초고속만 보기'],
]

export default function RankingSpeedTabs({ mobile = false }) {
  const { speedFilter, setSpeedFilter } = useRankingsStore()

  return (
    <div className={`ranking-speed-tabs${mobile ? ' mobile' : ''}`} role="group" aria-label="성과 속도 필터">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`ranking-speed-tab${speedFilter === value ? ' active' : ''}`}
          aria-pressed={speedFilter === value}
          onClick={() => setSpeedFilter(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
