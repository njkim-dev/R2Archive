import useStore from '../store/useStore'

// 우측 상단에 노출되는 사용자 칩 (마이페이지 / 프로필 수정 / 로그아웃) 또는 로그인 버튼.
// TopBar.jsx 의 동일 마크업을 재사용 가능하게 분리.
export default function UserChip() {
  const { user, openLogin, openMyPage, openOnboarding, logout } = useStore()

  if (!user) {
    return (
      <button className="login-btn" onClick={openLogin}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
        로그인
      </button>
    )
  }

  return (
    <div className="user-chip">
      <button type="button" className="user-chip-open" onClick={openMyPage} title="마이페이지">
        <div className="user-avatar">{((user.nickname || '?')[0] || '?').toUpperCase()}</div>
        <span className="user-name">{user.nickname || '...'}</span>
      </button>
      <button className="user-logout" onClick={openOnboarding} title="프로필 수정" style={{ marginRight: 2 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
      <button className="user-logout" onClick={logout} title="로그아웃">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}
