import { useEffect } from 'react'
import useRankingsStore from '../../store/useRankingsStore'
import useStore from '../../store/useStore'

export default function UserSearchList() {
  const { search, searchMode, userResults, userSearching, searchUsers, pinUser } = useRankingsStore()
  const { user: currentUser } = useStore()

  useEffect(() => {
    if (searchMode !== 'user') return
    const t = setTimeout(() => { searchUsers(search) }, 200)
    return () => clearTimeout(t)
  }, [search, searchMode, searchUsers])

  if (searchMode !== 'user') return null

  if (!search.trim()) return null
  if (userSearching) {
    return <div className="user-list-empty"><span>검색 중...</span></div>
  }
  if (userResults.length === 0) {
    return <div className="user-list-empty"><span>일치하는 사용자가 없어요</span></div>
  }

  return (
    <div className="user-list">
      {userResults.map(u => {
        const isMe = currentUser?.id === u.user_id
        return (
          <button
            key={u.user_id}
            className="user-list-item"
            onClick={() => pinUser(u)}
            title={`${u.nickname}의 기록 보기`}
          >
            <span className={`user-list-avatar${isMe ? ' me' : ''}`}>
              {(u.nickname[0] || '?').toUpperCase()}
            </span>
            <span className="user-list-name">
              {u.nickname}
              {isMe && <span className="user-list-me">(나)</span>}
            </span>
            <span className="user-list-count mono">{u.record_count}</span>
          </button>
        )
      })}
    </div>
  )
}
