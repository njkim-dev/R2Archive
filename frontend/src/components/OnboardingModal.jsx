import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import { patchMe, checkNickname } from '../api/client'

export default function OnboardingModal() {
  const { onboardingOpen, closeOnboarding, user, setUser } = useStore()
  const [nickname, setNickname] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [showScreenshot, setShowScreenshot] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [nickStatus, setNickStatus] = useState(null)   // null | 'checking' | 'ok' | 'taken' | 'invalid'
  const debRef = useRef(null)

  useEffect(() => {
    if (onboardingOpen) {
      setNickname(user?.nickname || '')
      setVisibility(user?.default_visibility || 'public')
      setShowScreenshot(!!user?.show_screenshot)
      setErr('')
      setNickStatus(null)
    }
  }, [onboardingOpen, user])

  useEffect(() => {
    if (!onboardingOpen) return
    const n = nickname.trim()
    if (n.length < 1) { setNickStatus(null); return }
    if (n.length > 30) { setNickStatus('invalid'); return }
    if (user?.nickname && n.toLowerCase() === user.nickname.toLowerCase()) {
      setNickStatus('ok')
      return
    }
    setNickStatus('checking')
    clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      try {
        const { available } = await checkNickname(n)
        setNickStatus(available ? 'ok' : 'taken')
      } catch {
        setNickStatus(null)
      }
    }, 300)
    return () => clearTimeout(debRef.current)
  }, [nickname, onboardingOpen, user])

  if (!onboardingOpen) return null

  const handleSave = async () => {
    const nick = nickname.trim()
    if (nick.length < 1 || nick.length > 30) {
      setErr('닉네임은 1~30자로 입력해주세요')
      return
    }
    if (nickStatus === 'taken') {
      setErr('이미 사용 중인 닉네임이에요')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const { user: updated } = await patchMe({
        nickname: nick,
        default_visibility: visibility,
        show_screenshot: showScreenshot,
      })
      setUser(updated)
      closeOnboarding()
    } catch (e) {
      if (e?.response?.status === 409) {
        setErr('이미 사용 중인 닉네임이에요')
        setNickStatus('taken')
      } else {
        setErr(e?.response?.data?.detail || '저장에 실패했어요')
      }
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!user?.onboarded

  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="onboarding-modal" style={{ position: 'relative' }}>
        {isEdit && (
          <button
            className="onb-close"
            onClick={closeOnboarding}
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        )}
        <div className="brand-mark" style={{ margin: '0 auto 16px', width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, var(--accent), oklch(0.60 0.22 340))', display: 'grid', placeItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <h3 style={{ textAlign: 'center', margin: '0 0 6px' }}>{isEdit ? '프로필 수정' : '프로필 설정'}</h3>
        <p style={{ textAlign: 'center', color: 'var(--fg-3)', fontSize: 12.5, margin: '0 0 22px' }}>
          {isEdit
            ? '닉네임과 기본 공개 설정을 변경할 수 있어요'
            : '닉네임과 기본 공개 설정을 선택해주세요'}
        </p>

        <div className="onb-field">
          <label>닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="1~30자"
            maxLength={30}
            autoFocus
          />
          {nickStatus === 'checking' && <div className="onb-hint">확인 중…</div>}
          {nickStatus === 'ok' && <div className="onb-hint ok">✓ 사용 가능한 닉네임</div>}
          {nickStatus === 'taken' && <div className="onb-hint bad">✗ 이미 사용 중인 닉네임</div>}
          {nickStatus === 'invalid' && <div className="onb-hint bad">1~30자로 입력해주세요</div>}
        </div>

        <div className="onb-field">
          <label>랭킹 공개 여부</label>
          <div className="onb-vis-col">
            {[
              { v: 'public',    title: '공개',        desc: '닉네임과 함께 랭킹에 노출' },
              { v: 'anonymous', title: '익명으로 공개', desc: '"익명"으로 랭킹에 노출' },
              { v: 'private',   title: '비공개',      desc: '랭킹에 노출되지 않음 (본인만 열람)' },
            ].map(opt => (
              <label key={opt.v} className={`onb-vis-opt${visibility === opt.v ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === opt.v}
                  onChange={() => setVisibility(opt.v)}
                />
                <div>
                  <b>{opt.title}</b>
                  <span>{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="onb-field">
          <label className="onb-checkbox">
            <input
              type="checkbox"
              checked={showScreenshot}
              onChange={e => setShowScreenshot(e.target.checked)}
            />
            <span>랭킹 등록 시 내 스크린샷 & YouTube 링크를 다른 사람이 볼 수 있게 합니다</span>
          </label>
        </div>

        {err && <div className="onb-err">{err}</div>}

        <button
          className="onb-submit"
          onClick={handleSave}
          disabled={saving || nickStatus === 'checking' || nickStatus === 'taken' || nickStatus === 'invalid'}
        >
          {saving ? '저장 중…' : (isEdit ? '저장' : '저장하고 시작하기')}
        </button>
      </div>
    </div>
  )
}
