import { useState, useEffect, useRef } from 'react'
import { Link2, Check } from 'lucide-react'
import useStore from '../store/useStore'
import { getComments, addComment, getPerceivedStats, submitPerceived, updatePerceived, getRecords, addRecord, getRanking, getMyRecordsForSong, logPlay } from '../api/client'
import { artworkBg, fmt, getAnonId } from '../utils/helpers'
import { useMobile } from '../hooks/useMobile'

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

  const isChange = timeline.length > 1
  const minBpm = Math.min(...bpms), maxBpm = Math.max(...bpms)

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="bpm-head">
        <h5>BPM 변속 타임라인</h5>
        <span className="bpm-range">
          {isChange
            ? <>범위 <b>{minBpm.toFixed(1)} – {maxBpm.toFixed(1)}</b></>
            : <>고정 <b>{bpms[0].toFixed(1)}</b></>
          }
        </span>
      </div>
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
    </div>
  )
}

function PerceivedSection({ song }) {
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [opinion, setOpinion] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const updateSongPerceived = useStore(s => s.updateSongPerceived)
  const anonId = getAnonId()

  useEffect(() => {
    setSubmitted(false)
    getPerceivedStats(song.id, anonId).then(data => {
      setStats(data)
      setSelected(data.my_vote ? data.my_vote.level : null)
      setOpinion('')
    })
  }, [song.id])

  const allSteps = []
  for (let v = 0.5; v <= 12.0 + 1e-9; v += 0.5) allSteps.push(+v.toFixed(1))

  const bins = stats?.bins ?? new Array(24).fill(0)
  const maxBin = Math.max(...bins, 1)
  const officialBin = Math.round((song.level - 0.5) * 2)

  const handleSubmit = async () => {
    if (selected == null) return
    const payload = { anon_id: anonId, level: selected, opinion: opinion || null }
    try {
      if (stats?.my_vote) {
        await updatePerceived(song.id, payload)
      } else {
        await submitPerceived(song.id, payload)
      }
      const fresh = await getPerceivedStats(song.id, anonId)
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
  const [records, setRecords] = useState(null)
  const [url, setUrl] = useState('')
  const [ytTitle, setYtTitle] = useState(null)
  const [ytLoading, setYtLoading] = useState(false)
  const [nick, setNick] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const anonId = getAnonId()

  useEffect(() => {
    getRecords(song.id).then(setRecords)
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
    if (!nick.trim()) return
    setSubmitting(true)
    try {
      // youtube_title은 서버가 oEmbed로 직접 조회하므로 보내지 않음.
      // 클라이언트 측 ytTitle은 제출 전 미리보기 UX 용도.
      await addRecord(song.id, {
        anon_id: anonId,
        nickname: nick.trim(),
        youtube_url: url || null,
        memo: memo || null,
      })
      const fresh = await getRecords(song.id)
      setRecords(fresh)
      setDone(true); setUrl(''); setYtTitle(null); setMemo('')
    } catch (_) {
    } finally {
      setSubmitting(false)
    }
  }

  const medals = ['🥇', '🥈', '🥉']

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
          <div className="rf-field">
            <label>닉네임</label>
            <input value={nick} onChange={e => setNick(e.target.value)} placeholder="닉네임" />
          </div>
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
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setUrl(''); setNick(''); setMemo(''); setYtTitle(null); setDone(false) }}>초기화</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={submitting || !nick.trim() || ytTitle === false} onClick={handleSubmit}>
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
            <div key={r.id} className={`lb-row${i < 3 ? ' top' : ''}`}>
              <span className="lb-rank">{i < 3 ? medals[i] : `#${i + 1}`}</span>
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

function RankingTab({ song }) {
  const user = useStore(s => s.user)
  const [rows, setRows] = useState(null)
  const [myRecords, setMyRecords] = useState(null)
  const [viewerUrl, setViewerUrl] = useState(null)

  const reload = () => {
    getRanking(song.id).then(setRows).catch(() => setRows([]))
    if (user) {
      getMyRecordsForSong(song.id).then(setMyRecords).catch(() => setMyRecords([]))
    } else {
      setMyRecords(null)
    }
  }

  useEffect(() => { reload() }, [song.id, user?.id])  // eslint-disable-line

  if (rows == null) {
    return <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중…</div>
  }

  const meInTop = !!rows.some(r => r.is_mine)
  const myBest = (myRecords || [])
    .filter(r => r.judgment_percent != null)
    .sort((a, b) => (b.judgment_percent ?? 0) - (a.judgment_percent ?? 0))[0]

  return (
    <div>
      <div className="rk-head">
        <div>
          <div className="rk-title">판정 랭킹 TOP 10</div>
          <div className="rk-sub">동점 시 먼저 등록한 기록이 상위</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="record-empty">
          <span className="big">🏆</span>
          아직 등록된 판정 기록이 없어요<br/>
          <span style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>상단 '내 기록 등록' 버튼으로 스크린샷을 업로드해보세요</span>
        </div>
      ) : (
        <div className="rk-list">
          {rows.map((r, i) => (
            <RankingRow key={r.id} r={r} rank={i + 1} onShowScreenshot={setViewerUrl} />
          ))}

          {user && myBest && !meInTop && (
            <>
              <div className="rk-sep"><span>내 기록</span></div>
              <RankingRow r={{ ...myBest, is_mine: true }} rank="My" onShowScreenshot={setViewerUrl} />
            </>
          )}
        </div>
      )}

      {user && myRecords && myRecords.filter(r => r.judgment_percent != null).length > 0 && (
        <div className="myrec-block">
          <div className="myrec-head">
            <span>내 판정 기록 전체 ({myRecords.filter(r => r.judgment_percent != null).length}건)</span>
          </div>
          <div className="myrec-list">
            {myRecords.filter(r => r.judgment_percent != null).map(r => (
              <div key={r.id} className="myrec-row">
                <span className="myrec-score">{r.judgment_percent.toFixed(3)}%</span>
                {r.screenshot_url && (
                  <button
                    type="button"
                    className="rk-ss-btn"
                    title="스크린샷 보기"
                    onClick={() => setViewerUrl(r.screenshot_url)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                    </svg>
                  </button>
                )}
                {r.youtube_url && (
                  <a
                    className="rk-yt-btn"
                    href={r.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    title="YouTube에서 재생"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23 7.5s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-.95C17 4 12 4 12 4s-5 0-8.1.25c-.4.05-1.3.05-2.1.95C1.2 5.9 1 7.5 1 7.5S.75 9.5.75 11.5v1c0 2 .25 4 .25 4s.2 1.6.8 2.3c.8.9 1.85.87 2.3.96C5.85 20 12 20.05 12 20.05s5 0 8.1-.25c.4-.05 1.3-.05 2.1-.95.6-.7.8-2.3.8-2.3s.25-2 .25-4v-1c0-2-.25-4-.25-4zM9.75 15.5V8.5l6.5 3.5-6.5 3.5z"/>
                    </svg>
                  </a>
                )}
                <span className="myrec-date">{r.created_at?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewerUrl && (
        <div className="modal-backdrop" style={{ zIndex: 120 }} onClick={() => setViewerUrl(null)}>
          <div className="ss-viewer" onClick={e => e.stopPropagation()}>
            <button className="ss-viewer-close" onClick={() => setViewerUrl(null)} aria-label="닫기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            <img src={viewerUrl} alt="등록된 스크린샷" />
          </div>
        </div>
      )}
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function RankingRow({ r, rank, onShowScreenshot }) {
  const medalIdx = typeof rank === 'number' && rank <= 3 ? rank - 1 : -1
  const displayRank = medalIdx >= 0 ? MEDALS[medalIdx] : (typeof rank === 'number' ? `#${rank}` : rank)
  const initial = ((r.nickname || '?')[0] || '?').toUpperCase()
  return (
    <div className={`rk-row${medalIdx >= 0 ? ' top' : ''}${r.is_mine ? ' me' : ''}`}>
      <span className={`rk-rank${medalIdx >= 0 ? ' medal' : ''}`}>{displayRank}</span>
      <div className="rk-player">
        <div className="rk-avatar">{initial}</div>
        <div className="rk-nick">
          {r.nickname}
          {r.is_mine && <span className="rk-me-tag">나</span>}
          {r.screenshot_url && (
            <button
              type="button"
              className="rk-ss-btn"
              title="스크린샷 보기"
              onClick={(e) => { e.stopPropagation(); onShowScreenshot(r.screenshot_url) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
              </svg>
            </button>
          )}
          {r.youtube_url && (r.is_mine || r.owner_show_screenshot) && (
            <a
              className="rk-yt-btn"
              href={r.youtube_url}
              target="_blank"
              rel="noreferrer"
              title="YouTube에서 재생"
              onClick={e => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23 7.5s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-.95C17 4 12 4 12 4s-5 0-8.1.25c-.4.05-1.3.05-2.1.95C1.2 5.9 1 7.5 1 7.5S.75 9.5.75 11.5v1c0 2 .25 4 .25 4s.2 1.6.8 2.3c.8.9 1.85.87 2.3.96C5.85 20 12 20.05 12 20.05s5 0 8.1-.25c.4-.05 1.3-.05 2.1-.95.6-.7.8-2.3.8-2.3s.25-2 .25-4v-1c0-2-.25-4-.25-4zM9.75 15.5V8.5l6.5 3.5-6.5 3.5z"/>
              </svg>
            </a>
          )}
        </div>
      </div>
      <div className="rk-score">
        <div className="rk-score-v">{r.judgment_percent != null ? r.judgment_percent.toFixed(3) : '—'}</div>
        <div className="rk-score-l">판정 %</div>
      </div>
      <div className="rk-date">{r.created_at?.slice(0, 10).replace(/-/g, '.')}</div>
    </div>
  )
}

function CommentsTab({ song }) {
  const [comments, setComments] = useState(null)
  const [nick, setNick] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getComments(song.id).then(setComments)
  }, [song.id])

  const handleSubmit = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await addComment(song.id, { nickname: nick.trim() || null, content: body.trim() })
      const fresh = await getComments(song.id)
      setComments(fresh)
      setBody(''); setNick('')
    } catch (_) {
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="comment-form">
        <div className="avatar-me">{nick?.[0] || '익'}</div>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            className="comment-nick-input"
            placeholder="닉네임 (비우면 자동 부여)"
            value={nick}
            onChange={e => setNick(e.target.value)}
          />
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
  const fmtTime = (s) => {
    if (s === 0) return '시작'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return m > 0 ? `${m}분 ${sec}초` : `${sec}초`
  }

  return (
    <div className="mob-section">
      <div className="mob-section-title">BPM 변속 타임라인</div>
      <div className="mob-bpm-list">
        {timeline.map((pt, i) => {
          const prev = timeline[i - 1]
          const delta = prev ? pt.bpm - prev.bpm : null
          return (
            <div key={i} className="mob-bpm-entry">
              <span className="mob-bpm-time">{fmtTime(pt.time)}</span>
              <span className="mob-bpm-sep">:</span>
              <span className="mob-bpm-val">{pt.bpm % 1 === 0 ? pt.bpm : pt.bpm.toFixed(1)}</span>
              {delta != null && (
                <span className="mob-bpm-delta" style={{ color: delta > 0 ? 'oklch(0.75 0.18 25)' : 'var(--ok)' }}>
                  {delta > 0 ? `+${delta % 1 === 0 ? delta : delta.toFixed(1)}` : delta % 1 === 0 ? delta : delta.toFixed(1)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MobileDetail({ song, detail, onClose }) {
  const [tab, setTab] = useState('overview')
  const [scrolled, setScrolled] = useState(false)
  const [perceivedStats, setPerceivedStats] = useState(null)
  const bodyRef = useRef(null)
  const anonId = getAnonId()

  const cat = song.level >= 7 ? 'sun' : song.level >= 4 ? 'moon' : 'star'
  const catLabel = { star: '별 (1.5–3.5)', moon: '달 (4–6.5)', sun: '해 (7–12)' }[cat]

  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  useEffect(() => {
    getPerceivedStats(song.id, anonId).then(setPerceivedStats)
  }, [song.id])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const handler = () => setScrolled(el.scrollTop > 60)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const handlePlay = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
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
          const url = `${location.origin}${location.pathname}#song=${song.id}`
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
                src={`${import.meta.env.VITE_API_URL}/static/${song.image}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            : <span className="mob-hero-init">{initials}</span>
          }
        </div>
        <h1 className="mob-hero-title">{song.name}</h1>
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
          <span className="mob-h-tag">{song.bpm.toFixed(1)} BPM</span>
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
          {song.youtube_url ? '음악 듣기' : '음악 없음'}
        </button>
        <button className="mob-act-btn mob-act-ghost" disabled style={{ opacity: 0.4 }} title="로그인 후 이용 가능">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
          </svg>
          즐겨찾기
        </button>
      </div>

      <div className="mob-stats">
        {[
          { lbl: '난이도', val: song.level?.toFixed(1), cat },
          { lbl: 'BPM', val: song.bpm?.toFixed(1) },
          { lbl: '콤보', val: fmt(song.combo) },
          { lbl: '시간', val: song.time },
        ].map(({ lbl, val, cat: c }) => (
          <div key={lbl} className="mob-stat">
            <div className="mob-stat-val" data-cat={c}>{val}</div>
            <div className="mob-stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>

      <div className="mob-tabs">
        {[
          { key: 'overview', label: '개요' },
          { key: 'records',  label: '성과 등록' },
          { key: 'ranking',  label: '랭킹' },
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
                  { lbl: '콤보', val: fmt(song.combo) },
                  { lbl: '변속', val: song.is_change ? '있음' : '없음' },
                  { lbl: '총 재생', val: `${(detail?.play_count ?? song.play_count ?? 0).toLocaleString()}회` },
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
        {tab === 'ranking' && <RankingTab song={song} />}
        {tab === 'comments' && <CommentsTab song={song} />}
      </div>
    </div>
  )
}

export default function SongModal() {
  const isMobile = useMobile()
  const { modalOpen, modalSong, closeModal, openFeedback } = useStore()
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePos, setMorePos] = useState({ top: 0, right: 0 })
  const [copied, setCopied] = useState(false)
  const moreBtnRef = useRef(null)
  const moreMenuRef = useRef(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!modalOpen || !modalSong) { setDetail(null); setTab('overview'); return }
    import('../api/client').then(({ getSong }) => {
      getSong(modalSong.id).then(setDetail)
    })
  }, [modalOpen, modalSong?.id])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeModal])

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

  if (isMobile) {
    if (!show && !modalOpen) return null
    const song = detail ?? modalSong
    if (!song) return null
    return (
      <div className={`mob-detail${modalOpen ? ' open' : ''}`} aria-hidden={!modalOpen}>
        <MobileDetail
          song={song}
          detail={detail}
          onClose={handleMobileClose}
        />
      </div>
    )
  }

  if (!modalOpen || !modalSong) return null

  const song = detail ?? modalSong
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  const handlePlayClick = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
  }

  const handleCopyLink = () => {
    const url = `${location.origin}${location.pathname}#song=${song.id}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    setMoreOpen(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
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
                    src={`${import.meta.env.VITE_API_URL}/static/${song.image}`}
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
              <div className="m-artist">by <b>{song.artist}</b> · {song.time} · {fmt(song.combo)} 콤보</div>
            </div>
          </div>

          <div className="m-actions">
            {song.youtube_url ? (
              <button className="btn btn-primary" onClick={handlePlayClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                음악 듣기
              </button>
            ) : (
              <button className="btn btn-primary" disabled style={{ opacity: 0.5 }}>음악 없음</button>
            )}
            <button className="btn btn-ghost" onClick={() => {}} title="즐겨찾기 (로그인 필요)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
              </svg>
              즐겨찾기
            </button>
            <button className="btn btn-ghost btn-icon" title="링크 복사" onClick={handleCopyLink} style={copied ? { color: 'var(--ok)' } : {}}>
              {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={18} strokeWidth={2.5} />}
            </button>
            <div className="more-wrap">
              <button ref={moreBtnRef} className="btn btn-ghost btn-icon" title="더 보기" onClick={e => {
                e.stopPropagation()
                const rect = moreBtnRef.current.getBoundingClientRect()
                setMorePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                setMoreOpen(v => !v)
              }}>
                <span style={{ fontSize: 16, lineHeight: 1, letterSpacing: 1 }}>···</span>
              </button>
              {moreOpen && (
                <div ref={moreMenuRef} className="more-menu" style={{ top: morePos.top, right: morePos.right }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setMoreOpen(false); openFeedback(song) }}>
                    <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>피드백</span>
                  </button>
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

        <div className="m-stats">
          {[
            { lbl: '난이도', val: song.level?.toFixed(1), sub: '공식', hi: true },
            { lbl: 'BPM',   val: song.bpm?.toFixed(1),   sub: song.is_change ? '변속 있음' : '고정' },
            { lbl: '콤보',  val: fmt(song.combo),         sub: '최대' },
            { lbl: '시간',  val: song.time,               sub: '재생' },
            { lbl: '총 재생', val: detail?.play_count ?? song.play_count ?? 0, sub: '회' },
            { lbl: '이번 주', val: detail?.play_count_week ?? 0, sub: '회' },
          ].map(({ lbl, val, sub, hi }) => (
            <div key={lbl} className={`m-stat${hi ? ' highlight' : ''}`}>
              <div className="lbl">{lbl}</div>
              <div className="val">{val}</div>
              <div className="sub">{sub}</div>
            </div>
          ))}
        </div>

          <div className="m-tabs">
          {[
            { key: 'overview', label: '개요' },
            { key: 'records',  label: '플레이 영상' },
            { key: 'ranking',  label: '랭킹' },
            { key: 'comments', label: '댓글' },
          ].map(({ key, label }) => (
            <button key={key} className={`m-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="m-body">
          {tab === 'overview' && (
            <>
              {detail && detail.is_change && <BpmGraph timeline={detail.bpm_timeline} songTime={detail.time} />}
              <PerceivedSection song={song} />
            </>
          )}
          {tab === 'records' && <RecordsTab song={song} />}
          {tab === 'ranking' && <RankingTab song={song} />}
          {tab === 'comments' && <CommentsTab song={song} />}
        </div>
      </div>
    </div>
  )
}
