import { useEffect, useState } from 'react'
import useStore from '../../store/useStore'
import { addComment, getComments } from '../../api/client'

export default function CommentsTab({ song }) {
  const user = useStore(s => s.user)
  const [comments, setComments] = useState(null)
  const [nick, setNick] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getComments(song.id).then(setComments)
  }, [song.id])

  const effectiveNick = user?.nickname || nick

  const handleSubmit = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await addComment(song.id, {
        nickname: user?.nickname || nick.trim() || null,
        content: body.trim(),
      })
      const fresh = await getComments(song.id)
      setComments(fresh)
      setBody('')
      if (!user) setNick('')
    } catch (_) {
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="comment-form">
        <div className="avatar-me">{effectiveNick?.[0] || '익'}</div>
        <div style={{ flex: 1 }}>
          {user ? (
            <div className="comment-nick-input" style={{ color: 'var(--fg-2)', cursor: 'default', userSelect: 'none' }}>
              {user.nickname}
            </div>
          ) : (
            <input
              type="text"
              className="comment-nick-input"
              placeholder="닉네임 (비우면 자동 부여)"
              value={nick}
              onChange={e => setNick(e.target.value)}
            />
          )}
          <textarea
            className="comment-body-input"
            placeholder="이 곡에 대한 팁이나 감상을 남겨보세요…"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setBody('')}>취소</button>
            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} disabled={submitting || !body.trim()} onClick={handleSubmit}>
              {submitting ? '작성 중…' : '댓글 작성'}
            </button>
          </div>
        </div>
      </div>

      {comments == null ? (
        <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중…</div>
      ) : comments.length === 0 ? (
        <div className="record-empty" style={{ marginTop: 14 }}>아직 댓글이 없어요 — 첫 댓글을 남겨보세요</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--surface-1)', borderRadius: 10 }}>
              <div className="lb-avatar" style={{ width: 30, height: 30 }}>{c.nickname[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{c.nickname}</b>
                  {c.perceived_level != null && (
                    <span className="c-badge">체감 LV {c.perceived_level.toFixed(1)}</span>
                  )}
                  <span style={{ fontSize: 10.5, color: 'var(--fg-4)', fontFamily: "'JetBrains Mono',monospace", marginLeft: 'auto' }}>
                    {c.created_at?.slice(0, 10)}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{c.content}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
