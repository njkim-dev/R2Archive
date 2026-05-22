import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import useStore from '../store/useStore'
import UserChip from '../components/UserChip'
import { listFeedback, createFeedback, voteFeedback } from '../api/client'
import { matchSong } from '../utils/helpers'
import { useMobile } from '../hooks/useMobile'
import FeedbackMobileHeader from '../components/feedback/FeedbackMobileHeader'
import FeedbackComposeSheet from '../components/feedback/FeedbackComposeSheet'

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

const TYPE_LABEL = { ...Object.fromEntries(BUG_TYPES.map(t => [t.v, [t.label, t.icon]])),
                     ...Object.fromEntries(FEATURE_TYPES.map(t => [t.v, [t.label, t.icon]])) }
const STATUS_LABEL = { open: '접수', in_review: '검토 중', resolved: '해결됨', rejected: '거부됨' }
const SEVERITY_LABEL = { low: '낮음', med: '중간', high: '높음' }

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

function SidebarBrand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <div>
        <div className="brand-title">알투비트 아카이브</div>
        <div className="brand-sub">Feedback · v1</div>
      </div>
    </div>
  )
}

function PageNav() {
  const { user, openLogin } = useStore()
  return (
    <div className="side-section" style={{ marginTop: 0 }}>
      <div className="side-label"><span>페이지</span></div>
      <div className="page-nav">
        <NavLink to="/" end className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>곡 목록</span></NavLink>
        <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>판정 랭킹</span></NavLink>
        <NavLink
          to="/groups"
          className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
          onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
        >
          <span>그룹</span>
        </NavLink>
        <NavLink
          to="/personal-categories"
          className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
          onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
        >
          <span>개인 카테고리</span>
        </NavLink>
        <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>과거 피망곡</span></NavLink>
        <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>피드백</span></NavLink>
      </div>
    </div>
  )
}

// ---------- Type radio grid ----------
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

// ---------- Compose card ----------
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

  // 탭 전환 시 상태 초기화
  useEffect(() => {
    setType(null); setTitle(''); setBody(''); setSeverity('med')
    setSongQuery(''); setPickedSong(null); setShowSuggest(false)
  }, [tab])

  // 외부 클릭 → suggest 닫기
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
    // 메인 페이지와 동일 매칭 정책 (공백 무시 + name + artist + aliases)
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
              placeholder="곡명·아티스트 검색…"
              value={songQuery}
              onChange={e => { setSongQuery(e.target.value); setPickedSong(null); setShowSuggest(true) }}
              onFocus={() => setShowSuggest(true)}
              onKeyDown={e => {
                // 곡이 선택된 상태에서 Backspace/Delete → 한 글자씩 지우지 말고 선택 자체를 취소.
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

      {/* 어떤 조건이 통과/미통과인지 표시 — 사용자가 비활성 사유를 즉시 확인할 수 있게 */}
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
        {/* native disabled 대신 aria-disabled — title 툴팁/이벤트가 안정적으로 동작 */}
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

// ---------- Item ----------
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
        {/* voted 상태면 채워진 하트, 아니면 윤곽선 하트 */}
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

// ---------- Page ----------
export default function FeedbackPage() {
  const isMobile = useMobile()
  const { user, openLogin } = useStore()
  const [tab, setTab] = useState('bug')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)

  const fetchList = async () => {
    setLoading(true)
    try {
      const data = await listFeedback({ tab, status: statusFilter, q: search })
      setItems(data)
    } catch {
      setItems([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchList() /* eslint-disable-line */ }, [tab, statusFilter])

  // 검색은 디바운스
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
          onTabChange={setTab}
          search={search}
          onSearchChange={setSearch}
        />
        <div className="fb-mob-body">
          <button
            className="fb-mob-cta"
            onClick={() => { if (!user) { openLogin(); return } setComposeOpen(true) }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            {tab === 'bug' ? '버그 신고하기' : '기능 제안하기'}
          </button>

          <div className="fb-mob-status">
            {[
              { v: 'all', label: '전체' },
              { v: 'open', label: '접수' },
              { v: 'in_review', label: '검토 중' },
              { v: 'resolved', label: '해결됨' },
            ].map(s => (
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
                <FeedbackItem key={item.id} item={item} onVote={handleVote} />
              ))}
            </div>
          )}
        </div>

        <FeedbackComposeSheet
          open={composeOpen}
          tab={tab}
          onClose={() => setComposeOpen(false)}
          onSubmitted={handleSubmitted}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <SidebarBrand />
        <PageNav />
      </aside>
      <main className="main">
        <div className="topbar">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>피드백</h2>
          <span style={{ color: 'var(--fg-3)', fontSize: 12, marginLeft: 4 }}>
            버그를 신고하거나 새로운 기능을 제안해주세요
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserChip />
          </div>
        </div>

        <div className="fb-page-body">
          <div className="fb-tabs">
            <button
              className={tab === 'bug' ? 'on' : ''}
              onClick={() => setTab('bug')}
            >
              <span>🐞 버그 신고</span>
              {tab === 'bug' && <span className="fb-tab-ct mono">{items.length}</span>}
            </button>
            <button
              className={tab === 'feature' ? 'on' : ''}
              onClick={() => setTab('feature')}
            >
              <span>✨ 기능 개선</span>
              {tab === 'feature' && <span className="fb-tab-ct mono">{items.length}</span>}
            </button>
          </div>

          <ComposeCard tab={tab} onSubmitted={handleSubmitted} />

          <div className="fb-card" style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h2 className="fb-card-title" style={{ marginBottom: 2 }}>
                  {tab === 'bug' ? '최근 신고된 버그' : '최근 제안된 기능'}{' '}
                  <span className="fb-muted mono" style={{ fontWeight: 400, fontSize: 12 }}>{items.length}건</span>
                </h2>
                <p className="fb-card-desc" style={{ margin: 0, fontSize: 11.5 }}>
                  제출된 피드백은 운영팀이 검토 후 반영합니다
                </p>
              </div>
            </div>

            <div className="fb-filter-row">
              <div className="fb-seg">
                {[
                  { v: 'all', label: '전체' },
                  { v: 'open', label: '접수' },
                  { v: 'in_review', label: '검토 중' },
                  { v: 'resolved', label: '해결됨' },
                ].map(s => (
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
                placeholder="제목·내용 검색…"
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
                  <FeedbackItem key={item.id} item={item} onVote={handleVote} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
