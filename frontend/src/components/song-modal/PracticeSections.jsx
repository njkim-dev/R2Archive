import { useEffect, useState } from 'react'
import useStore from '../../store/useStore'
import {
  addPracticeSection,
  deletePracticeSection,
  getMyPracticeSections,
  getPracticeSections,
  getRecommendedPracticeSections,
  getSongPersonalCategories,
  recommendPracticeSection,
} from '../../api/client'
import { isXyxMode } from '../../utils/serverMode'

export function SavedCategoryTags({ song, onOpenCategory }) {
  const user = useStore(s => s.user)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!user || !song?.id) {
      setCategories([])
      setLoading(false)
      return
    }
    setCategories([])
    setLoading(true)
    getSongPersonalCategories(song.id)
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [song?.id, user?.id])

  useEffect(() => {
    if (!user || !song?.id) return
    const handler = (event) => {
      if (Number(event.detail?.songId) === Number(song.id)) load()
    }
    window.addEventListener('personal-category-song-saved', handler)
    return () => window.removeEventListener('personal-category-song-saved', handler)
  }, [song?.id, user?.id])

  if (!user || loading || categories.length === 0) return null

  return (
    <div className="m-saved-cats">
      <div className="m-saved-cats-label">저장된 카테고리</div>
      <div className="m-saved-cats-row">
        {categories.map(category => (
          <button
            key={category.id}
            className="m-saved-cat-tag"
            title={`${category.name} 카테고리로 이동`}
            onClick={() => onOpenCategory(category)}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatPracticeTime(seconds) {
  const total = Math.max(0, Number(seconds || 0))
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function parsePracticeTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const korean = raw.match(/^(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?$/)
  if (korean && (korean[1] || korean[2] || korean[3])) {
    return Number(korean[1] || 0) * 3600 + Number(korean[2] || 0) * 60 + Number(korean[3] || 0)
  }
  if (/^\d+$/.test(raw)) return Number(raw)
  const parts = raw.split(':').map(x => x.trim())
  if (parts.length === 2 && parts.every(x => /^\d+$/.test(x))) {
    return Number(parts[0]) * 60 + Number(parts[1])
  }
  if (parts.length === 3 && parts.every(x => /^\d+$/.test(x))) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  }
  return null
}

function PracticeSectionLine({ section, compact = false, action = null }) {
  return (
    <div className={`practice-section-line${compact ? ' compact' : ''}`}>
      <div className="practice-section-main">
        <span className="practice-section-time">
          {formatPracticeTime(section.start_seconds)}~{formatPracticeTime(section.end_seconds)}
        </span>
        <span className="practice-section-desc">: {section.description}</span>
      </div>
      {!compact && (
        <div className="practice-section-meta">
          <span>{section.nickname || '사용자'}</span>
          <span>{section.created_at?.slice(0, 10)}</span>
        </div>
      )}
      {action}
    </div>
  )
}

export function PracticeSectionsSummary({ song }) {
  const { user, openLogin } = useStore()
  const [recommended, setRecommended] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!song?.id || isXyxMode()) {
      setRecommended([])
      setMine([])
      return
    }
    setLoading(true)
    Promise.all([
      getRecommendedPracticeSections(song.id).catch(() => []),
      user ? getMyPracticeSections(song.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([rec, my]) => {
        setRecommended(Array.isArray(rec) ? rec : [])
        setMine(Array.isArray(my) ? my : [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [song?.id, user?.id])

  useEffect(() => {
    const handler = (event) => {
      if (Number(event.detail?.songId) === Number(song?.id)) load()
    }
    window.addEventListener('practice-sections-updated', handler)
    return () => window.removeEventListener('practice-sections-updated', handler)
  }, [song?.id, user?.id])

  if (isXyxMode()) return null

  return (
    <div className="practice-summary">
      {recommended.length > 0 && (
        <div className="practice-block">
          <div className="practice-label">추천 연습 구간</div>
          <div className="practice-list">
            {recommended.map(section => <PracticeSectionLine key={section.id} section={section} compact />)}
          </div>
        </div>
      )}

      <div className="practice-block">
        <div className="practice-label">개인 연습 구간</div>
        <div className="practice-list">
          {!user ? (
            <button className="btn btn-ghost m-saved-cats-login" onClick={openLogin}>로그인하세요</button>
          ) : loading ? (
            <span className="m-saved-cats-muted">불러오는 중...</span>
          ) : mine.length > 0 ? (
            mine.map(section => <PracticeSectionLine key={section.id} section={section} compact />)
          ) : (
            <span className="m-saved-cats-muted">내가 등록한 연습 구간이 없습니다</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function PracticeSectionForm({ song }) {
  const { user, openLogin } = useStore()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [endTouched, setEndTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setStart('')
    setEnd('')
    setEndTouched(false)
    setDescription('')
    setDone(false)
  }, [song.id])

  const handleStartChange = (value) => {
    setStart(value)
    setDone(false)
    if (endTouched) return
    const startSeconds = parsePracticeTime(value)
    setEnd(startSeconds == null ? '' : formatPracticeTime(startSeconds + 30))
  }

  const handleEndChange = (value) => {
    setEndTouched(true)
    setEnd(value)
    setDone(false)
  }

  const handleSubmit = async () => {
    const startSeconds = parsePracticeTime(start)
    const endSeconds = parsePracticeTime(end)
    const desc = description.trim()
    if (startSeconds == null || endSeconds == null) {
      alert('시간은 0:48 또는 48 형식으로 입력해주세요.')
      return
    }
    if (endSeconds <= startSeconds) {
      alert('종료 시간은 시작 시간보다 뒤여야 합니다.')
      return
    }
    if (!desc) {
      alert('설명을 입력해주세요.')
      return
    }
    setSubmitting(true)
    try {
      await addPracticeSection(song.id, {
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        description: desc,
      })
      setStart('')
      setEnd('')
      setEndTouched(false)
      setDescription('')
      setDone(true)
      window.dispatchEvent(new CustomEvent('practice-sections-updated', { detail: { songId: song.id } }))
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '연습 구간 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="record-empty">
        연습 구간 등록은 로그인이 필요합니다.<br/>
        <button className="btn btn-primary practice-login-btn" onClick={openLogin}>로그인하기</button>
      </div>
    )
  }

  return (
    <div className="record-form practice-form">
      <div className="practice-form-head">
        <div>
          <div className="practice-form-title">연습구간 등록</div>
          <div className="practice-form-sub">예: 0:48 ~ 1:26 / 폭타구간</div>
        </div>
      </div>
      <div className="practice-time-grid">
        <div className="rf-field">
          <label>시작 시간</label>
          <input value={start} onChange={e => handleStartChange(e.target.value)} placeholder="0:48" />
        </div>
        <div className="rf-field">
          <label>종료 시간</label>
          <input value={end} onChange={e => handleEndChange(e.target.value)} placeholder="1:26" />
        </div>
      </div>
      <div className="rf-field">
        <label>설명</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="폭타구간" />
      </div>
      <div className="practice-form-actions">
        {done && <span className="practice-done">등록 완료</span>}
        <button
          className="btn btn-primary"
          disabled={submitting || !start.trim() || !end.trim() || !description.trim()}
          onClick={handleSubmit}
        >
          {submitting ? '등록 중...' : '등록'}
        </button>
      </div>
    </div>
  )
}

export function usePracticeSectionCount(songId, enabled = true) {
  const [count, setCount] = useState(0)

  const load = () => {
    if (!enabled || !songId || isXyxMode()) {
      setCount(0)
      return
    }
    getPracticeSections(songId)
      .then(data => setCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setCount(0))
  }

  useEffect(() => {
    load()
  }, [songId, enabled])

  useEffect(() => {
    if (!enabled || !songId) return
    const handler = (event) => {
      if (Number(event.detail?.songId) === Number(songId)) load()
    }
    window.addEventListener('practice-sections-updated', handler)
    return () => window.removeEventListener('practice-sections-updated', handler)
  }, [songId, enabled])

  return count
}

export function UserPracticeSectionsTab({ song }) {
  const isAdmin = useStore(s => s.isAdmin)
  const [sections, setSections] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    getPracticeSections(song.id)
      .then(data => setSections(Array.isArray(data) ? data : []))
      .catch(() => setSections([]))
  }

  useEffect(() => {
    setSections(null)
    load()
  }, [song.id])

  useEffect(() => {
    const handler = (event) => {
      if (Number(event.detail?.songId) === Number(song.id)) load()
    }
    window.addEventListener('practice-sections-updated', handler)
    return () => window.removeEventListener('practice-sections-updated', handler)
  }, [song.id])

  const handleRecommend = async (section) => {
    try {
      const updated = await recommendPracticeSection(song.id, section.id)
      setSections(prev => (prev || []).map(x => x.id === updated.id ? updated : x))
      window.dispatchEvent(new CustomEvent('practice-sections-updated', { detail: { songId: song.id } }))
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '추천 연습 구간 등록에 실패했습니다.')
    }
  }

  const handleDelete = async (section) => {
    if (!confirm('이 연습 구간을 삭제할까요?')) return
    setDeletingId(section.id)
    try {
      await deletePracticeSection(song.id, section.id)
      setSections(prev => (prev || []).filter(x => x.id !== section.id))
      window.dispatchEvent(new CustomEvent('practice-sections-updated', { detail: { songId: song.id } }))
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '연습 구간 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  if (sections == null) {
    return <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중...</div>
  }

  if (sections.length === 0) {
    return <div className="record-empty">아직 등록된 연습 구간이 없습니다.</div>
  }

  return (
    <div className="practice-user-list">
      {sections.map(section => (
        <PracticeSectionLine
          key={section.id}
          section={section}
          action={(section.is_mine || isAdmin) ? (
            <div className="practice-section-actions">
              {isAdmin && !section.is_recommended && (
                <button className="btn btn-ghost practice-recommend-btn" onClick={() => handleRecommend(section)}>
                  추천 연습 구간으로 등록
                </button>
              )}
              {(section.is_mine || isAdmin) && (
                <button
                  className="btn btn-ghost practice-delete-btn"
                  disabled={deletingId === section.id}
                  onClick={() => handleDelete(section)}
                >
                  {deletingId === section.id ? '삭제 중...' : '삭제'}
                </button>
              )}
            </div>
          ) : null}
        />
      ))}
      <div className="practice-user-add">
        <PracticeSectionForm song={song} />
      </div>
    </div>
  )
}
