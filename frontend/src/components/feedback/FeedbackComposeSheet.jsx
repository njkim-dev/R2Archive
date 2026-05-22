import { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../../store/useStore'
import { createFeedback } from '../../api/client'
import { matchSong } from '../../utils/helpers'

const BUG_TYPES = [
  { v: 'data',    label: '데이터 오류',         desc: 'BPM·콤보·시간이 실제와 다를 때',   icon: '📊' },
  { v: 'ranking', label: '랭킹/기록 문제',      desc: '잘못된 성과 등록·삭제 요청',       icon: '🏁' },
  { v: 'comment', label: '부적절 댓글/게시물',  desc: '신고하고 싶은 콘텐츠',             icon: '🗯' },
  { v: 'ui',      label: '화면/동작 이상',      desc: 'UI가 깨지거나 버튼이 안 눌릴 때',  icon: '🖥' },
  { v: 'login',   label: '로그인/계정',         desc: '소셜 로그인·세션 관련',            icon: '🔑' },
  { v: 'other',   label: '기타',                desc: '위 항목에 속하지 않는 문제',       icon: '❓' },
]

const FEATURE_TYPES = [
  { v: 'search',    label: '검색·필터',     desc: '새로운 정렬·필터 옵션',  icon: '🔍' },
  { v: 'ranking',   label: '랭킹·통계',     desc: '순위 표시 방식 개선',    icon: '🏆' },
  { v: 'community', label: '커뮤니티',      desc: '게시판·댓글 기능',       icon: '💬' },
  { v: 'record',    label: '성과 등록',     desc: '기록 입력·인증 방식',    icon: '🎯' },
  { v: 'ux',        label: 'UX·디자인',     desc: '사용성 개선 제안',       icon: '🎨' },
  { v: 'other',     label: '기타 아이디어', desc: '자유로운 제안',          icon: '💡' },
]

export default function FeedbackComposeSheet({ open, tab, onClose, onSubmitted }) {
  const { user, openLogin, songs } = useStore()
  const [type, setType] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState('med')
  const [songQuery, setSongQuery] = useState('')
  const [pickedSong, setPickedSong] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const songInputRef = useRef(null)
  const suggestRef = useRef(null)

  // 열림 시 + 탭 변경 시 초기화.
  useEffect(() => {
    if (!open) return
    setType(null); setTitle(''); setBody(''); setSeverity('med')
    setSongQuery(''); setPickedSong(null); setShowSuggest(false)
  }, [open, tab])

  // 외부 클릭 → suggest 닫기
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (songInputRef.current?.contains(e.target)) return
      if (suggestRef.current?.contains(e.target)) return
      setShowSuggest(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const suggestions = useMemo(() => {
    const q = songQuery.trim()
    if (!q) return []
    return songs.filter(s => matchSong(s, q)).slice(0, 6)
  }, [songQuery, songs])

  const isBug = tab === 'bug'
  const isValid = !!type && title.trim().length > 0 && body.trim().length > 0
  const options = isBug ? BUG_TYPES : FEATURE_TYPES

  const handleSubmit = async () => {
    if (!user) { openLogin(); return }
    if (!isValid || busy) return
    setBusy(true)
    try {
      const item = await createFeedback({
        tab,
        type,
        title: title.trim(),
        body: body.trim(),
        severity: isBug ? severity : 'low',
        song_id: isBug && pickedSong ? pickedSong.id : null,
        song_title: isBug && pickedSong ? `${pickedSong.name} — ${pickedSong.artist}` : '',
      })
      onSubmitted(item)
      onClose()
      alert(isBug ? '버그 신고가 접수되었어요' : '제안이 등록되었어요')
    } catch (e) {
      alert(e?.response?.data?.detail || '제출에 실패했어요')
    } finally { setBusy(false) }
  }

  if (!open) return null

  return (
    <div className="fb-mob-sheet">
      <div className="fb-mob-sheet-top">
        <button className="mob-icon-btn" onClick={onClose} aria-label="닫기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div className="fb-mob-sheet-title">
          {isBug ? '🐞 새 버그 신고' : '✨ 새 기능 제안'}
        </div>
      </div>

      <div className="fb-mob-sheet-body">
        <div className="fb-mob-desc">
          {isBug
            ? '발견한 문제를 자세히 알려주세요'
            : '좋은 아이디어를 제안해주세요!'}
        </div>

        <div className="fb-mob-field">
          <div className="fb-field-label">{isBug ? '유형' : '분야'}</div>
          <div className="fb-mob-type-list">
            {options.map(opt => (
              <button
                key={opt.v}
                type="button"
                className={`fb-mob-type-item${type === opt.v ? ' on' : ''}`}
                onClick={() => setType(opt.v)}
              >
                <span className="fb-mob-type-ico">{opt.icon}</span>
                <div className="fb-mob-type-text">
                  <span className="fb-mob-type-lbl">{opt.label}</span>
                  <span className="fb-mob-type-desc">{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="fb-mob-field">
          <div className="fb-field-label">
            <span>제목</span>
            <span className="fb-counter mono">{title.length}/120</span>
          </div>
          <input
            type="text"
            className="fb-input"
            maxLength={120}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="한 줄로 요약해주세요"
          />
        </div>

        {isBug && (
          <>
            <div className="fb-mob-field">
              <div className="fb-field-label">
                <span>관련 곡</span><span className="fb-muted">선택</span>
              </div>
              <input
                ref={songInputRef}
                type="text"
                className="fb-input"
                placeholder="곡명·아티스트 검색…"
                value={songQuery}
                onChange={e => { setSongQuery(e.target.value); setPickedSong(null); setShowSuggest(true) }}
                onFocus={() => setShowSuggest(true)}
                onKeyDown={e => {
                  if ((e.key === 'Backspace' || e.key === 'Delete') && pickedSong) {
                    e.preventDefault()
                    setPickedSong(null)
                    setSongQuery('')
                    setShowSuggest(false)
                  }
                }}
                autoComplete="off"
              />
              {showSuggest && suggestions.length > 0 && (
                <div ref={suggestRef} className="fb-mob-suggest">
                  {suggestions.map(s => (
                    <div
                      key={s.id}
                      className="fb-song-row"
                      onClick={() => {
                        setPickedSong(s)
                        setSongQuery(`${s.name} — ${s.artist}`)
                        setShowSuggest(false)
                      }}
                    >
                      <span style={{ color: 'var(--fg)' }}>{s.name}</span>
                      <span className="fb-muted mono">{s.artist} · Lv {s.level.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fb-mob-field">
              <div className="fb-field-label"><span>심각도</span></div>
              <select className="fb-select" value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="low">낮음 — 사소한 불편</option>
                <option value="med">중간 — 일반적 사용에 영향</option>
                <option value="high">높음 — 사용 불가</option>
              </select>
            </div>
          </>
        )}

        <div className="fb-mob-field">
          <div className="fb-field-label">
            <span>상세 내용</span>
            <span className="fb-counter mono">{body.length} / 2000</span>
          </div>
          <textarea
            className="fb-textarea"
            maxLength={2000}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="언제·어디서·어떻게 발생했는지, 기대했던 결과는 무엇이었는지 알려주세요."
            rows={6}
          />
        </div>

        <div className="fb-validity">
          <span className={type ? 'ok' : 'no'}>{type ? '✓' : '○'} 유형</span>
          <span className={title.trim().length > 0 ? 'ok' : 'no'}>
            {title.trim().length > 0 ? '✓' : '○'} 제목
          </span>
          <span className={body.trim().length > 0 ? 'ok' : 'no'}>
            {body.trim().length > 0 ? '✓' : '○'} 내용
          </span>
        </div>
      </div>

      <div className="fb-mob-sheet-foot">
        <button className="fb-btn ghost" onClick={onClose}>취소</button>
        <button
          type="button"
          className="fb-btn primary"
          aria-disabled={!isValid || busy}
          data-disabled={!isValid || busy ? 'true' : 'false'}
          onClick={() => { if (isValid && !busy) handleSubmit() }}
        >
          {busy ? '제출 중…' : '제출'}
        </button>
      </div>
    </div>
  )
}
