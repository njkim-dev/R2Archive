import useStore from '../../store/useStore'
import MobilePageNav from '../MobilePageNav'
import { HelpButton } from '../HelpTour'

export default function FeedbackMobileHeader({ tab, onTabChange, search, onSearchChange }) {
  const { user, openLogin, logout, openMyPage } = useStore()

  return (
    <header className="mob-top">
      <div className="mob-top-inner">
        <div className="mob-top-row">
          <div className="mob-app-title">알투<b>비트</b> <span className="mob-sub">피드백</span></div>
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

        <label className={`mob-search${search ? ' has-val' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--fg-4)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            placeholder="제목 · 내용 검색"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button className="mob-search-clear" onClick={() => onSearchChange('')} aria-label="검색 지우기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </label>

        <div className="fb-mob-tabs">
          <button className={tab === 'bug' ? 'on' : ''} onClick={() => onTabChange('bug')}>
            🐞 버그 신고
          </button>
          <button className={tab === 'feature' ? 'on' : ''} onClick={() => onTabChange('feature')}>
            ✨ 기능 개선
          </button>
        </div>
      </div>
    </header>
  )
}
