import { useState } from 'react'
import useStore from '../store/useStore'
import { submitFeedback } from '../api/client'
import { getAnonId } from '../utils/helpers'

const TYPES = [
  { value: 'bpm',            label: 'BPM 오류' },
  { value: 'combo',          label: '콤보 오류' },
  { value: 'time',           label: '재생 시간 오류' },
  { value: 'record_delete',  label: '잘못된 성과 삭제 요청' },
  { value: 'comment_delete', label: '부적절 댓글 삭제 요청' },
]

export default function FeedbackModal() {
  const { feedbackOpen, feedbackSong, closeFeedback } = useStore()
  const [type, setType] = useState('bpm')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!feedbackOpen || !feedbackSong) return null

  const handleSend = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await submitFeedback(feedbackSong.id, { anon_id: getAnonId(), type, body: body.trim() })
      setDone(true)
      setTimeout(() => { closeFeedback(); setDone(false); setBody(''); setType('bpm') }, 900)
    } catch (_) {
      // interceptor가 429 alert 처리.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeFeedback()}>
      <div className="login-modal" style={{ width: 'min(480px, 100%)', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>피드백 보내기</h3>
          <button className="m-close" style={{ width: 28, height: 28 }} onClick={closeFeedback}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>

        <p style={{ textAlign: 'left', marginBottom: 16 }}>
          <b style={{ color: 'var(--fg)' }}>{feedbackSong.name} · {feedbackSong.artist}</b>에 대한 문의사항을 남겨주세요.
        </p>

        <div style={{ color: 'var(--fg-4)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>문의 유형</div>
        <div className="fb-types">
          {TYPES.map(({ value, label }) => (
            <label key={value} className="fb-type">
              <input type="radio" name="fbt" value={value} checked={type === value} onChange={() => setType(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div style={{ color: 'var(--fg-4)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>상세 내용</div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="예: 실제 BPM은 170인데 172.0으로 표기되어 있습니다…"
          style={{
            width: '100%', minHeight: 100, padding: 12, borderRadius: 10,
            background: 'var(--surface-1)', border: '1px solid var(--line-soft)',
            color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none'
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={closeFeedback}>취소</button>
          <button
            className="btn btn-primary"
            disabled={submitting || !body.trim()}
            onClick={handleSend}
            style={done ? { background: 'var(--ok)' } : {}}
          >
            {done ? '전송 완료 ✓' : submitting ? '전송 중…' : '피드백 전송'}
          </button>
        </div>
      </div>
    </div>
  )
}
