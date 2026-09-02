import { useEffect, useState } from 'react'
import useStore from '../../store/useStore'
import { addPlayVideo, getPlayVideos } from '../../api/client'

export default function RecordsTab({ song }) {
  const user = useStore(s => s.user)
  const [records, setRecords] = useState(null)
  const [url, setUrl] = useState('')
  const [ytTitle, setYtTitle] = useState(null)
  const [ytLoading, setYtLoading] = useState(false)
  const [nick, setNick] = useState(user?.nickname || '')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { setNick(user?.nickname || '') }, [user?.id, user?.nickname])

  useEffect(() => {
    // 성과 영상은 achievements에서 조회한다.
    getPlayVideos(song.id).then(setRecords)
  }, [song.id])

  const isValidYtUrl = (u) =>
    /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}(?:[/?#&].*)?$/.test(u) ||
    /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=[A-Za-z0-9_-]{11}(?:[&#].*)?$/.test(u)

  const fetchYtTitle = async (rawUrl) => {
    if (!rawUrl.trim()) { setYtTitle(null); return }
    if (!isValidYtUrl(rawUrl)) { setYtTitle(false); return }
    setYtLoading(true)
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`)
      if (res.ok) {
        const data = await res.json()
        setYtTitle(data.title ?? null)
      } else {
        setYtTitle(null)
      }
    } catch {
      setYtTitle(null)
    } finally {
      setYtLoading(false)
    }
  }

  const handleSubmit = async () => {
    // 제출 시점의 회원 닉네임을 읽어 상태 동기화 지연을 피한다.
    const effectiveNickname = (user?.nickname || nick || '').trim()
    if (!effectiveNickname || !url.trim()) return
    setSubmitting(true)
    try {
      // 성과 영상은 achievements의 description 필드에 저장한다.
      await addPlayVideo(song.id, {
        nickname: effectiveNickname,
        youtube_url: url,
        description: memo || null,
      })
      const fresh = await getPlayVideos(song.id)
      setRecords(fresh)
      setDone(true); setUrl(''); setYtTitle(null); setMemo('')
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '플레이 영상 등록에 실패했어요')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="record-form">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>플레이 영상</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>플레이 영상을 등록해 기록을 남겨보세요</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {!user && (
            <div className="rf-field">
              <label>닉네임</label>
              <input value={nick} onChange={e => setNick(e.target.value)} placeholder="닉네임" />
            </div>
          )}
          <div className="rf-field">
            <label>YouTube URL</label>
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setYtTitle(null) }}
              onBlur={e => fetchYtTitle(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
            {ytLoading && <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-4)' }}>제목 조회 중…</div>}
            {!ytLoading && ytTitle && ytTitle !== false && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>▸</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ytTitle}</span>
              </div>
            )}
            {!ytLoading && ytTitle === false && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--err, #e05)' }}>
                youtu.be/… 또는 youtube.com/watch?v=… 형식만 등록 가능합니다
              </div>
            )}
            {!ytLoading && url && ytTitle === null && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-4)' }}>영상을 찾을 수 없습니다</div>
            )}
          </div>
          <div className="rf-field">
            <label>한마디</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="이 판에 대한 소감 (선택)" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setUrl(''); setNick(user?.nickname || ''); setMemo(''); setYtTitle(null); setDone(false) }}>초기화</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={submitting || (!user?.nickname && !nick.trim()) || !url.trim() || ytTitle === false} onClick={handleSubmit}>
            {done ? '등록 완료 ✓' : submitting ? '등록 중…' : '플레이 영상 등록'}
          </button>
        </div>
      </div>

      {records == null ? (
        <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중…</div>
      ) : records.length === 0 ? (
        <div className="record-empty">
          <span className="big">🏆</span>
          아직 등록된 성과가 없어요<br/>
          <span style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>위 폼으로 첫 성과를 기록해보세요</span>
        </div>
      ) : (
        <div className="leaderboard">
          {records.map((r, i) => (
            <div key={`${r.source || 'achievement'}-${Math.abs(r.id)}`} className={`lb-row${i < 3 ? ' top' : ''}`}>
              <span className="lb-rank">#{i + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div className="lb-avatar">{r.nickname[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg)' }}>{r.nickname}</div>
                  {r.youtube_url && (
                    <a
                      href={r.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 280 }}
                    >
                      ▸ {r.youtube_title || 'YouTube'}
                    </a>
                  )}
                </div>
              </div>
              <div className="lb-date">{r.created_at?.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
