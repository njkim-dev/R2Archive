import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import useStore from '../store/useStore'
import useGroupsStore from '../store/useGroupsStore'
import UserChip from '../components/UserChip'
import { useMobile } from '../hooks/useMobile'
import GroupDetailMobileHeader from '../components/groups/GroupDetailMobileHeader'
import { HelpButton } from '../components/HelpTour'

// 그룹 id로부터 hue 산출 (0~360). 디자인 시안의 hueOf와 동일 알고리즘.
function hueOf(gid) {
  let h = 0
  const s = String(gid)
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function fmtRel(at) {
  if (!at) return '—'
  const d = (Date.now() - new Date(at).getTime()) / 1000
  if (d < 60) return '방금'
  if (d < 3600) return `${Math.floor(d / 60)}분 전`
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
  if (d < 2592000) return `${Math.floor(d / 86400)}일 전`
  const dt = new Date(at)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

function fmtDayLabel(at) {
  const d = new Date(at)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  const dStart = new Date(d); dStart.setHours(0, 0, 0, 0)
  if (dStart.getTime() === today.getTime()) return '오늘'
  if (dStart.getTime() === yest.getTime()) return '어제'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function judgeColor(s) {
  if (s == null) return 'empty'
  if (s >= 99) return 'gold'
  if (s >= 95) return 'high'
  return ''
}

function roleLabel(r) {
  if (r === 'owner') return 'OWNER'
  if (r === 'manager') return 'MGR'
  if (r === 'admin') return 'ADMIN'
  return 'MEMBER'
}

// ---------- Hero ----------
function Hero({ g, hue, isOwner, isStaff, pendingCount, onCopyCode, onRegen, onGoManage, navigate }) {
  // admin은 staff는 아니지만 코드 열람 가능. 운영 액션(재발급/신청 처리)은 owner/manager만.
  const canSeeCode = isStaff || g.my_role === 'admin'
  return (
    <div className="gd-hero" style={{ '--group-h': hue }}>
      <div className="gd-hero-row">
        <div className="gd-hero-ic">{g.name[0] || 'G'}</div>
        <div className="gd-hero-meta">
          <div className="gd-hero-title-row">
            <h1>{g.name}</h1>
            <span className={`gd-role-chip ${g.my_role}`}>{roleLabel(g.my_role)}</span>
          </div>
          <p className="gd-hero-desc">
            {g.description || <span style={{ color: 'var(--fg-3)' }}>설명이 없는 그룹이에요.</span>}
          </p>
          <div className="gd-hero-stats">
            <div className="gd-hero-stat">
              <span className="lbl">멤버</span>
              <span className="val">{g.members.length}</span>
            </div>
            <div className="gd-hero-stat">
              <span className="lbl">생성</span>
              <span className="val dim">{fmtRel(g.created_at)}</span>
            </div>
            <div className="gd-hero-stat">
              <span className="lbl">정책</span>
              <span className="val dim">{g.auto_accept ? '자동 수락' : 'Owner 수락'}</span>
            </div>
          </div>
          <div className="gd-hero-actions">
            <button className="gd-btn primary" onClick={() => navigate(`/rankings?group=${g.id}`)}>
              이 그룹 랭킹 보기
            </button>
            {/* 가입 코드 표시·복사: owner/manager + admin. 재발급은 owner만 (아래) */}
            {canSeeCode && !g.code_revoked && g.join_code && (
              <button className="gd-btn ghost" onClick={onCopyCode}>
                <span className="gd-code-pill mono">{g.join_code}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-3)', marginLeft: 6 }}>복사</span>
              </button>
            )}
            {canSeeCode && g.code_revoked && (
              <span className="gd-code-pill mono" style={{ opacity: 0.6 }}>코드 폐기됨</span>
            )}
            {isOwner && <button className="gd-btn ghost" onClick={onRegen}>코드 재발급</button>}
            {isStaff && (
              <button
                className="gd-btn ghost"
                onClick={onGoManage}
                disabled={pendingCount === 0}
                style={pendingCount === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                신청 {pendingCount}건
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Tabs ----------
function TabsStrip({ tab, setTab, isStaff, pendingCount, memberCount }) {
  const tabs = [
    { key: 'leaderboard', label: '리더보드' },
    { key: 'feed', label: '활동 피드' },
    { key: 'firsts', label: '곡별 1위' },
    { key: 'members', label: `멤버 ${memberCount}` },
    ...(isStaff ? [{ key: 'manage', label: '관리', badge: pendingCount > 0 ? pendingCount : null }] : []),
    { key: 'settings', label: '설정' },
  ]
  return (
    <div className="gd-tabs">
      {tabs.map(t => (
        <button
          key={t.key}
          className={`gd-tab${tab === t.key ? ' on' : ''}`}
          onClick={() => setTab(t.key)}
        >
          {t.label}
          {t.badge != null && <span className="gd-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

// 핀 이동 헬퍼 — 모든 탭에서 동일하게 사용.
function jumpToPin(navigate, userId, nickname) {
  const q = new URLSearchParams({ pinUser: String(userId), pinNick: nickname || '' })
  navigate(`/rankings?${q.toString()}`)
}

// 검색 비허용 사용자는 클릭해도 랭킹 페이지로 가지 않게 차단.
// memberMap: Map<user_id, { searchable, ... }>
function safeJumpToPin(navigate, userId, nickname, memberMap, currentUserId) {
  const info = memberMap?.get(userId)
  if (info && info.searchable === 'private' && userId !== currentUserId) {
    alert(`${nickname || '이 사용자'}님은 검색을 허용하지 않아 정보를 볼 수 없어요`)
    return
  }
  jumpToPin(navigate, userId, nickname)
}

// ---------- Leaderboard tab ----------
function LeaderboardTab({ leaderboard, currentUserId, navigate, memberMap, isMobile = false }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })

  // 합성 점수 (디자인 시안과 동일): avg*0.5 + log(numSongs+1)*8 + top99*0.6
  const enriched = useMemo(() => {
    const out = leaderboard.map(s => {
      const avg = s.avg_jp ?? 0
      const gscore = s.num_songs === 0 ? 0
        : (avg * 0.5) + Math.log(s.num_songs + 1) * 8 + s.top99 * 0.6
      return { ...s, avg, gscore }
    })
    out.sort((a, b) => b.gscore - a.gscore || b.avg - a.avg)
    out.forEach((s, i) => { s.rank = s.num_songs > 0 ? i + 1 : null })
    return out
  }, [leaderboard])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...enriched].sort((a, b) => {
      if (sort.key === 'rank') return ((a.rank ?? 999) - (b.rank ?? 999)) * dir
      if (sort.key === 'name') return a.nickname.localeCompare(b.nickname) * dir
      if (sort.key === 'avg') return ((b.avg ?? 0) - (a.avg ?? 0)) * dir
      if (sort.key === 'songs') return (b.num_songs - a.num_songs) * dir
      if (sort.key === 'top99') return (b.top99 - a.top99) * dir
      if (sort.key === 'last') return (new Date(b.last_at || 0) - new Date(a.last_at || 0)) * dir
      return 0
    })
  }, [enriched, sort])

  const myStat = enriched.find(s => s.user_id === currentUserId)

  const onSort = (key) => setSort(prev => prev.key === key
    ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: ['name'].includes(key) ? 'asc' : 'desc' })
  const arrow = (k) => sort.key === k ? <span className="gd-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null
  const sortedCls = (k) => sort.key === k ? ' sorted' : ''

  return (
    <div className="gd-tab-pane">
      {myStat && (
        <div className="gd-myrank">
          <div className="gd-myrank-head">
            <span>내 그룹 순위</span>
            <span className="gd-myrank-num mono">#{myStat.rank ?? '—'}</span>
          </div>
          <div className="gd-myrank-grid">
            <div>
              <div className="lbl">평균</div>
              <div className={`val mono judge ${judgeColor(myStat.avg)}`}>
                {myStat.num_songs ? `${myStat.avg.toFixed(2)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="lbl">곡 수</div>
              <div className="val mono">{myStat.num_songs}</div>
            </div>
            <div>
              <div className="lbl">99%+</div>
              <div className="val mono judge gold">{myStat.top99 ?? 0}</div>
            </div>
            <div>
              <div className="lbl">98.9%+</div>
              <div className="val mono judge high">{myStat.top989 ?? 0}</div>
            </div>
            <div>
              <div className="lbl">98.8%+</div>
              <div className="val mono judge high">{myStat.top988 ?? 0}</div>
            </div>
            <div>
              <div className="lbl">98.7%+</div>
              <div className="val mono judge high">{myStat.top987 ?? 0}</div>
            </div>
            <div>
              <div className="lbl">98.5%+</div>
              <div className="val mono judge high">{myStat.top985 ?? 0}</div>
            </div>
            <div>
              <div className="lbl">98%+</div>
              <div className="val mono judge high">{myStat.top98 ?? 0}</div>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="gd-empty">아직 멤버가 없어요</div>
      ) : isMobile ? (
        <div className="gd-lb-mob">
          {sorted.map(s => {
            const isMe = s.user_id === currentUserId
            const rankCls = s.rank === 1 ? ' gold' : s.rank === 2 ? ' silver' : s.rank === 3 ? ' bronze' : ''
            const rankSym = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : (s.rank ? `#${s.rank}` : '—')
            return (
              <div
                key={s.user_id}
                className={`gd-lb-mob-card${isMe ? ' me' : ''}`}
                onClick={() => safeJumpToPin(navigate, s.user_id, s.nickname, memberMap, currentUserId)}
              >
                <div className="gd-lb-mob-top">
                  <span className={`gd-lb-mob-rank${rankCls}`}>{rankSym}</span>
                  <div className={`gd-nm-av${isMe ? ' me' : ''}`}>{(s.nickname || '?')[0]}</div>
                  <div className="gd-lb-mob-name">
                    <span>{s.nickname}</span>
                    {s.role !== 'member' && (
                      <span className={`gd-role-chip ${s.role}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                        {s.role === 'owner' ? 'OWN' : 'MGR'}
                      </span>
                    )}
                    {isMe && <span className="gd-tag-me">나</span>}
                  </div>
                  <span className={`gd-judge ${judgeColor(s.avg)} gd-lb-mob-avg`}>
                    {s.num_songs ? `${s.avg.toFixed(2)}%` : '—'}
                  </span>
                </div>
                <div className="gd-bar-track" style={{ margin: '4px 0 6px' }}>
                  <div
                    className="gd-bar-fill"
                    style={{
                      width: s.num_songs ? `${s.avg.toFixed(1)}%` : 0,
                      background: s.avg >= 99 ? 'var(--gold)' : s.avg >= 95 ? 'var(--accent)' : 'var(--fg-3)',
                    }}
                  />
                </div>
                <div className="gd-lb-mob-stats">
                  <span>곡 <b className="mono">{s.num_songs || '—'}</b></span>
                  <span>
                    99%+ <b className="mono" style={s.top99 ? { color: 'var(--gold)' } : undefined}>
                      {s.top99 || '—'}
                    </b>
                  </span>
                  <span className="dim">{s.last_at ? fmtRel(s.last_at) : '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <table className="gd-lb">
          <thead>
            <tr>
              <th className={`center${sortedCls('rank')}`} onClick={() => onSort('rank')}>#{arrow('rank')}</th>
              <th className={sortedCls('name')} onClick={() => onSort('name')}>멤버{arrow('name')}</th>
              <th className={`right${sortedCls('avg')}`} onClick={() => onSort('avg')}>평균 판정{arrow('avg')}</th>
              <th className={`right${sortedCls('songs')}`} onClick={() => onSort('songs')}>곡 수{arrow('songs')}</th>
              <th className={`right${sortedCls('top99')}`} onClick={() => onSort('top99')}>99%+{arrow('top99')}</th>
              <th className={`right${sortedCls('last')}`} onClick={() => onSort('last')}>최근 기록{arrow('last')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const isMe = s.user_id === currentUserId
              const rankCls = s.rank === 1 ? ' gold' : s.rank === 2 ? ' silver' : s.rank === 3 ? ' bronze' : ''
              const rankSym = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : (s.rank ? `${s.rank}` : '—')
              return (
                <tr
                  key={s.user_id}
                  className={isMe ? 'me' : ''}
                  onClick={() => safeJumpToPin(navigate, s.user_id, s.nickname, memberMap, currentUserId)}
                >
                  <td className={`gd-rank-cell${rankCls}`}>{rankSym}</td>
                  <td>
                    <div className="gd-nm-cell">
                      <div className={`gd-nm-av${isMe ? ' me' : ''}`}>{(s.nickname || '?')[0]}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="gd-nm-name">
                          {s.nickname}
                          {s.role !== 'member' && (
                            <span className={`gd-role-chip ${s.role}`} style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px' }}>
                              {s.role === 'owner' ? 'OWN' : 'MGR'}
                            </span>
                          )}
                          {isMe && <span className="gd-tag-me">나</span>}
                        </div>
                        {s.bio
                          ? <div className="gd-nm-sub">{s.bio}</div>
                          : <div className="gd-nm-sub" style={{ color: 'var(--fg-4)' }}>가입 {fmtRel(s.joined_at)}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="gd-bar-wrap">
                      <div className="gd-bar-track">
                        <div
                          className="gd-bar-fill"
                          style={{
                            width: s.num_songs ? `${(s.avg).toFixed(1)}%` : 0,
                            background: s.avg >= 99 ? 'var(--gold)' : s.avg >= 95 ? 'var(--accent)' : 'var(--fg-3)',
                          }}
                        />
                      </div>
                      <span className={`gd-judge ${judgeColor(s.avg)}`}>
                        {s.num_songs ? `${s.avg.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  </td>
                  <td className={`gd-num${s.num_songs ? '' : ' dim'}`}>{s.num_songs || '—'}</td>
                  <td className={`gd-num${s.top99 ? '' : ' dim'}`} style={s.top99 ? { color: 'var(--gold)', fontWeight: 600 } : undefined}>
                    {s.top99 || '—'}
                  </td>
                  <td className="gd-num dim" style={{ fontSize: 11.5 }}>{s.last_at ? fmtRel(s.last_at) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------- Feed tab ----------
function FeedTab({ feed, navigate, memberMap, currentUserId }) {
  const { songs, openModal } = useStore()
  const [viewerUrl, setViewerUrl] = useState(null)   // 스크린샷 보기

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

  // 일자별 그룹핑
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
                      className="gd-feed-clickable"
                      onClick={() => safeJumpToPin(navigate, ev.user_id, ev.nickname, memberMap, currentUserId)}
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
                  {/* 스크린샷/유튜브 아이콘 — 권한 통과 시 백엔드가 URL 채워줌 */}
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

// ---------- Firsts tab ----------
function FirstsTab({ songFirsts, currentUserId, navigate, memberMap }) {
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
              onClick={() => safeJumpToPin(navigate, r.user_id, r.nickname, memberMap, currentUserId)}
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

// ---------- Members tab ----------
function MembersTab({ g, leaderboard, currentUserId, navigate, memberMap }) {
  const { setRole, kick, transfer } = useGroupsStore()
  const isOwner = g.my_role === 'owner'
  const isStaff = isOwner || g.my_role === 'manager'

  // member detail에 통계 합성
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
                    className="gd-feed-clickable"
                    onClick={() => safeJumpToPin(navigate, m.user_id, m.nickname, memberMap, currentUserId)}
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

// ---------- Manage (applications) tab ----------
function ManageTab({ g }) {
  const { accept, reject } = useGroupsStore()

  const onAccept = async (aid) => { try { await accept(g.id, aid) } catch (e) { alert(e?.response?.data?.detail || '실패') } }
  const onReject = async (aid) => { try { await reject(g.id, aid) } catch (e) { alert(e?.response?.data?.detail || '실패') } }

  if (g.applications.length === 0) {
    return (
      <div className="gd-tab-pane">
        <div className="gd-feed-empty">대기 중인 가입 신청이 없어요</div>
      </div>
    )
  }

  return (
    <div className="gd-tab-pane">
      <div className="gd-app-list">
        {g.applications.map(a => (
          <div className="gd-app-row" key={a.id}>
            <div className="gd-member-av">{(a.nickname || '?')[0]}</div>
            <div className="gd-app-meta">
              <div className="gd-app-name">
                {a.nickname}
                <span className="gd-app-time mono">{fmtRel(a.created_at)}</span>
              </div>
              {a.bio && <div className="gd-app-bio">{a.bio}</div>}
            </div>
            <div className="gd-app-actions">
              <button className="ok" onClick={() => onAccept(a.id)}>수락</button>
              <button className="no" onClick={() => onReject(a.id)}>거절</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Settings tab ----------
function SettingsTab({ g, navigate }) {
  const { patch, regenCode, revokeCode, remove, leave } = useGroupsStore()
  const isOwner = g.my_role === 'owner'
  const isStaff = isOwner || g.my_role === 'manager'

  const [name, setName] = useState(g.name)
  const [desc, setDesc] = useState(g.description)

  useEffect(() => { setName(g.name); setDesc(g.description) }, [g.id, g.name, g.description])

  const onSave = async () => {
    if (name.trim().length < 2) { alert('그룹 이름은 2자 이상이어야 해요'); return }
    try { await patch(g.id, { name: name.trim(), description: desc.trim() }); alert('저장했어요') }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onToggleAuto = async () => {
    try { await patch(g.id, { auto_accept: !g.auto_accept }) }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onRegen = async () => {
    if (!confirm('코드를 재발급할까요? 이전 코드는 즉시 무효화됩니다.')) return
    try { const r = await regenCode(g.id); alert(`새 코드: ${r.join_code}`) }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onRevoke = async () => {
    if (!confirm('코드를 폐기할까요? 이 코드로 더 이상 가입할 수 없게 됩니다.')) return
    try { await revokeCode(g.id) } catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onDelete = async () => {
    if (!confirm(`'${g.name}' 그룹을 정말 삭제할까요? 멤버 ${g.members.length}명, 신청 데이터가 모두 사라집니다.`)) return
    try { await remove(g.id); navigate('/groups') }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onLeave = async () => {
    if (!confirm(`'${g.name}' 그룹에서 탈퇴할까요?`)) return
    try { await leave(g.id); navigate('/groups') }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }

  return (
    <div className="gd-tab-pane">
      <div className="gd-settings-grid">
        <div className="gd-set-card">
          <h4>기본 정보</h4>
          {isOwner ? (
            <>
              <label>이름</label>
              <input type="text" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
              <label style={{ marginTop: 12 }}>설명</label>
              <textarea maxLength={240} rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="gd-btn primary" onClick={onSave}>저장</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--fg-2)' }}>
              <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--fg-3)' }}>이름:</span> <b>{g.name}</b></div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--fg-3)' }}>설명:</span> {g.description || <span style={{ color: 'var(--fg-4)' }}>없음</span>}
              </div>
              <div>
                <span style={{ color: 'var(--fg-3)' }}>생성일:</span>{' '}
                <span className="mono">{new Date(g.created_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          )}
        </div>

        <div className="gd-set-card">
          <h4>가입 정책</h4>
          <div
            className="gd-toggle-row"
            onClick={isOwner ? onToggleAuto : undefined}
            style={isOwner ? undefined : { pointerEvents: 'none', opacity: 0.7 }}
          >
            <div className="gd-toggle-meta">
              <b>자동 수락</b>
              <span>코드를 가진 사람의 가입을 즉시 승인합니다.</span>
            </div>
            <div className={`gd-toggle${g.auto_accept ? ' on' : ''}`} />
          </div>

          {isStaff && (
            <div style={{ marginTop: 14 }}>
              <label>가입 코드</label>
              <div className="gd-code-row">
                <span className="mono" style={{
                  flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: '0.08em',
                  color: g.code_revoked ? 'var(--fg-4)' : 'var(--fg)',
                }}>
                  {g.code_revoked ? '폐기됨' : (g.join_code || '—')}
                </span>
                {/* 재발급/폐기는 owner 전용 */}
                {isOwner && <button className="gd-btn ghost sm" onClick={onRegen}>재발급</button>}
                {isOwner && !g.code_revoked && <button className="gd-btn warn sm" onClick={onRevoke}>폐기</button>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 6, lineHeight: 1.5 }}>
                {isOwner ? '폐기·재발급 시 이전 코드는 즉시 무효화됩니다.' : '재발급·폐기는 owner만 할 수 있어요.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {isOwner ? (
        <div className="gd-danger-zone">
          <h4>위험 구역</h4>
          <p>그룹 삭제는 되돌릴 수 없습니다. 모든 멤버십과 신청 데이터가 함께 삭제돼요.</p>
          <button className="gd-btn danger" onClick={onDelete}>그룹 삭제</button>
        </div>
      ) : (
        <div className="gd-danger-zone safe">
          <h4>그룹 탈퇴</h4>
          <p>탈퇴하면 이 그룹의 멤버 정보를 더 이상 볼 수 없어요.</p>
          <button className="gd-btn warn" onClick={onLeave}>그룹 탈퇴</button>
        </div>
      )}
    </div>
  )
}

// ---------- Page ----------
// 가입 코드 형식 (XXXX-XXXX, 영숫자) 감지용.
const JOIN_CODE_RE = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/

export default function GroupDetailPage() {
  const isMobile = useMobile()
  const { gid: gidParam } = useParams()
  const gid = Number(gidParam)
  const navigate = useNavigate()
  const { user, openLogin } = useStore()
  const { detail, detailLoading, leaderboard, feed, songFirsts, myGroups, fetchMyGroups, loadGroupPage, clearDetail, regenCode } = useGroupsStore()
  const [tab, setTab] = useState('leaderboard')
  const [error, setError] = useState(null)

  // /groups/<코드> 형식이면 join 흐름으로 리다이렉트 (로그인 여부 무관).
  // GroupsPage가 ?code=<코드>를 보고 자동으로 가입 모달을 띄움.
  const isJoinCode = JOIN_CODE_RE.test(String(gidParam || ''))

  useEffect(() => {
    if (isJoinCode) {
      navigate(`/groups?code=${encodeURIComponent(String(gidParam).toUpperCase())}`, { replace: true })
    }
  }, [isJoinCode, gidParam, navigate])

  useEffect(() => {
    if (isJoinCode || !user) return
    setError(null)
    loadGroupPage(gid).catch(e => {
      const status = e?.response?.status
      if (status === 403) setError('이 그룹의 멤버가 아니에요')
      else if (status === 404) setError('그룹을 찾을 수 없어요')
      else setError('그룹 정보를 불러오는 데 실패했어요')
    })
    return () => clearDetail()
  }, [gid, user, loadGroupPage, clearDetail, isJoinCode])

  useEffect(() => { if (user) fetchMyGroups() }, [user, fetchMyGroups])

  // user_id → 멤버 정보(searchable 등) lookup. 검색 비허용 사용자 클릭 차단용.
  // 모든 hook은 early-return 이전에 호출돼야 React 규칙 위반이 없음.
  const memberMap = useMemo(() => {
    const m = new Map()
    for (const mem of (detail?.members || [])) m.set(mem.user_id, mem)
    return m
  }, [detail?.members])

  // 모바일 wrapping은 분기마다 반복되므로 헬퍼로 묶음.
  const mobileShell = (content) => (
    <div className="app-mobile">{content}</div>
  )
  const desktopShell = (content) => (
    <div className="app">
      <aside className="side">
        <SidebarBrand />
        <PageNav user={user} />
      </aside>
      <main className="main">{content}</main>
    </div>
  )

  // 비로그인 → 로그인 안내
  if (!user) {
    const inner = (
      <div className="gd-blocked">
        <div className="gd-empty-icon">🔒</div>
        <h3>로그인이 필요해요</h3>
        <p>그룹 상세는 로그인 후에 이용할 수 있어요.</p>
        <button className="gd-btn primary" onClick={openLogin}>로그인</button>
      </div>
    )
    return isMobile ? mobileShell(inner) : desktopShell(inner)
  }

  if (error) {
    const inner = (
      <div className="gd-blocked">
        <div className="gd-empty-icon">⚠️</div>
        <h3>{error}</h3>
        <button className="gd-btn primary" onClick={() => navigate('/groups')}>그룹 목록으로</button>
      </div>
    )
    return isMobile ? mobileShell(inner) : desktopShell(inner)
  }

  if (!detail || detailLoading) {
    const inner = (
      <div className="gd-blocked">
        <div className="gd-empty-icon">⏳</div>
        <h3>불러오는 중…</h3>
      </div>
    )
    return isMobile ? mobileShell(inner) : desktopShell(inner)
  }

  const g = detail
  const isOwner = g.my_role === 'owner'
  const isStaff = isOwner || g.my_role === 'manager'
  const pendingCount = g.applications.length
  const hue = hueOf(g.id)

  const onCopyCode = async () => {
    // 코드만이 아니라 즉시 가입 가능한 URL을 복사 — 받은 사람이 클릭만 하면 가입 모달이 열림.
    const url = `${window.location.origin}/groups/${g.join_code}`
    try {
      await navigator.clipboard.writeText(url)
      alert(`초대 링크가 복사되었어요\n${url}`)
    } catch {
      alert('클립보드 접근에 실패했어요. 직접 복사해주세요:\n' + url)
    }
  }
  const onRegen = async () => {
    if (!confirm('코드를 재발급할까요? 이전 코드는 즉시 무효화됩니다.')) return
    try { const r = await regenCode(g.id); alert(`새 코드: ${r.join_code}`) }
    catch (e) { alert(e?.response?.data?.detail || '실패') }
  }
  const onGoManage = () => setTab('manage')

  if (isMobile) {
    return (
      <div className="app-mobile">
        <GroupDetailMobileHeader
          g={g}
          hue={hue}
          isOwner={isOwner}
          isStaff={isStaff}
          pendingCount={pendingCount}
          onCopyCode={onCopyCode}
          onRegen={onRegen}
          onGoManage={onGoManage}
        />
        <div className="gd-mob-body">
          <TabsStrip
            tab={tab}
            setTab={setTab}
            isStaff={isStaff}
            pendingCount={pendingCount}
            memberCount={g.members.length}
          />
          {tab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} currentUserId={user.id} navigate={navigate} memberMap={memberMap} isMobile />}
          {tab === 'feed' && <FeedTab feed={feed} navigate={navigate} memberMap={memberMap} currentUserId={user.id} />}
          {tab === 'firsts' && <FirstsTab songFirsts={songFirsts} currentUserId={user.id} navigate={navigate} memberMap={memberMap} />}
          {tab === 'members' && <MembersTab g={g} leaderboard={leaderboard} currentUserId={user.id} navigate={navigate} memberMap={memberMap} />}
          {tab === 'manage' && isStaff && <ManageTab g={g} />}
          {tab === 'settings' && <SettingsTab g={g} navigate={navigate} />}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <SidebarBrand />
        <PageNav user={user} />

        <div className="side-section">
          <button className="gd-back-link" onClick={() => navigate('/groups')}>
            <span style={{ fontSize: 11 }}>←</span>
            그룹 목록으로
          </button>
        </div>

        <div className="side-section">
          <div className="side-label">
            <span>내 그룹</span>
            <span className="ct mono">{myGroups.length}</span>
          </div>
          <div className="grp-mini-list">
            {myGroups.map(mg => (
              <div
                key={mg.id}
                className={`grp-mini-item${mg.id === gid ? ' active' : ''}`}
                onClick={() => navigate(`/groups/${mg.id}`)}
              >
                <span
                  className="grp-mini-ic"
                  style={{
                    background: `oklch(0.40 0.10 ${hueOf(mg.id)} / 0.5)`,
                    color: `oklch(0.92 0.05 ${hueOf(mg.id)})`,
                  }}
                >{mg.name[0]}</span>
                <span className="grp-mini-name">{mg.name}</span>
                {mg.my_role === 'owner' && <span className="grp-mini-own">OWN</span>}
                <span className="grp-mini-ct mono">{mg.member_count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="gd-crumb">
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/groups')}>그룹</span>
          <span className="sep">/</span>
          <span style={{ color: 'var(--fg-2)' }}>{g.name}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpButton />
            <UserChip />
          </div>
        </div>

        <div className="gd-body">
          <Hero
            g={g}
            hue={hue}
            isOwner={isOwner}
            isStaff={isStaff}
            pendingCount={pendingCount}
            onCopyCode={onCopyCode}
            onRegen={onRegen}
            onGoManage={onGoManage}
            navigate={navigate}
          />

          <TabsStrip
            tab={tab}
            setTab={setTab}
            isStaff={isStaff}
            pendingCount={pendingCount}
            memberCount={g.members.length}
          />

          {tab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} currentUserId={user.id} navigate={navigate} memberMap={memberMap} />}
          {tab === 'feed' && <FeedTab feed={feed} navigate={navigate} memberMap={memberMap} currentUserId={user.id} />}
          {tab === 'firsts' && <FirstsTab songFirsts={songFirsts} currentUserId={user.id} navigate={navigate} memberMap={memberMap} />}
          {tab === 'members' && <MembersTab g={g} leaderboard={leaderboard} currentUserId={user.id} navigate={navigate} memberMap={memberMap} />}
          {tab === 'manage' && isStaff && <ManageTab g={g} />}
          {tab === 'settings' && <SettingsTab g={g} navigate={navigate} />}
        </div>
      </main>
    </div>
  )
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
        <div className="brand-sub">Group · Detail</div>
      </div>
    </div>
  )
}

function PageNav({ user }) {
  const { openLogin } = useStore()
  return (
    <div className="side-section" style={{ marginTop: 0 }}>
      <div className="side-label"><span>페이지</span></div>
      <div className="page-nav">
        <NavLink to="/" end className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>곡 목록</span></NavLink>
        <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>음악 랭킹</span></NavLink>
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
          <span>음악 카테고리</span>
        </NavLink>
        <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>과거 피망곡</span></NavLink>
        <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
          <span>피드백</span>
        </NavLink>
      </div>
    </div>
  )
}
