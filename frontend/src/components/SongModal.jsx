import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Check, ExternalLink, Layers } from 'lucide-react'
import useStore from '../store/useStore'
import { getComments, addComment, getPerceivedStats, submitPerceived, updatePerceived, logPlay, getPlayVideos, addPlayVideo, getSong, getSongPersonalCategories, getRecommendedPracticeSections, getMyPracticeSections, getPracticeSections, addPracticeSection, recommendPracticeSection, deletePracticeSection, trackSongCatalogView } from '../api/client'
import { artworkBg, fmt, fmtBpm, getAnonId, staticUrl } from '../utils/helpers'
import { useMobile } from '../hooks/useMobile'
import PersonalCategoryPicker from './PersonalCategoryPicker'
import { isXyxMode, SERVER_LINKS } from '../utils/serverMode'
import { songCatalogUrl } from '../utils/catalogUrl'

const COMBO_WARNING_TEXT = '공방에서 해당 노래 올콤하면 튕기는 버그가 있으니 주의하세요.'
const BPM_TIMELINE_VIEW_KEY = 'r2b_bpm_timeline_view'

function originalBpmText(song, detail) {
  const value = detail?.real_bpm ?? song?.real_bpm
  return value != null ? fmtBpm(value) : '-'
}

function readBpmTimelineView() {
  if (typeof window === 'undefined') return 'graph'
  try {
    return window.localStorage.getItem(BPM_TIMELINE_VIEW_KEY) === 'table' ? 'table' : 'graph'
  } catch {
    return 'graph'
  }
}

function saveBpmTimelineView(view) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BPM_TIMELINE_VIEW_KEY, view)
  } catch {
    // localStorage가 막힌 환경에서는 기본 그래프 보기만 유지한다.
  }
}

function formatBpmTimelineTime(s) {
  if (s === 0) return '시작'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}분 ${sec}초` : `${sec}초`
}

function formatBpmDelta(delta) {
  const abs = Math.abs(delta)
  const value = abs % 1 === 0 ? abs : abs.toFixed(1)
  return delta > 0 ? `+${value}` : `-${value}`
}

function BpmGraph({ timeline, songTime }) {
  const tooltipRef = useRef(null)
  if (!timeline || timeline.length === 0) return null

  const W = 820, H = 105
  const pad = { l: 28, r: 10, t: 8, b: 20 }
  const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b
  const bpms = timeline.map(p => p.bpm)
  const mn = Math.floor(Math.min(...bpms) / 20) * 20 - 10
  const mx = Math.ceil(Math.max(...bpms) / 20) * 20 + 10
  const range = Math.max(1, mx - mn)

  const parseDuration = t => {
    if (!t) return 0
    const [m, s] = t.split(':').map(Number)
    return m * 60 + (s || 0)
  }
  const duration = Math.max(parseDuration(songTime), timeline[timeline.length - 1]?.time || 1)
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const changeTimes = timeline.slice(1).map(p => p.time)
  const firstChange = changeTimes[0] ?? 0
  const lastChange = changeTimes[changeTimes.length - 1] ?? duration
  const changeSpan = lastChange - firstChange
  const isDense = changeTimes.length > 2 && changeSpan < duration * 0.15

  const viewPad = changeSpan * 0.6
  const viewStart = isDense ? Math.max(0, firstChange - viewPad) : 0
  const viewEnd   = isDense ? Math.min(duration, lastChange + viewPad) : duration
  const viewDuration = Math.max(1, viewEnd - viewStart)

  const tx = t => pad.l + ((t - viewStart) / viewDuration) * gw
  const ty = bpm => pad.t + (1 - (bpm - mn) / range) * gh

  const yTicks = [mn, Math.round((mn + mx) / 2), mx]

  const handleDotHover = (e, pt, prev) => {
    const tip = tooltipRef.current
    if (!tip || !pt) { tip && tip.classList.remove('show'); return }
    const delta = (pt.bpm - prev.bpm).toFixed(1)
    const dir = pt.bpm > prev.bpm ? '▲' : pt.bpm < prev.bpm ? '▼' : '•'
    const mono = "'JetBrains Mono',monospace"
    tip.textContent = ''
    const row1 = document.createElement('div')
    row1.style.cssText = `font-family:${mono};font-size:10.5px;color:var(--fg-4)`
    row1.textContent = fmtT(pt.time)
    const row2 = document.createElement('div')
    row2.style.cssText = 'display:flex;align-items:baseline;gap:6px'
    const bpmEl = document.createElement('b')
    bpmEl.style.cssText = `font-family:${mono};font-size:15px;color:var(--fg)`
    bpmEl.textContent = pt.bpm.toFixed(1)
    const unitEl = document.createElement('span')
    unitEl.style.cssText = 'font-size:10px;color:var(--fg-4)'
    unitEl.textContent = 'BPM'
    row2.append(bpmEl, unitEl)
    if (Math.abs(pt.bpm - prev.bpm) > (mx - mn) * 0.25) {
      const badge = document.createElement('span')
      badge.style.cssText = 'font-size:9.5px;padding:1px 6px;border-radius:999px;background:var(--accent-dim);color:var(--accent)'
      badge.textContent = '변속'
      row2.appendChild(badge)
    }
    const row3 = document.createElement('div')
    row3.style.cssText = `font-family:${mono};font-size:10.5px;color:var(--fg-4);margin-top:3px`
    row3.textContent = `${dir} ${Number(delta) >= 0 ? '+' : ''}${delta} (이전 ${prev.bpm.toFixed(1)})`
    tip.append(row1, row2, row3)
    const rect = e.currentTarget.closest('.bpm-graph').getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    tip.style.left = Math.min(rect.width - 140, Math.max(8, x + 12)) + 'px'
    tip.style.top = Math.max(8, y - 58) + 'px'
    tip.classList.add('show')
  }

  return (
    <div className="bpm-graph" onMouseLeave={() => tooltipRef.current?.classList.remove('show')}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {yTicks.map(v => {
          const y = pad.t + (1 - (v - mn) / range) * gh
          return (
            <g key={v}>
              <line className="grid-line" x1={pad.l} y1={y} x2={W - pad.r} y2={y}
                stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="2 3"/>
              <text x={pad.l - 4} y={y + 3} textAnchor="end"
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: 'var(--fg-4)' }}>{v}</text>
            </g>
          )
        })}
        {timeline.map((pt, i) => {
          const prev = timeline[i - 1]
          return (
            <circle key={i} cx={tx(pt.time)} cy={ty(pt.bpm)} r={5}
              fill="var(--accent)" opacity="0.9"
              style={{ cursor: i > 0 ? 'pointer' : 'default' }}
              onMouseEnter={i > 0 ? e => handleDotHover(e, pt, prev) : undefined}
            />
          )
        })}
        <text x={pad.l} y={H - 6} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fill: 'var(--fg-3)' }}>{fmtT(viewStart)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fill: 'var(--fg-3)' }}>{fmtT(viewEnd)}</text>
        {isDense && (
          <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: 'var(--accent)', opacity: 0.7 }}>
            ← 구간 확대 보기 →
          </text>
        )}
      </svg>
      <div className="bpm-tooltip" ref={tooltipRef} aria-hidden="true" />
    </div>
  )
}

function BpmTimelineTable({ timeline, compact = false }) {
  if (!timeline?.length) return null

  const rootClass = compact ? 'mob-bpm-list' : 'bpm-table'
  const rowClass = compact ? 'mob-bpm-entry' : 'bpm-table-entry'
  const timeClass = compact ? 'mob-bpm-time' : 'bpm-table-time'
  const sepClass = compact ? 'mob-bpm-sep' : 'bpm-table-sep'
  const valClass = compact ? 'mob-bpm-val' : 'bpm-table-val'
  const deltaClass = compact ? 'mob-bpm-delta' : 'bpm-table-delta'

  return (
    <div className={rootClass}>
      {timeline.map((pt, i) => {
        const prev = timeline[i - 1]
        const delta = prev ? pt.bpm - prev.bpm : null
        return (
          <div key={`${pt.time}-${pt.bpm}-${i}`} className={rowClass}>
            <span className={timeClass}>{formatBpmTimelineTime(pt.time)}</span>
            <span className={sepClass}>:</span>
            <span className={valClass}>{fmtBpm(pt.bpm)}</span>
            {delta != null && delta !== 0 && (
              <span className={deltaClass} style={{ color: delta > 0 ? 'oklch(0.75 0.18 25)' : 'var(--ok)' }}>
                {formatBpmDelta(delta)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BpmTimelineSection({ timeline, songTime }) {
  const [view, setView] = useState(readBpmTimelineView)
  if (!timeline?.length) return null

  const bpms = timeline.map(p => p.bpm)
  const isChange = timeline.length > 1
  const minBpm = Math.min(...bpms)
  const maxBpm = Math.max(...bpms)
  const handleView = (next) => {
    setView(next)
    saveBpmTimelineView(next)
  }

  return (
    <div className="bpm-timeline-section">
      <div className="bpm-head">
        <div className="bpm-head-main">
          <h5>BPM 변속 타임라인</h5>
          <span className="bpm-range">
            {isChange
              ? <>범위 <b>{minBpm.toFixed(1)} – {maxBpm.toFixed(1)}</b></>
              : <>고정 <b>{bpms[0].toFixed(1)}</b></>
            }
          </span>
        </div>
        <div className="bpm-view-toggle" role="group" aria-label="BPM 변속 타임라인 보기 방식">
          <button
            type="button"
            className={view === 'graph' ? 'active' : ''}
            onClick={() => handleView('graph')}
          >
            그래프로 보기
          </button>
          <button
            type="button"
            className={view === 'table' ? 'active' : ''}
            onClick={() => handleView('table')}
          >
            테이블로 보기
          </button>
        </div>
      </div>
      {view === 'table'
        ? <BpmTimelineTable timeline={timeline} />
        : <BpmGraph timeline={timeline} songTime={songTime} />}
    </div>
  )
}

function PerceivedSection({ song }) {
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [opinion, setOpinion] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const updateSongPerceived = useStore(s => s.updateSongPerceived)
  const user = useStore(s => s.user)
  const anonId = getAnonId()
  // 로그인 사용자는 stats GET에서 anon_id를 보내지 않는다 (URL/로그 노출 방지).
  // 본인 식별은 서버가 세션 user_id로 처리.
  const statsAnonId = user ? '' : anonId

  useEffect(() => {
    setSubmitted(false)
    getPerceivedStats(song.id, statsAnonId).then(data => {
      setStats(data)
      setSelected(data.my_vote ? data.my_vote.level : null)
      setOpinion('')
    })
  }, [song.id, user?.id])

  const allSteps = []
  for (let v = 0.5; v <= 12.0 + 1e-9; v += 0.5) allSteps.push(+v.toFixed(1))

  const bins = stats?.bins ?? new Array(24).fill(0)
  const maxBin = Math.max(...bins, 1)
  const officialBin = Math.round((song.level - 0.5) * 2)

  const handleSubmit = async () => {
    if (selected == null) return
    // 로그인 사용자도 anon_id는 함께 전송 — 서버가 과거 익명 투표 행을 본인 계정으로 승계할 때 사용.
    // POST/PUT body는 access log에 남지 않으므로 stats GET과 달리 노출 우려 없음.
    const payload = { anon_id: anonId, level: selected, opinion: opinion || null }
    try {
      if (stats?.my_vote) {
        await updatePerceived(song.id, payload)
      } else {
        await submitPerceived(song.id, payload)
      }
      const fresh = await getPerceivedStats(song.id, statsAnonId)
      setStats(fresh)
      setSubmitted(true)
      updateSongPerceived(song.id, fresh.avg ?? null, fresh.total_votes ?? 0)
    } catch (_) {
    }
  }

  const diff = selected != null ? selected - song.level : null

  return (
    <div className="perceived">
      <div className="perceived-head">
        <h5>유저 체감 레벨</h5>
        <span className="sub">
          표기: LV {song.level.toFixed(1)} · 투표{' '}
          <b style={{ color: 'var(--fg-3)' }}>{stats?.total_votes ?? 0}</b>명
        </span>
      </div>

      <div className="perceived-row">
        <div className="perceived-avg">
          <div className="big">{stats?.avg != null ? stats.avg.toFixed(1) : '—'}</div>
          <div className="lbl">체감 평균</div>
          {stats?.avg != null && (
            <div className="n">
              {(stats.avg - song.level) >= 0 ? '+' : ''}{(stats.avg - song.level).toFixed(2)} vs 표기
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="perceived-dist">
            {bins.map((v, i) => (
              <div
                key={i}
                className={`perceived-bar${i === officialBin ? ' highlight' : ''}`}
                style={{ height: `${maxBin ? (v / maxBin * 100) : 0}%` }}
                title={`LV ${(0.5 + i * 0.5).toFixed(1)} — ${v}표`}
              />
            ))}
          </div>
          <div className="perceived-scale">
            <span>0.5</span><span>3.0</span><span>6.0</span><span>9.0</span><span>12.0</span>
          </div>
        </div>
      </div>

      <div className="perceived-notice">
        여러분의 데이터로 많은 사람들의 게임 환경을 개선합니다.<br/>
        부적절한 체감 난이도는 삭제됩니다.
      </div>

      <div className="perceived-form-block">
        <div style={{ fontSize: 11.5, color: 'var(--fg-3)', fontWeight: 500, marginBottom: 8 }}>
          내 체감 난이도를 선택해주세요
        </div>
        <div className="perceived-steps">
          {allSteps.map(v => (
            <button
              key={v}
              className={`perceived-step${v === song.level ? ' is-official' : ''}${selected === v ? ' on' : ''}`}
              onClick={() => !submitted && setSelected(v)}
              title={v === song.level ? '표기 난이도' : ''}
            >
              {v.toFixed(1)}
            </button>
          ))}
        </div>

        {selected != null && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: diff > 0.3 ? 'oklch(0.75 0.18 25)' : diff < -0.3 ? 'var(--ok)' : 'var(--fg-4)' }}>
            공식 {song.level.toFixed(1)} → 내 체감 {selected.toFixed(1)} ({diff >= 0 ? '+' : ''}{diff?.toFixed(1)})
          </div>
        )}

        {!submitted && (
          <>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 6 }}>간단한 의견</div>
              <textarea
                value={opinion}
                onChange={e => setOpinion(e.target.value)}
                placeholder="간단한 의견을 작성해주세요 (선택)"
                rows={2}
                style={{
                  width: '100%', background: 'var(--surface-1)', border: '1px solid var(--line-soft)',
                  borderRadius: 8, padding: '8px 10px', color: 'var(--fg)', fontSize: 12.5,
                  fontFamily: 'inherit', resize: 'vertical', minHeight: 48, outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px' }}
                disabled={selected == null}
                onClick={handleSubmit}
              >
                등록
              </button>
            </div>
          </>
        )}
        {submitted && (
          <div style={{ marginTop: 12, color: 'var(--ok)', fontSize: 12.5 }}>등록됨 ✓</div>
        )}
      </div>
    </div>
  )
}

function RecordsTab({ song }) {
  const user = useStore(s => s.user)
  const [records, setRecords] = useState(null)
  const [url, setUrl] = useState('')
  const [ytTitle, setYtTitle] = useState(null)
  const [ytLoading, setYtLoading] = useState(false)
  // 로그인 상태면 회원 닉네임을 자동 사용 — 입력 필드는 숨김.
  const [nick, setNick] = useState(user?.nickname || '')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const anonId = getAnonId()

  // user 변경(로그인/로그아웃 등)에 nick state 동기화.
  useEffect(() => { setNick(user?.nickname || '') }, [user?.id, user?.nickname])

  useEffect(() => {
    // 본 게임 플레이 영상은 achievements 테이블에서 조회.
    getPlayVideos(song.id).then(setRecords)
  }, [song.id])

  // 서버(_extract_video_id)와 동일한 엄격도: 11자 비디오 ID만 허용
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
    // 로그인 사용자는 회원 닉네임 자동 사용. nick state는 useState/useEffect로
    // user.nickname을 따라가지만, submit 시점에 직접 user.nickname을 읽어
    // 초기 렌더 직후 race나 동기화 누락을 우회한다.
    const effectiveNickname = (user?.nickname || nick || '').trim()
    if (!effectiveNickname || !url.trim()) return
    setSubmitting(true)
    try {
      // 플레이 영상은 achievements 테이블 (records와 분리). 백엔드 라우터 별도.
      // achievements 스키마는 description 컬럼만 가짐(memo 컬럼 없음) — body 키도 description로 매핑.
      await addPlayVideo(song.id, {
        nickname: effectiveNickname,
        youtube_url: url,
        description: memo || null,
      })
      const fresh = await getPlayVideos(song.id)
      setRecords(fresh)
      setDone(true); setUrl(''); setYtTitle(null); setMemo('')
    } catch (e) {
      // 422 응답이면 백엔드 detail 메시지 그대로 표시 (예: "비공개 영상은 등록할 수 없습니다.")
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
            {ytLoading && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-4)' }}>제목 조회 중…</div>
            )}
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

function CommentsTab({ song }) {
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

function MobileBpmTimeline({ timeline }) {
  return (
    <div className="mob-section">
      <div className="mob-section-title">BPM 변속 타임라인</div>
      <BpmTimelineTable timeline={timeline} compact />
    </div>
  )
}

function MobileDetail({ song, detail, onClose, difficultyVariants = [], onDifficultySelect }) {
  const [tab, setTab] = useState('overview')
  const [scrolled, setScrolled] = useState(false)
  const [perceivedStats, setPerceivedStats] = useState(null)
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const bodyRef = useRef(null)
  const anonId = getAnonId()
  const user = useStore(s => s.user)
  const favorites = useStore(s => s.favorites)
  const toggleFavorite = useStore(s => s.toggleFavorite)
  const isFav = favorites?.has(song.id)
  const xyxMode = isXyxMode()
  const practiceSectionCount = usePracticeSectionCount(song.id, !xyxMode)
  const counterpartUrl = getCounterpartUrl(song.counterpart)
  const counterpartLabel = getCounterpartLabel(song.counterpart)

  const cat = song.level >= 7 ? 'sun' : song.level >= 4 ? 'moon' : 'star'
  const catLabel = { star: '별 (1.5–3.5)', moon: '달 (4–6.5)', sun: '해 (7–12)' }[cat]
  const linkedName = song.korea_name
    ? { label: '한국 곡명', value: song.korea_name }
    : song.xyx_name
    ? { label: '중국 곡명', value: song.xyx_name }
    : null

  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  useEffect(() => {
    // 로그인 사용자는 anon_id를 쿼리에 싣지 않음 (로그 노출 방지).
    getPerceivedStats(song.id, user ? '' : anonId).then(setPerceivedStats)
  }, [song.id, user?.id])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const handler = () => setScrolled(el.scrollTop > 60)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    setDifficultyOpen(false)
    setTab('overview')
    bodyRef.current?.scrollTo({ top: 0 })
  }, [song.id])

  useEffect(() => {
    if (tab === 'practice-user' && practiceSectionCount === 0) setTab('overview')
  }, [tab, practiceSectionCount])

  const handlePlay = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
  }

  const hasDifficultyVariants = difficultyVariants.length > 0
  const handleDifficultySelect = (targetSong) => {
    setDifficultyOpen(false)
    onDifficultySelect?.(targetSong)
  }

  return (
    <div ref={bodyRef} className="mob-detail-body">
      <div className={`mob-detail-top${scrolled ? ' scrolled' : ''}`}>
        <button className="mob-icon-btn" onClick={onClose} aria-label="뒤로">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="mob-detail-top-title">{song.name}</div>
        <button className="mob-icon-btn" onClick={() => {
          const url = songCatalogUrl(song.id)
          navigator.clipboard?.writeText(url)
        }} aria-label="링크 복사">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
          </svg>
        </button>
      </div>

      <div className="mob-hero">
        <div className="mob-hero-art" style={{ background: artworkBg(song.id) }}>
          {song.image
            ? <img
                src={staticUrl(song.image)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            : <span className="mob-hero-init">{initials}</span>
          }
        </div>
        <h1 className="mob-hero-title">{song.name}</h1>
        {linkedName && (
          <div className="mob-hero-linked-name">{linkedName.label} : {linkedName.value}</div>
        )}
        <div className="mob-hero-sub">{song.artist}{song.chapter ? ` · ${song.chapter}` : ''}</div>
        <div className="mob-hero-tags">
          <span className="mob-h-tag mob-h-tag-accent">LV {song.level.toFixed(1)}</span>
          {perceivedStats?.avg != null && (
            <span className="mob-h-tag" style={{ color: 'var(--fg-2)' }}>
              체감 {perceivedStats.avg.toFixed(1)}
            </span>
          )}
          {song.is_change && <span className="mob-h-tag">변속</span>}
          {song.is_new && <span className="mob-h-tag mob-h-tag-new">NEW</span>}
          <span className="mob-h-tag">{fmtBpm(song.bpm)} BPM</span>
          <span className="mob-h-tag">{song.time}</span>
        </div>
      </div>

      <div className="mob-actions">
        <button
          className="mob-act-btn mob-act-primary"
          onClick={handlePlay}
          disabled={!song.youtube_url}
          style={!song.youtube_url ? { opacity: 0.4 } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          음악 듣기
        </button>
        <button
          className="mob-act-btn mob-act-ghost"
          disabled={!user}
          style={!user ? { opacity: 0.4 } : (isFav ? { color: 'var(--accent, #ff6b9d)' } : {})}
          title={user ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 이용 가능'}
          onClick={() => { if (user) toggleFavorite(song.id) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
          </svg>
          즐겨찾기
        </button>
        <PersonalCategoryPicker
          songId={song.id}
          className="mob-act-btn mob-act-ghost pcat-mobile-action"
        />
        {counterpartUrl && (
          <button
            className="mob-act-btn mob-act-ghost pcat-mobile-action"
            onClick={() => navigateToCounterpart(counterpartUrl)}
          >
            <ExternalLink size={15} />
            {counterpartLabel}
          </button>
        )}
        <button
          className="mob-act-btn mob-act-ghost mob-difficulty-action"
          disabled={!hasDifficultyVariants}
          style={!hasDifficultyVariants ? { opacity: 0.4 } : undefined}
          title={hasDifficultyVariants ? '동일한 음악의 다른 난이도 보기' : '다른 난이도가 없습니다'}
          onClick={() => { if (hasDifficultyVariants) setDifficultyOpen(true) }}
        >
          <Layers size={15} strokeWidth={2.4} />
          다른 난이도로 이동
        </button>
      </div>

      {difficultyOpen && (
        <div className="mob-difficulty-backdrop" onClick={() => setDifficultyOpen(false)}>
          <div className="mob-difficulty-sheet" onClick={e => e.stopPropagation()}>
            <div className="mob-difficulty-head">
              <div>
                <b>다른 난이도로 이동</b>
                <span>{difficultyVariants.length}개</span>
              </div>
              <button type="button" onClick={() => setDifficultyOpen(false)} aria-label="닫기">닫기</button>
            </div>
            <div className="mob-difficulty-list">
              {difficultyVariants.map(variant => (
                <button
                  key={variant.id}
                  type="button"
                  className="mob-difficulty-row"
                  data-cat={catFromLevel(variant.level)}
                  onClick={() => handleDifficultySelect(variant)}
                >
                  <span className="mob-difficulty-info">
                    <span className="mob-difficulty-name">{variant.name}</span>
                    <span className="mob-difficulty-meta">
                    {fmtBpm(variant.bpm)} BPM · {fmt(variant.combo)} 콤보
                    </span>
                  </span>
                  <span className="mob-difficulty-level">LV {Number(variant.level).toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mob-stats">
        {[
          { lbl: '난이도', val: song.level?.toFixed(1), cat },
          { lbl: '게임 BPM', val: song.bpm?.toFixed(1) },
          { lbl: '콤보', val: fmt(song.combo) },
          { lbl: '시간', val: song.time },
        ].map(({ lbl, val, cat: c }) => (
          <div key={lbl} className="mob-stat">
            <div className="mob-stat-val" data-cat={c}>{val}</div>
            <div className="mob-stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>
      {song.combo_warning && (
        <div className="mob-combo-warning">
          {COMBO_WARNING_TEXT}
        </div>
      )}

      <div className="mob-tabs">
        {[
          { key: 'overview', label: '개요' },
          { key: 'records',  label: '플레이 영상' },
          ...(!xyxMode ? [
            { key: 'practice-new', label: '연습구간 등록' },
            ...(practiceSectionCount > 0 ? [{ key: 'practice-user', label: '유저 연습 구간' }] : []),
          ] : []),
          { key: 'comments', label: '댓글' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`mob-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mob-tab-body">
        {tab === 'overview' && (
          <>
            {detail?.is_change && detail?.bpm_timeline?.length > 0 && (
              <MobileBpmTimeline timeline={detail.bpm_timeline} />
            )}
            <PerceivedSection song={song} />
              <div className="mob-section">
              <div className="mob-section-title">메타 정보</div>
              <div className="mob-meta-grid">
                {[
                  { lbl: 'ID', val: song.id },
                  { lbl: '카테고리', val: catLabel },
                  { lbl: '음악 원 BPM', val: originalBpmText(song, detail) },
                  { lbl: '콤보', val: fmt(song.combo) },
                  { lbl: '변속', val: song.is_change ? '있음' : '없음' },
                  { lbl: '재생 수', val: `${(detail?.play_count ?? song.play_count ?? 0).toLocaleString()}회` },
                ].map(({ lbl, val }) => (
                  <div key={lbl} className="mob-meta-row">
                    <span className="mob-meta-lbl">{lbl}</span>
                    <span className="mob-meta-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'records' && <RecordsTab song={song} />}
        {!xyxMode && tab === 'practice-new' && <PracticeSectionForm song={song} />}
        {!xyxMode && practiceSectionCount > 0 && tab === 'practice-user' && <UserPracticeSectionsTab song={song} />}
        {tab === 'comments' && <CommentsTab song={song} />}
      </div>
    </div>
  )
}

// 모달의 카테고리 색상은 곡 자체의 난이도로 결정 (별=Lv 1.5~3.5, 달=Lv 4~6.5, 해=Lv 7+).
// MobileCard 등 다른 곳과 동일한 분기.
function catFromLevel(lv) {
  if (lv >= 7) return 'sun'
  if (lv >= 4) return 'moon'
  return 'star'
}

function getCounterpartUrl(counterpart) {
  if (!counterpart?.id || !counterpart?.server) return null
  const base = SERVER_LINKS[counterpart.server]
  if (!base) return null
  const path = counterpart.is_removed ? '/removed-songs' : '/'
  return `${base}${path}#song=${counterpart.id}`
}

function getCounterpartLabel(counterpart) {
  if (counterpart?.server === 'kr') return '한국 서버로 이동'
  if (counterpart?.server === 'xyx') return '중국 서버로 이동'
  return '다른 서버로 이동'
}

function navigateToCounterpart(url) {
  window.location.href = url
}

function normalizeSongIdentity(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase()
}

function isDifficultyVariantOf(a, b) {
  if (!a || !b || a.id === b.id) return false
  const aGroup = Number(a.same_music_group_id || 0)
  const bGroup = Number(b.same_music_group_id || 0)
  if (aGroup > 0 && aGroup === bGroup) return true

  const sameArtist = normalizeSongIdentity(a.artist) === normalizeSongIdentity(b.artist)
  const sameTitle = normalizeSongIdentity(a.name) === normalizeSongIdentity(b.name)
  const levelDiffers = Math.abs(Number(a.level) - Number(b.level)) > 1e-9
  return sameTitle && sameArtist && levelDiffers
}

function SavedCategoryTags({ song, onOpenCategory }) {
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

function PracticeSectionsSummary({ song }) {
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

function PracticeSectionForm({ song }) {
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

function usePracticeSectionCount(songId, enabled = true) {
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

function UserPracticeSectionsTab({ song }) {
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

export default function SongModal() {
  const xyxMode = isXyxMode()
  const isMobile = useMobile(xyxMode ? 1100 : 768)
  const navigate = useNavigate()
  // SongModal은 App.jsx 루트에서 <Routes> 바깥에 렌더링되어 페이지의 [data-cat] cascade를
  // 받지 못한다. 그래서 모달 자체에 data-cat을 직접 부여한다 — 단, 페이지 필터가 아니라
  // 열려 있는 곡의 난이도 기반으로 결정해 매 곡마다 색이 자연스럽게 바뀌도록 한다.
  const { modalOpen, modalSong, closeModal, openModal, openFeedback, user, favorites, toggleFavorite, songs } = useStore()
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePos, setMorePos] = useState({ top: 0, right: 0 })
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const [difficultyPos, setDifficultyPos] = useState({ top: 0, left: 0 })
  const [copied, setCopied] = useState(false)
  const difficultyBtnRef = useRef(null)
  const difficultyMenuRef = useRef(null)
  const moreBtnRef = useRef(null)
  const moreMenuRef = useRef(null)
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [show, setShow] = useState(false)
  const currentSong = useMemo(() => {
    if (!detail) return modalSong
    return {
      ...modalSong,
      ...detail,
      korea_name: detail.korea_name || modalSong?.korea_name || '',
      xyx_name: detail.xyx_name || modalSong?.xyx_name || '',
    }
  }, [detail, modalSong])
  const difficultyVariants = useMemo(() => {
    if (!currentSong || !Array.isArray(songs)) return []
    return songs
      .filter(s => isDifficultyVariantOf(s, currentSong))
      .sort((a, b) =>
        Number(a.level) - Number(b.level) ||
        Number(a.combo || 0) - Number(b.combo || 0) ||
        Number(a.id) - Number(b.id)
      )
  }, [songs, currentSong?.id, currentSong?.name, currentSong?.artist, currentSong?.level, currentSong?.same_music_group_id])
  const practiceSectionCount = usePracticeSectionCount(currentSong?.id, modalOpen && !xyxMode)

  useEffect(() => {
    if (!modalOpen || !modalSong) { setDetail(null); setTab('overview'); return }
    getSong(modalSong.id).then(setDetail)
  }, [modalOpen, modalSong?.id])

  useEffect(() => {
    if (!modalOpen || !modalSong?.id) return
    trackSongCatalogView({
      server: xyxMode ? 'xyx' : 'kr',
      song_id: modalSong.id,
    })
  }, [modalOpen, modalSong?.id, xyxMode])

  useEffect(() => {
    if (tab === 'practice-user' && practiceSectionCount === 0) setTab('overview')
  }, [tab, practiceSectionCount])

  useEffect(() => {
    if (!modalOpen) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalOpen, closeModal])

  useLayoutEffect(() => {
    if (!modalOpen) return undefined
    const triggerSongId = modalSong?.id
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const selector = isMobile ? '.mob-detail-back' : '.m-close'
      panelRef.current?.querySelector(selector)?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      const songRow = triggerSongId ? document.querySelector(`[data-song-id="${triggerSongId}"]`) : null
      if (songRow instanceof HTMLElement) {
        songRow.dataset.restoredFocus = 'true'
        const clearRestoredFocus = (event) => {
          delete songRow.dataset.restoredFocus
          songRow.removeEventListener('pointerleave', clearRestoredFocus)
          songRow.removeEventListener('keydown', clearRestoredFocus)
          songRow.removeEventListener('blur', clearRestoredFocus)
          if (event?.type.startsWith('pointer') && document.activeElement === songRow) songRow.blur()
        }
        songRow.addEventListener('pointerleave', clearRestoredFocus, { once: true })
        songRow.addEventListener('keydown', clearRestoredFocus, { once: true })
        songRow.addEventListener('blur', clearRestoredFocus, { once: true })
        songRow.focus({ preventScroll: true })
      }
      else previousFocusRef.current?.focus?.()
    }
  }, [modalOpen, isMobile])

  // 모바일에서 안드로이드 물리 뒤로가기로 모달 닫기 지원 (popstate)
  useEffect(() => {
    if (!isMobile) return
    if (modalOpen) {
      history.pushState({ mobileDetail: true }, '')
      setShow(true)
      const onPop = () => closeModal()
      window.addEventListener('popstate', onPop, { once: true })
      return () => window.removeEventListener('popstate', onPop)
    } else {
      setShow(false)
    }
  }, [modalOpen, isMobile])

  const handleMobileClose = () => {
    history.back()
  }

  useEffect(() => {
    if (!moreOpen) return
    const handler = () => setMoreOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [moreOpen])

  useEffect(() => {
    if (!difficultyOpen) return
    const handler = () => setDifficultyOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [difficultyOpen])

  const handleDifficultySelect = (targetSong) => {
    setDifficultyOpen(false)
    setMoreOpen(false)
    setTab('overview')
    openModal(targetSong)
  }

  if (isMobile) {
    if (!show && !modalOpen) return null
    const song = currentSong
    if (!song) return null
    return (
      <div
        ref={panelRef}
        className={`mob-detail${modalOpen ? ' open' : ''}`}
        data-cat={catFromLevel(song.level)}
        role="dialog"
        aria-modal="true"
        aria-label={`${song.name} 곡 상세`}
        aria-hidden={!modalOpen}
      >
        <MobileDetail
          song={song}
          detail={detail}
          onClose={handleMobileClose}
          difficultyVariants={difficultyVariants}
          onDifficultySelect={handleDifficultySelect}
        />
      </div>
    )
  }

  if (!modalOpen || !modalSong) return null

  const song = currentSong
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const counterpartUrl = getCounterpartUrl(song.counterpart)
  const counterpartLabel = getCounterpartLabel(song.counterpart)
  const linkedName = song.korea_name
    ? { label: '한국 곡명', value: song.korea_name }
    : song.xyx_name
    ? { label: '중국 곡명', value: song.xyx_name }
    : null

  const handlePlayClick = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
  }

  const handleCopyLink = () => {
    const url = songCatalogUrl(song.id)
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    setMoreOpen(false)
  }

  const handleOpenCategory = (category) => {
    navigate(`/personal-categories/${category.category_code}`, { state: { keepCatalogOpen: true } })
  }

  return (
    <div
      className="modal-backdrop song-catalog-backdrop"
      data-cat={catFromLevel(song.level)}
      onClick={e => e.target === e.currentTarget && closeModal()}
    >
      <aside ref={panelRef} className="modal song-catalog-panel" aria-label={`${song.name} 곡 상세`}>
          <div className="m-hero">
          <div className="m-top">
            <div className="m-breadcrumb">
              <b>카탈로그</b>{song.is_change ? ' · 변속곡' : ''}
            </div>
            <button className="m-close" onClick={closeModal} aria-label="닫기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>

          <div className="m-title-row">
            <div className="m-artwork" style={{ background: artworkBg(song.id) }}>
              {song.image
                ? <img
                    src={staticUrl(song.image)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                : initials
              }
            </div>
            <div className="m-name-wrap">
              <div className="level-hero-pill">
                <span className="k">LV</span>
                <span className="n">{song.level?.toFixed(1)}</span>
              </div>
              <div className="m-name">{song.name}</div>
              {linkedName && (
                <div className="m-linked-name">{linkedName.label} : {linkedName.value}</div>
              )}
              <div className="m-artist">by <b>{song.artist}</b> · {song.time} · {fmt(song.combo)} 콤보</div>
            </div>
          </div>

          <div className="m-actions is-split">
            <div className="m-actions-row">
              {song.youtube_url ? (
                <button className="btn btn-primary" onClick={handlePlayClick}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  음악 듣기
                </button>
              ) : (
                <button className="btn btn-primary" disabled style={{ opacity: 0.5 }}>음악 듣기</button>
              )}
              <button
                className="btn btn-ghost"
                disabled={!user}
                style={!user ? { opacity: 0.5 } : (favorites?.has(song.id) ? { color: 'var(--accent, #ff6b9d)' } : {})}
                title={user ? (favorites?.has(song.id) ? '즐겨찾기 해제' : '즐겨찾기 추가') : '즐겨찾기 (로그인 필요)'}
                onClick={() => { if (user) toggleFavorite(song.id) }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={favorites?.has(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
                </svg>
                즐겨찾기
              </button>
              <PersonalCategoryPicker songId={song.id} className="btn btn-ghost" />
            </div>
            <div className="m-actions-row">
              {counterpartUrl && (
                <button className="btn btn-ghost" onClick={() => navigateToCounterpart(counterpartUrl)}>
                  <ExternalLink size={14} strokeWidth={2.4} />
                  {counterpartLabel}
                </button>
              )}
              <div className="difficulty-wrap">
                <button
                  ref={difficultyBtnRef}
                  className="btn btn-ghost"
                  disabled={difficultyVariants.length === 0}
                  title={difficultyVariants.length ? '동일한 음악의 다른 난이도 보기' : '다른 난이도가 없습니다'}
                  style={difficultyVariants.length === 0 ? { opacity: 0.5 } : undefined}
                  onClick={e => {
                    e.stopPropagation()
                    if (difficultyVariants.length === 0) return
                    const rect = difficultyBtnRef.current.getBoundingClientRect()
                    const menuWidth = 260
                    setDifficultyPos({
                      top: rect.bottom + 6,
                      left: Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left)),
                    })
                    setMoreOpen(false)
                    setDifficultyOpen(v => !v)
                  }}
                >
                  <Layers size={14} strokeWidth={2.4} />
                  다른 난이도로 이동
                </button>
                {difficultyOpen && (
                  <div
                    ref={difficultyMenuRef}
                    className="difficulty-menu"
                    style={{ top: difficultyPos.top, left: difficultyPos.left }}
                    onClick={e => e.stopPropagation()}
                  >
                    {difficultyVariants.map(variant => (
                      <button
                        key={variant.id}
                        data-cat={catFromLevel(variant.level)}
                        onClick={() => handleDifficultySelect(variant)}
                      >
                        <span className="difficulty-info">
                          <span className="difficulty-name">{variant.name}</span>
                          <span className="difficulty-meta">
                          {fmtBpm(variant.bpm)} BPM · {fmt(variant.combo)} 콤보
                          </span>
                        </span>
                        <span className="difficulty-level">LV {Number(variant.level).toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-icon" title="링크 복사" onClick={handleCopyLink} style={copied ? { color: 'var(--ok)' } : {}}>
                {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={18} strokeWidth={2.5} />}
              </button>
              <div className="more-wrap">
                <button ref={moreBtnRef} className="btn btn-ghost btn-icon" title="더 보기" onClick={e => {
                  e.stopPropagation()
                  const rect = moreBtnRef.current.getBoundingClientRect()
                  setMorePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                  setDifficultyOpen(false)
                  setMoreOpen(v => !v)
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1, letterSpacing: 1 }}>···</span>
                </button>
                {moreOpen && (
                  <div ref={moreMenuRef} className="more-menu" style={{ top: morePos.top, right: morePos.right }} onClick={e => e.stopPropagation()}>
                    {!xyxMode && (
                      <button onClick={() => { setMoreOpen(false); closeModal(); openFeedback(song) }}>
                        <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>피드백</span>
                      </button>
                    )}
                    <button onClick={handleCopyLink}>
                      <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      <span>링크 복사</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="m-stats">
          {[
            { lbl: '난이도', val: song.level?.toFixed(1), sub: '공식', hi: true },
            { lbl: '게임 BPM',   val: song.bpm?.toFixed(1),   sub: song.is_change ? '변속 있음' : '고정' },
            { lbl: '음악 원 BPM', val: originalBpmText(song, detail), sub: '원본' },
            { lbl: '콤보',  val: fmt(song.combo),         sub: '최대' },
            { lbl: '시간',  val: song.time,               sub: '재생' },
            { lbl: '재생 수', val: detail?.play_count ?? song.play_count ?? 0, sub: '회' },
          ].map(({ lbl, val, sub, hi }) => (
            <div key={lbl} className={`m-stat${hi ? ' highlight' : ''}`}>
              <div className="lbl">{lbl}</div>
              <div className="val">{val}</div>
              <div className="sub">{sub}</div>
            </div>
          ))}
        </div>
        {song.combo_warning && (
          <div className="m-combo-warning">
            {COMBO_WARNING_TEXT}
          </div>
        )}

        <SavedCategoryTags song={song} onOpenCategory={handleOpenCategory} />
        {!xyxMode && <PracticeSectionsSummary song={song} />}

          <div className="m-tabs" role="tablist" aria-label="곡 상세 정보">
          {[
            { key: 'overview', label: '개요' },
            { key: 'records',  label: '플레이 영상' },
            ...(!xyxMode ? [
              { key: 'practice-new', label: '연습구간 등록' },
              ...(practiceSectionCount > 0 ? [{ key: 'practice-user', label: '유저 연습 구간' }] : []),
            ] : []),
            { key: 'comments', label: '댓글' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`m-tab${tab === key ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="m-body" role="tabpanel">
          {tab === 'overview' && (
            <>
              {detail && detail.is_change && <BpmTimelineSection timeline={detail.bpm_timeline} songTime={detail.time} />}
              <PerceivedSection song={song} />
            </>
          )}
          {tab === 'records' && <RecordsTab song={song} />}
          {!xyxMode && tab === 'practice-new' && <PracticeSectionForm song={song} />}
          {!xyxMode && practiceSectionCount > 0 && tab === 'practice-user' && <UserPracticeSectionsTab song={song} />}
          {tab === 'comments' && <CommentsTab song={song} />}
        </div>
      </aside>
    </div>
  )
}
