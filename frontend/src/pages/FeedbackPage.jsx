import { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../store/useStore'
import UserChip from '../components/UserChip'
import { listFeedback, listSongFeedback, createFeedback, voteFeedback } from '../api/client'
import { matchSong } from '../utils/helpers'
import { useMobile } from '../hooks/useMobile'
import FeedbackMobileHeader from '../components/feedback/FeedbackMobileHeader'
import FeedbackComposeSheet from '../components/feedback/FeedbackComposeSheet'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'
import PageNavigation from '../components/PageNavigation'

const BUG_TYPES = [
  { v: 'data',    label: '데이터 오류',         desc: 'BPM·콤보·시간이 실제와 다를 때',   icon: '📊' },
  { v: 'record_issue', label: '기록 문제',          desc: '잘못된 성과 등록·삭제 요청',       icon: '🏁' },
  { v: 'comment', label: '부적절 댓글/게시물',  desc: '신고하고 싶은 콘텐츠',             icon: '🗯' },
  { v: 'ui',      label: '화면/동작 이상',      desc: 'UI가 깨지거나 버튼이 안 눌릴 때',  icon: '🖥' },
  { v: 'login',   label: '로그인/계정',         desc: '소셜 로그인·세션 관련',            icon: '🔑' },
  { v: 'other',   label: '기타',                desc: '위 항목에 속하지 않는 문제',       icon: '❓' },
]

const FEATURE_TYPES = [
  { v: 'search',    label: '검색·필터',     desc: '새로운 정렬·필터 옵션',  icon: '🔍' },
  { v: 'record_stats',   label: '기록·통계',     desc: '기록 표시 방식 개선',    icon: '🏆' },
  { v: 'community', label: '커뮤니티',      desc: '게시판·댓글 기능',       icon: '💬' },
  { v: 'record',    label: '성과 등록',     desc: '기록 입력·인증 방식',    icon: '🎯' },
  { v: 'ux',        label: 'UX·디자인',     desc: '사용성 개선 제안',       icon: '🎨' },
  { v: 'other',     label: '기타 아이디어', desc: '자유로운 제안',          icon: '💡' },
]

const TYPE_LABEL = { ...Object.fromEntries(BUG_TYPES.map(t => [t.v, [t.label, t.icon]])),
                     ...Object.fromEntries(FEATURE_TYPES.map(t => [t.v, [t.label, t.icon]])) }
TYPE_LABEL.ranking = ['기록 문제', '🏁']
const STATUS_LABEL = { open: '접수', in_review: '검토 중', resolved: '해결됨', rejected: '거부됨' }
const SEVERITY_LABEL = { low: '낮음', med: '중간', high: '높음' }
const SONG_FEEDBACK_TYPE_LABEL = {
  bpm: 'BPM 오류',
  combo: '콤보 오류',
  time: '재생 시간 오류',
  record_delete: '잘못된 성과 삭제 요청',
  comment_delete: '부적절 댓글 삭제 요청',
}
const SONG_FEEDBACK_STATUS_LABEL = { received: '접수', processing: '처리 중', completed: '완료' }
const APP_STATUS_OPTIONS = [
  { v: 'all', label: '전체' },
  { v: 'open', label: '접수' },
  { v: 'in_review', label: '검토 중' },
  { v: 'resolved', label: '해결됨' },
]
const SONG_FEEDBACK_STATUS_OPTIONS = [
  { v: 'all', label: '전체' },
  { v: 'received', label: '접수' },
  { v: 'processing', label: '처리 중' },
  { v: 'completed', label: '완료' },
]

function fmtRel(at) {
  if (!at) return ''
  const d = (Date.now() - new Date(at).getTime()) / 1000
  if (d < 60) return '방금'
  if (d < 3600) return `${Math.floor(d / 60)}분 전`
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
  if (d < 2592000) return `${Math.floor(d / 86400)}일 전`
  const dt = new Date(at)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

function TypeGrid({ options, value, onChange }) {
  return (
    <div className="fb-type-grid">
      {options.map(opt => (
        <button
          key={opt.v}
          type="button"
          className={`fb-type-item${value === opt.v ? ' on' : ''}`}
          onClick={() => onChange(opt.v)}
          aria-pressed={value === opt.v}
        >
          <div className="fb-type-lbl">
            <span className="fb-type-ico">{opt.icon}</span>
            {opt.label}
          </div>
          <div className="fb-type-desc">{opt.desc}</div>
        </button>
      ))}
    </div>
  )
}

function ComposeCard({ tab, onSubmitted }) {
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

  useEffect(() => {
    setType(null); setTitle(''); setBody(''); setSeverity('med')
    setSongQuery(''); setPickedSong(null); setShowSuggest(false)
  }, [tab])

  useEffect(() => {
    const onClick = (e) => {
      if (songInputRef.current?.contains(e.target)) return
      if (suggestRef.current?.contains(e.target)) return
      setShowSuggest(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const suggestions = useMemo(() => {
    const q = songQuery.trim()
    if (!q) return []
    return songs.filter(s => matchSong(s, q)).slice(0, 6)
  }, [songQuery, songs])

  const isBug = tab === 'bug'
  const isValid = !!type && title.trim().length > 0 && body.trim().length > 0

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
      setType(null); setTitle(''); setBody(''); setSeverity('med')
      setSongQuery(''); setPickedSong(null); setShowSuggest(false)
      alert(isBug ? '버그 신고가 접수되었어요' : '제안이 등록되었어요')
    } catch (e) {
      alert(e?.response?.data?.detail || '제출에 실패했어요')
    } finally { setBusy(false) }
  }

  return (
    <div className="fb-card">
      <h2 className="fb-card-title">{isBug ? '새 버그 신고' : '새 기능 제안'}</h2>
      <p className="fb-card-desc">
        {isBug
          ? '발견한 문제를 자세히 알려주세요'
          : '좋은 아이디어를 제안해주세요!'}
      </p>

      <div className="fb-field-label">{isBug ? '유형' : '분야'}</div>
      <TypeGrid
        options={isBug ? BUG_TYPES : FEATURE_TYPES}
        value={type}
        onChange={setType}
      />

      <div className="fb-field" style={{ marginTop: 16 }}>
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
        <div className="fb-bug-extra">
          <div className="fb-field">
            <div className="fb-field-label">
              <span>관련 곡</span><span className="fb-muted">선택</span>
            </div>
            <input
              ref={songInputRef}
              type="text"
              className="fb-input"
              placeholder="검색어 입력, 검색어가 여러 개면 쉼표 사용 가능"
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
              <div ref={suggestRef} className="fb-song-suggest">
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
          <div className="fb-field">
            <div className="fb-field-label"><span>심각도</span></div>
            <select className="fb-select" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="low">낮음 — 사소한 불편</option>
              <option value="med">중간 — 일반적 사용에 영향</option>
              <option value="high">높음 — 사용 불가</option>
            </select>
          </div>
        </div>
      )}

      <div className="fb-field" style={{ marginTop: 14 }}>
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
          rows={5}
        />
      </div>

      <div className="fb-validity">
        <span className={type ? 'ok' : 'no'}>{type ? '✓' : '○'} 유형 선택 {type ? `(${type})` : ''}</span>
        <span className={title.trim().length > 0 ? 'ok' : 'no'}>
          {title.trim().length > 0 ? '✓' : '○'} 제목 ({title.trim().length}자)
        </span>
        <span className={body.trim().length > 0 ? 'ok' : 'no'}>
          {body.trim().length > 0 ? '✓' : '○'} 내용 ({body.trim().length}자)
        </span>
      </div>

      <div className="fb-actions">
        <button
          className="fb-btn ghost"
          onClick={() => {
            setType(null); setTitle(''); setBody(''); setSeverity('med')
            setSongQuery(''); setPickedSong(null)
          }}
        >
          초기화
        </button>
        {/* 비활성 상태에서도 사유 툴팁을 표시한다. */}
        <button
          type="button"
          className="fb-btn primary"
          aria-disabled={!isValid || busy}
          data-disabled={!isValid || busy ? 'true' : 'false'}
          onClick={() => { if (isValid && !busy) handleSubmit() }}
          title={
            busy ? '제출 중'
              : !type ? '유형을 먼저 선택해주세요'
              : !title.trim() ? '제목을 입력해주세요'
              : !body.trim() ? '상세 내용을 입력해주세요'
              : '피드백 제출'
          }
        >
          {busy ? '제출 중…' : '피드백 제출'}
        </button>
      </div>
    </div>
  )
}

function FeedbackItem({ item, onVote }) {
  const [t, ico] = TYPE_LABEL[item.type] || ['기타', '❓']
  const isBug = item.tab === 'bug'

  return (
    <article className="fb-item">
      <button
        className={`fb-vote${item.voted ? ' on' : ''}`}
        onClick={() => onVote(item)}
        title={item.voted ? '좋아요 취소' : '좋아요'}
      >
        <svg
          width="15" height="15" viewBox="0 0 24 24"
          fill={item.voted ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span className="mono">{item.votes}</span>
      </button>
      <div className="fb-main">
        <div className="fb-meta">
          <span className="fb-badge type">{ico} {t}</span>
          {isBug && (
            <span className={`fb-badge sev sev-${item.severity}`}>
              심각도 · {SEVERITY_LABEL[item.severity] || '중간'}
            </span>
          )}
          <span className={`fb-badge status ${item.status}`}>{STATUS_LABEL[item.status]}</span>
          {item.song_title && <span className="fb-badge song">🎵 {item.song_title}</span>}
        </div>
        <h4 className="fb-title">{item.title}</h4>
        <p className="fb-body">{item.body}</p>
        <div className="fb-foot">
          <span className="fb-muted">@{item.author}</span>
          <span className="fb-muted">·</span>
          <span className="fb-muted">{fmtRel(item.created_at)}</span>
          {item.is_mine && <span className="fb-mine-tag">내 글</span>}
        </div>
      </div>
    </article>
  )
}

function SongFeedbackItem({ item }) {
  const songTitle = item.song_name
    ? `${item.song_name} · ${item.artist || '아티스트 없음'}`
    : `삭제되었거나 찾을 수 없는 곡 #${item.song_id}`
  const anon = item.anon_id ? item.anon_id.slice(-8) : 'unknown'

  return (
    <article className="fb-item fb-song-feedback-item">
      <div className="fb-song-feedback-id mono">#{item.id}</div>
      <div className="fb-main">
        <div className="fb-meta">
          <span className="fb-badge type">{SONG_FEEDBACK_TYPE_LABEL[item.type] || item.type}</span>
          <span className={`fb-badge status ${item.status}`}>{SONG_FEEDBACK_STATUS_LABEL[item.status] || item.status}</span>
          <span className="fb-badge song">익명 {anon}</span>
        </div>
        <h4 className="fb-title">{songTitle}</h4>
        <div className="fb-song-feedback-sub mono">
          song_id {item.song_id}
          {item.level != null && <> · Lv {Number(item.level).toFixed(1)}</>}
        </div>
        <p className="fb-body">{item.body}</p>
        {item.admin_note && <p className="fb-body fb-admin-note">관리자 메모: {item.admin_note}</p>}
        <div className="fb-foot">
          <span className="fb-muted">{fmtRel(item.created_at)}</span>
          {item.resolved_at && (
            <>
              <span className="fb-muted">·</span>
              <span className="fb-muted">처리 {fmtRel(item.resolved_at)}</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export default function FeedbackPage() {
  const isMobile = useMobile()
  const { user, openLogin, isAdmin } = useStore()
  const [tab, setTab] = useState('bug')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const isSongFeedbackTab = tab === 'song_feedback'
  const statusOptions = isSongFeedbackTab ? SONG_FEEDBACK_STATUS_OPTIONS : APP_STATUS_OPTIONS

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    setStatusFilter('all')
    setSearch('')
  }

  const fetchList = async () => {
    if (isSongFeedbackTab && !isAdmin) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = isSongFeedbackTab
        ? await listSongFeedback({ status: statusFilter, q: search })
        : await listFeedback({ tab, status: statusFilter, q: search })
      setItems(data)
    } catch {
      setItems([])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (tab === 'song_feedback' && !isAdmin) handleTabChange('bug')
    // eslint-disable-next-line
  }, [tab, isAdmin])

  useEffect(() => { fetchList() /* eslint-disable-line */ }, [tab, statusFilter, isAdmin])

  useEffect(() => {
    const t = setTimeout(fetchList, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [search])

  const handleVote = async (item) => {
    if (!user) { openLogin(); return }
    try {
      const r = await voteFeedback(item.id)
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, voted: r.voted, votes: r.votes } : x))
    } catch (e) {
      alert(e?.response?.data?.detail || '공감 처리에 실패했어요')
    }
  }

  const handleSubmitted = (newItem) => {
    if (newItem.tab === tab) setItems(prev => [newItem, ...prev])
  }

  const counts = useMemo(() => {
    const all = { bug: 0, feature: 0 }
    for (const it of items) all[it.tab] = (all[it.tab] || 0) + 1
    return all
  }, [items])

  if (isMobile) {
    return (
      <div className="app-mobile">
        <FeedbackMobileHeader
          tab={tab}
          onTabChange={handleTabChange}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={isSongFeedbackTab ? '곡명 · 아티스트 · 내용 검색' : '제목 · 내용 검색'}
        />
        <div className="fb-mob-body">
          {!isSongFeedbackTab && (
            <button
              className="fb-mob-cta"
              onClick={() => { if (!user) { openLogin(); return } setComposeOpen(true) }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              {tab === 'bug' ? '버그 신고하기' : '기능 제안하기'}
            </button>
          )}

          <div className="fb-mob-status">
            {statusOptions.map(s => (
              <button
                key={s.v}
                className={`fb-mob-status-chip${statusFilter === s.v ? ' on' : ''}`}
                onClick={() => setStatusFilter(s.v)}
              >{s.label}</button>
            ))}
          </div>

          <div className="fb-mob-count mono">
            {items.length}건
          </div>

          {loading ? (
            <div className="mob-empty"><div className="mob-empty-icon">⏳</div>불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="mob-empty">
              <div className="mob-empty-icon">🪶</div>
              표시할 항목이 없어요
            </div>
          ) : (
            <div className="fb-mob-list">
              {items.map(item => (
                isSongFeedbackTab
                  ? <SongFeedbackItem key={item.id} item={item} />
                  : <FeedbackItem key={item.id} item={item} onVote={handleVote} />
              ))}
            </div>
          )}
        </div>

        {!isSongFeedbackTab && (
          <FeedbackComposeSheet
            open={composeOpen}
            tab={tab}
            onClose={() => setComposeOpen(false)}
            onSubmitted={handleSubmitted}
          />
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <ServerSwitcher />
        <PageNavigation />
      </aside>
      <main className="main">
        <div className="topbar">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>피드백</h2>
          <span style={{ color: 'var(--fg-3)', fontSize: 12, marginLeft: 4 }}>
            버그를 신고하거나 새로운 기능을 제안해주세요
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpButton />
            <UserChip />
          </div>
        </div>

        <div className="fb-page-body">
          <div className="fb-tabs">
            <button
              className={tab === 'bug' ? 'on' : ''}
              onClick={() => handleTabChange('bug')}
            >
              <span>🐞 버그 신고</span>
              {tab === 'bug' && <span className="fb-tab-ct mono">{items.length}</span>}
            </button>
            <button
              className={tab === 'feature' ? 'on' : ''}
              onClick={() => handleTabChange('feature')}
            >
              <span>✨ 기능 개선</span>
              {tab === 'feature' && <span className="fb-tab-ct mono">{items.length}</span>}
            </button>
            {isAdmin && (
              <button
                className={tab === 'song_feedback' ? 'on' : ''}
                onClick={() => handleTabChange('song_feedback')}
              >
                <span>음악별 피드백</span>
                {tab === 'song_feedback' && <span className="fb-tab-ct mono">{items.length}</span>}
              </button>
            )}
          </div>

          {!isSongFeedbackTab && <ComposeCard tab={tab} onSubmitted={handleSubmitted} />}

          <div className="fb-card" style={{ marginTop: isSongFeedbackTab ? 0 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h2 className="fb-card-title" style={{ marginBottom: 2 }}>
                  {isSongFeedbackTab ? '음악별 피드백' : tab === 'bug' ? '최근 신고된 버그' : '최근 제안된 기능'}{' '}
                  <span className="fb-muted mono" style={{ fontWeight: 400, fontSize: 12 }}>{items.length}건</span>
                </h2>
                <p className="fb-card-desc" style={{ margin: 0, fontSize: 11.5 }}>
                  {isSongFeedbackTab
                    ? '음악 카탈로그에서 제출된 곡별 문의를 확인합니다'
                    : '제출된 피드백은 운영팀이 검토 후 반영합니다'}
                </p>
              </div>
            </div>

            <div className="fb-filter-row">
              <div className="fb-seg">
                {statusOptions.map(s => (
                  <button
                    key={s.v}
                    className={statusFilter === s.v ? 'on' : ''}
                    onClick={() => setStatusFilter(s.v)}
                  >{s.label}</button>
                ))}
              </div>
              <input
                type="search"
                className="fb-input"
                style={{ maxWidth: 240, padding: '7px 12px' }}
                placeholder={isSongFeedbackTab ? '곡명·아티스트·내용 검색…' : '제목·내용 검색…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="fb-empty"><div className="fb-empty-icon">⏳</div>불러오는 중…</div>
            ) : items.length === 0 ? (
              <div className="fb-empty">
                <div className="fb-empty-icon">🪶</div>
                <h3>표시할 항목이 없어요</h3>
                <p>다른 상태를 선택하거나 검색어를 지워보세요.</p>
              </div>
            ) : (
              <div className="fb-list">
                {items.map(item => (
                  isSongFeedbackTab
                    ? <SongFeedbackItem key={item.id} item={item} />
                    : <FeedbackItem key={item.id} item={item} onVote={handleVote} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
