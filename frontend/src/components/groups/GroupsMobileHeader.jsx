import useStore from '../../store/useStore'
import MobilePageNav from '../MobilePageNav'
import { HelpButton } from '../HelpTour'

export default function GroupsMobileHeader({ onCreate, onJoin, pendingCount = 0 }) {
  const { user, openLogin, logout, openMyPage } = useStore()

  return (
    <header className="mob-top">
      <div className="mob-top-inner">
        <div className="mob-top-row">
          <div className="mob-app-title">알투<b>비트</b> <span className="mob-sub">그룹</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HelpButton />
            {user ? (
              <>
                <button
                  type="button"
                  className="mob-icon-btn"
                  onClick={openMyPage}
                  title="마이페이지"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 8px' }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent, #ff6b9d)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {((user.nickname || '?')[0] || '?').toUpperCase()}
                  </div>
                </button>
                <button className="mob-icon-btn" onClick={logout} title="로그아웃">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </>
            ) : (
              <button className="mob-icon-btn" onClick={openLogin} title="로그인" style={{ width: 'auto', padding: '0 10px', fontSize: 13 }}>
                로그인
              </button>
            )}
          </div>
        </div>

        <MobilePageNav />

        {user && (
          <div className="mob-action-row">
            <button className="mob-action-btn primary" onClick={onCreate}>
              <span style={{ fontSize: 15 }}>+</span> 새 그룹
            </button>
            <button className="mob-action-btn" onClick={onJoin}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              가입 코드
            </button>
            {pendingCount > 0 && (
              <span className="mob-action-pending mono">대기 {pendingCount}</span>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
