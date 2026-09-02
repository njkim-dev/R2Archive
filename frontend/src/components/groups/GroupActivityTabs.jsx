import { useMemo, useState } from 'react'
import useStore from '../../store/useStore'
import useGroupsStore from '../../store/useGroupsStore'
import { fmtDayLabel, fmtRel, roleLabel } from './groupDetailUtils'

export function FeedTab({ feed }) {
  const { songs, openModal } = useStore()
  const [viewerUrl, setViewerUrl] = useState(null)

  const onSongClick = (e, songId) => {
    e.stopPropagation()
    const song = songs.find(s => s.id === songId)
    if (song) openModal(song)
    else alert('곡 정보를 찾을 수 없어요')
  }

  if (!feed || feed.length === 0) {
    return (
      <div className="gd-tab-pane">
        <div className="gd-feed-empty">
          아직 활동 내역이 없어요. 멤버들이 점수를 기록하거나 새로 가입하면 여기 표시돼요.
        </div>
      </div>
    )
  }

  const groups = []
  let currentDay = null
  for (const ev of feed) {
    const day = fmtDayLabel(ev.at)
    if (day !== currentDay) {
      groups.push({ day, items: [] })
      currentDay = day
    }
    groups[groups.length - 1].items.push(ev)
  }

  return (
    <div className="gd-tab-pane">
      <div className="gd-feed">
        {groups.map(grp => (
          <div key={grp.day}>
            <div className="gd-feed-day">{grp.day}</div>
            {grp.items.map((ev, idx) => {
              const isHigh = ev.kind === 'score' && ev.judgment_percent >= 99
              const isMid = ev.kind === 'score' && ev.judgment_percent >= 95
              const icCls = ev.kind === 'join'
                ? 'join'
                : isHigh ? 'score gold' : 'score'
              const icSym = ev.kind === 'join' ? '+' : isHigh ? '★' : '♪'
              return (
                <div className="gd-feed-item" key={`${ev.kind}-${ev.user_id}-${ev.at}-${idx}`}>
                  <div className={`gd-feed-ic ${icCls}`}>{icSym}</div>
                  <div className="gd-feed-msg">
                    <b
                    >
                      {ev.nickname}
                    </b>
                    {ev.kind === 'join'
                      ? '님이 가입했어요'
                      : <>
                          {'님이 '}
                          <span
                            className="gd-feed-song gd-feed-song-clickable"
                            onClick={(e) => onSongClick(e, ev.song_id)}
                            title="곡 상세 보기"
                          >
                            {ev.song_name || `곡 #${ev.song_id}`}
                          </span>
                          {'에서 '}
                          <span className={`gd-feed-score${isHigh ? ' gold' : ''}`}>
                            {ev.judgment_percent.toFixed(3)}%
                          </span>
                          {' 달성'}
                          {isHigh ? ' 🏆' : isMid ? ' ✨' : ''}
                        </>}
                  </div>
                  {ev.kind === 'score' && (ev.screenshot_url || ev.youtube_url) && (
                    <div className="gd-feed-actions">
                      {ev.screenshot_url && (
                        <button
                          type="button"
                          className="gd-feed-icon-btn"
                          title="스크린샷 보기"
                          onClick={() => setViewerUrl(ev.screenshot_url)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                          </svg>
                        </button>
                      )}
                      {ev.youtube_url && (
                        <a
                          className="gd-feed-icon-btn yt"
                          href={ev.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          title="YouTube에서 재생"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23 7.5s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-.95C17 4 12 4 12 4s-5 0-8.1.25c-.4.05-1.3.05-2.1.95C1.2 5.9 1 7.5 1 7.5S.75 9.5.75 11.5v1c0 2 .25 4 .25 4s.2 1.6.8 2.3c.8.9 1.85.87 2.3.96C5.85 20 12 20.05 12 20.05s5 0 8.1-.25c.4-.05 1.3-.05 2.1-.95.6-.7.8-2.3.8-2.3s.25-2 .25-4v-1c0-2-.25-4-.25-4zM9.75 15.5V8.5l6.5 3.5-6.5 3.5z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  )}
                  <div className="gd-feed-time">{fmtRel(ev.at)}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {viewerUrl && (
        <div className="modal-backdrop" style={{ zIndex: 120 }} onClick={() => setViewerUrl(null)}>
          <div className="ss-viewer" onClick={e => e.stopPropagation()}>
            <button className="ss-viewer-close" onClick={() => setViewerUrl(null)} aria-label="닫기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
            <img src={viewerUrl} alt="등록된 스크린샷" />
          </div>
        </div>
      )}
    </div>
  )
}

export function FirstsTab({ songFirsts, currentUserId }) {
  const total = songFirsts.reduce((s, r) => s + r.num_firsts, 0)
  if (total === 0) {
    return (
      <div className="gd-tab-pane">
        <div className="gd-feed-empty">
          아직 곡 기록이 없어요. 멤버들이 점수를 기록하면 곡별 1위 분포가 여기 표시돼요.
        </div>
      </div>
    )
  }
  const max = songFirsts[0]?.num_firsts || 1

  return (
    <div className="gd-tab-pane">
      <div className="gd-dist-grid">
        {songFirsts.map(r => {
          const isMe = r.user_id === currentUserId
          const pct = (r.num_firsts / max) * 100
          const sharePct = (r.num_firsts / total * 100).toFixed(1)
          return (
            <div
              key={r.user_id}
              className="gd-dist-card"
            >
              <div className="gd-dist-head">
                <div className={`gd-dist-av${isMe ? ' me' : ''}`}>{(r.nickname || '?')[0]}</div>
                <div className="gd-dist-meta">
                  <div className="nm">
                    {r.nickname}
                    {isMe && <span className="gd-tag-me">나</span>}
                  </div>
                  <div className="sub">
                    {r.num_firsts_99 > 0 && `🏆 ${r.num_firsts_99}곡 99%+ · `}
                    전체의 {sharePct}%
                  </div>
                </div>
                <div className="gd-dist-count">
                  {r.num_firsts}<span className="unit">곡</span>
                </div>
              </div>
              <div className="gd-dist-bar"><div className="gd-dist-bar-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11.5, color: 'var(--fg-4)' }}>
        총 <span className="mono" style={{ color: 'var(--fg-2)' }}>{total}</span>곡 · {songFirsts.length}명이 1위 보유
      </div>
    </div>
  )
}

export function MembersTab({ g, leaderboard, currentUserId }) {
  const { setRole, kick, transfer } = useGroupsStore()
  const isOwner = g.my_role === 'owner'
  const isStaff = isOwner || g.my_role === 'manager'

  const enriched = useMemo(() => {
    const lbMap = new Map(leaderboard.map(s => [s.user_id, s]))
    return g.members.map(m => ({ ...m, stat: lbMap.get(m.user_id) }))
  }, [g.members, leaderboard])

  return (
    <div className="gd-tab-pane">
      <div className="gd-member-list">
        {enriched.map(m => {
          const isMe = m.user_id === currentUserId
          const canKick = isStaff && !isMe && m.role !== 'owner' && (isOwner || m.role === 'member')
          const canPromote = isOwner && !isMe && m.role === 'member'
          const canDemote = isOwner && !isMe && m.role === 'manager'
          const canTransfer = isOwner && !isMe

          const onPromote = async () => { try { await setRole(g.id, m.id, 'manager') } catch (e) { alert(e?.response?.data?.detail || '실패') } }
          const onDemote = async () => { try { await setRole(g.id, m.id, 'member') } catch (e) { alert(e?.response?.data?.detail || '실패') } }
          const onTransfer = async () => {
            if (!confirm(`Owner 권한을 ${m.nickname}님에게 양도할까요? 양도 후 본인은 매니저가 됩니다.`)) return
            try { await transfer(g.id, m.user_id) } catch (e) { alert(e?.response?.data?.detail || '실패') }
          }
          const onKick = async () => {
            if (!confirm(`${m.nickname}님을 그룹에서 추방할까요?`)) return
            try { await kick(g.id, m.id) } catch (e) { alert(e?.response?.data?.detail || '실패') }
          }

          return (
            <div className="gd-member-row" key={m.id}>
              <div className="gd-member-av">{(m.nickname || '?')[0]}</div>
              <div className="gd-member-meta">
                <div className="gd-member-name">
                  <span
                  >
                    {m.nickname}
                  </span>
                  <span className={`gd-role-chip ${m.role}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                    {roleLabel(m.role)}
                  </span>
                  {isMe && <span className="gd-tag-me">나</span>}
                  {m.stat && m.stat.num_songs > 0 && (
                    <span className="gd-member-stat mono">
                      {m.stat.avg_jp.toFixed(1)}% · {m.stat.num_songs}곡
                    </span>
                  )}
                </div>
                {m.bio && <div className="gd-member-bio">{m.bio}</div>}
              </div>
              <div className="gd-member-since mono">{fmtRel(m.joined_at)}</div>
              <div className="gd-member-actions">
                {canPromote && <button onClick={onPromote}>매니저 임명</button>}
                {canDemote && <button onClick={onDemote}>매니저 해제</button>}
                {canTransfer && <button onClick={onTransfer}>Owner 양도</button>}
                {canKick && <button className="danger" onClick={onKick}>추방</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
