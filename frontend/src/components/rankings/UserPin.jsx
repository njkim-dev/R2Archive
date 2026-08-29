import useRankingsStore from '../../store/useRankingsStore'

export default function UserPin() {
  const { pinnedUser, unpinUser } = useRankingsStore()
  if (!pinnedUser) return null

  return (
    <div className="user-pin">
      <span className="user-pin-medal">🏆</span>
      <div className="user-pin-main">
        <div className="user-pin-name">{pinnedUser.nickname}</div>
        <div className="user-pin-sub">성과 {pinnedUser.record_count}건</div>
      </div>
      <button className="user-pin-close" onClick={unpinUser} aria-label="사용자 핀 해제">×</button>
    </div>
  )
}
