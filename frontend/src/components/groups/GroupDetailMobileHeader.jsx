import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { HelpButton } from '../HelpTour'

function roleLabel(r) {
  if (r === 'owner') return 'OWNER'
  if (r === 'manager') return 'MGR'
  if (r === 'admin') return 'ADMIN'
  return 'MEMBER'
}

export default function GroupDetailMobileHeader({
  g, hue, isOwner, isStaff, pendingCount,
  onCopyCode, onRegen, onGoManage,
}) {
  const { user, openMyPage, logout } = useStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="mob-top gd-mob-top" style={{ '--group-h': hue }}>
        <div className="mob-top-inner">
          <div className="mob-top-row">
            <button
              className="mob-icon-btn"
              onClick={() => navigate('/groups')}
              aria-label="그룹 목록으로"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div className="gd-mob-title-area">
              <div className="gd-mob-title">{g.name}</div>
              <div className="gd-mob-meta">
                <span className={`gd-role-chip ${g.my_role}`}>{roleLabel(g.my_role)}</span>
                <span>멤버 {g.members.length}</span>
                {isStaff && pendingCount > 0 && (
                  <span style={{ color: 'var(--accent)' }}>· 대기 {pendingCount}</span>
                )}
              </div>
            </div>
            <HelpButton />
            <button
              className="mob-icon-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="메뉴"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>

          {g.description && (
            <div className="gd-mob-desc">{g.description}</div>
          )}

          <div className="gd-mob-actions">
            {isStaff && !g.code_revoked && g.join_code && (
              <button className="gd-mob-action ghost" onClick={onCopyCode}>
                🔗 초대 링크 복사
              </button>
            )}
            {isStaff && pendingCount > 0 && (
              <button className="gd-mob-action ghost" onClick={onGoManage}>
                ⏳ 신청 {pendingCount}건
              </button>
            )}
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="mob-backdrop open" onClick={() => setMenuOpen(false)} />
          <div className="mob-sheet open">
            <div className="mob-sheet-handle" />
            <div className="mob-sheet-head">
              <span className="mob-sheet-title">메뉴</span>
              <button className="mob-sheet-reset" onClick={() => setMenuOpen(false)}>닫기</button>
            </div>
            <div className="gd-mob-menu">
              <button onClick={() => { setMenuOpen(false); navigate('/groups') }}>
                ← 그룹 목록으로
              </button>
              {isStaff && !g.code_revoked && g.join_code && (
                <button onClick={() => { setMenuOpen(false); onCopyCode() }}>
                  🔗 초대 링크 복사 <span className="mono" style={{ color: 'var(--fg-4)' }}>{g.join_code}</span>
                </button>
              )}
              {isOwner && (
                <button onClick={() => { setMenuOpen(false); onRegen() }}>
                  🔄 가입 코드 재발급
                </button>
              )}
              {user && (
                <>
                  <button onClick={() => { setMenuOpen(false); openMyPage() }}>
                    👤 마이페이지
                  </button>
                  <button onClick={() => { setMenuOpen(false); logout() }}>
                    🚪 로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
