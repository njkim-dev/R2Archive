import { useEffect, useState } from 'react'
import useStore from '../store/useStore'
import { getMyRecords, getMyComments, deleteMyRecord, deleteMyComment } from '../api/client'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function MyPageModal() {
  const { myPageOpen, closeMyPage, user, songs, openModal } = useStore()
  const [tab, setTab] = useState('records')
  const [records, setRecords] = useState(null)
  const [comments, setComments] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')  // all / screenshot / youtube

  useEffect(() => {
    if (!myPageOpen || !user) return
    setLoading(true)
    Promise.all([getMyRecords(), getMyComments()])
      .then(([rec, com]) => {
        setRecords(rec.records || [])
        setComments(com.comments || [])
      })
      .catch(() => {
        setRecords([])
        setComments([])
      })
      .finally(() => setLoading(false))
  }, [myPageOpen, user])

  if (!myPageOpen) return null
  if (!user) return null

  const filteredRecords = (records || []).filter(r => {
    if (filter === 'screenshot') return r.has_screenshot
    if (filter === 'youtube') return !!r.youtube_url
    return true
  })

  const handleSongClick = (songId) => {
    const song = songs.find(s => s.id === songId)
    if (song) {
      closeMyPage()
      openModal(song)
    }
  }

  const handleDeleteRecord = async (recordId) => {
    if (!confirm('이 기록을 삭제할까요? (스크린샷도 함께 삭제됩니다)')) return
    try {
      await deleteMyRecord(recordId)
      setRecords(prev => prev.filter(r => r.id !== recordId))
    } catch {
      alert('삭제에 실패했어요')
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm('이 댓글을 삭제할까요?')) return
    try {
      await deleteMyComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch {
      alert('삭제에 실패했어요')
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeMyPage()}>
      <div className="login-modal" style={{ width: 'min(720px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>마이페이지</h2>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 2 }}>{user.nickname}</div>
          </div>
          <button onClick={closeMyPage} className="btn btn-ghost btn-icon" aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--bd-2, #2a2a2a)', marginBottom: 12 }}>
          <TabButton active={tab === 'records'} onClick={() => setTab('records')}>
            내 기록 {records && <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>· {records.length}</span>}
          </TabButton>
          <TabButton active={tab === 'comments'} onClick={() => setTab('comments')}>
            내 댓글 {comments && <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>· {comments.length}</span>}
          </TabButton>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-4)' }}>불러오는 중...</div>}

          {!loading && tab === 'records' && (
            <RecordsTab
              records={filteredRecords}
              filter={filter}
              setFilter={setFilter}
              totalCount={records?.length || 0}
              onSongClick={handleSongClick}
              onDelete={handleDeleteRecord}
            />
          )}

          {!loading && tab === 'comments' && (
            <CommentsTab comments={comments || []} onSongClick={handleSongClick} onDelete={handleDeleteComment} />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: 'none',
        border: 'none',
        color: active ? 'var(--fg-1)' : 'var(--fg-4)',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        borderBottom: active ? '2px solid var(--accent, #ff6b9d)' : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function RecordsTab({ records, filter, setFilter, totalCount, onSongClick, onDelete }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: '전체' },
          { key: 'screenshot', label: '스크린샷' },
          { key: 'youtube', label: '유튜브' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              background: filter === key ? 'var(--accent, #ff6b9d)' : 'var(--bg-2, #1f1f1f)',
              color: filter === key ? '#fff' : 'var(--fg-3)',
              border: '1px solid var(--bd-2, #2a2a2a)',
              borderRadius: 12,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState text={totalCount === 0 ? '아직 등록한 기록이 없어요' : '필터에 맞는 기록이 없어요'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.map(r => (
            <RecordRow key={r.id} record={r} onSongClick={onSongClick} onDelete={onDelete} />
          ))}
        </div>
      )}
    </>
  )
}

function RecordRow({ record, onSongClick, onDelete }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-2, #1a1a1a)', border: '1px solid var(--bd-2, #2a2a2a)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <button
          onClick={() => onSongClick(record.song_id)}
          style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {record.song_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 2 }}>
            {record.artist} · LV {record.song_level?.toFixed(1)}
          </div>
        </button>

        <button
          onClick={() => onDelete(record.id)}
          title="기록 삭제"
          style={{ padding: '3px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--bd-2, #2a2a2a)', borderRadius: 4, color: 'var(--fg-4)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.borderColor = '#ff6b6b' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.borderColor = 'var(--bd-2, #2a2a2a)' }}
        >
          삭제
        </button>
      </div>

      {record.memo && record.memo.trim() && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          한마디 “{record.memo}”
          {!record.memo_public && (
            <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--fg-4)' }}>· 비공개</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--fg-3)', flexWrap: 'wrap' }}>
        {record.judgment_percent != null && <span>판정 <b style={{ color: 'var(--fg-1)' }}>{record.judgment_percent.toFixed(3)}%</b></span>}
        {record.score != null && <span>점수 <b style={{ color: 'var(--fg-1)' }}>{record.score.toLocaleString()}</b></span>}
        {record.combo != null && <span>콤보 <b style={{ color: 'var(--fg-1)' }}>{record.combo.toLocaleString()}</b></span>}
        {record.has_screenshot && <span style={{ color: 'var(--accent, #ff6b9d)' }}>📷 스크린샷</span>}
        {record.youtube_url && <a href={record.youtube_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #ff6b9d)' }}>▶ 유튜브</a>}
        <span style={{ marginLeft: 'auto', color: 'var(--fg-4)' }}>{formatDate(record.created_at)}</span>
      </div>
    </div>
  )
}

function CommentsTab({ comments, onSongClick, onDelete }) {
  if (comments.length === 0) return <EmptyState text="아직 작성한 댓글이 없어요" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comments.map(c => (
        <div key={c.id} style={{ padding: 12, background: 'var(--bg-2, #1a1a1a)', border: '1px solid var(--bd-2, #2a2a2a)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <button
              onClick={() => onSongClick(c.song_id)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0 }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg-1)' }}>
                {c.song_name} <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}>· {c.artist}</span>
              </div>
            </button>
            <button
              onClick={() => onDelete(c.id)}
              title="댓글 삭제"
              style={{ padding: '3px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--bd-2, #2a2a2a)', borderRadius: 4, color: 'var(--fg-4)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.borderColor = '#ff6b6b' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.borderColor = 'var(--bd-2, #2a2a2a)' }}
            >
              삭제
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {c.content}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-4)', textAlign: 'right' }}>
            {formatDate(c.created_at)}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-4)', fontSize: 13 }}>
      {text}
    </div>
  )
}
