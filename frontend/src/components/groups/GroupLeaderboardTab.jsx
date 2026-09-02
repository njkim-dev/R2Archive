import { useMemo, useState } from 'react'
import { fmtRel, judgeColor } from './groupDetailUtils'

export default function LeaderboardTab({ leaderboard, currentUserId, isMobile = false }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })

  // 평균 판정, 플레이한 곡 수와 99% 이상 성과를 함께 반영한다.
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
