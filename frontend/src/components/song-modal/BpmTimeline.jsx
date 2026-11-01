import { useState } from 'react'
import { fmtBpm } from '../../utils/helpers'

const BPM_TIMELINE_VIEW_KEY = 'r2b_bpm_timeline_view'

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
  const viewEnd = isDense ? Math.min(duration, lastChange + viewPad) : duration
  const viewDuration = Math.max(1, viewEnd - viewStart)

  const tx = t => pad.l + ((t - viewStart) / viewDuration) * gw
  const ty = bpm => pad.t + (1 - (bpm - mn) / range) * gh
  const yTicks = [mn, Math.round((mn + mx) / 2), mx]


  return (
    <div className="bpm-graph">
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
              data-tooltip={i > 0 ? `${fmtT(pt.time)}\n${pt.bpm.toFixed(1)} BPM\n${pt.bpm >= prev.bpm ? '▲ +' : '▼ '}${(pt.bpm-prev.bpm).toFixed(1)} (이전 ${prev.bpm.toFixed(1)})${Math.abs(pt.bpm-prev.bpm)>(mx-mn)*.25?'\n변속':''}` : undefined}
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
    </div>
  )
}

export function BpmTimelineTable({ timeline, compact = false }) {
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

export default function BpmTimelineSection({ timeline, songTime }) {
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
          <button type="button" className={view === 'graph' ? 'active' : ''} onClick={() => handleView('graph')}>
            그래프로 보기
          </button>
          <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => handleView('table')}>
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
