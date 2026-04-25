import { useEffect, useState } from 'react'
import useStore from '../store/useStore'
import { oauthLoginUrl } from '../api/client'

export default function LoginModal() {
  const { loginOpen, closeLogin } = useStore()
  const [remember, setRemember] = useState(false)
  const [lastProvider, setLastProvider] = useState(null)

  useEffect(() => {
    if (!loginOpen) return
    try { setLastProvider(localStorage.getItem('r2b_last_provider')) } catch {}
  }, [loginOpen])

  if (!loginOpen) return null

  const go = (provider) => {
    location.href = oauthLoginUrl(provider, remember)
  }

  const recentBadge = (p) => lastProvider === p ? (
    <span style={{
      position: 'absolute', top: -8, right: 10,
      fontSize: 10, fontWeight: 600,
      background: 'var(--accent)', color: 'var(--accent-ink, #fff)',
      padding: '2px 8px', borderRadius: 999,
      whiteSpace: 'nowrap',
    }}>
      최근 이걸로 로그인했어요
    </span>
  ) : null

  const btnWrap = { position: 'relative' }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeLogin()}>
      <div className="login-modal">
        <div className="brand-mark" style={{ margin: '0 auto 18px', width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, var(--accent), oklch(0.60 0.22 340))', display: 'grid', placeItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <h3>알투비트 아카이브</h3>
        <p>로그인하면 기록을 등록하고<br/>내 기록을 관리할 수 있어요</p>

        <div style={btnWrap}>
          {recentBadge('naver')}
          <button className="oauth-btn naver" onClick={() => go('naver')}>
            <span style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', background: '#fff', color: '#03c75a', fontWeight: 700, fontSize: 12, borderRadius: 3 }}>N</span>
            네이버로 계속하기
          </button>
        </div>
        <div style={btnWrap}>
          {recentBadge('kakao')}
          <button className="oauth-btn kakao" onClick={() => go('kakao')}>
            <span style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', background: '#3c1e1e', color: '#fee500', borderRadius: 3 }}>
              <svg width="12" height="11" viewBox="0 0 18 17" fill="currentColor"><path d="M9 0C4.03 0 0 3.18 0 7.1c0 2.55 1.7 4.78 4.26 6.04-.18.64-.68 2.5-.78 2.89-.12.48.18.47.37.34.15-.1 2.35-1.59 3.3-2.24.6.1 1.22.14 1.85.14 4.97 0 9-3.18 9-7.1S13.97 0 9 0z"/></svg>
            </span>
            카카오로 계속하기
          </button>
        </div>
        <div style={btnWrap}>
          {recentBadge('google')}
          <button className="oauth-btn google" onClick={() => go('google')}>
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Google로 계속하기
          </button>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 14, padding: '8px 4px',
          fontSize: 13, color: 'var(--fg-3)',
          cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          로그인 상태 유지
        </label>

        <div className="login-foot">
          R2Archive는 그 어떠한 정보도 수집하지 않습니다.
        </div>
      </div>
    </div>
  )
}
