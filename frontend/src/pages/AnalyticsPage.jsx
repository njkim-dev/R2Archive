import { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import { getAnalyticsSummary } from '../api/client'
import { useMobile } from '../hooks/useMobile'
import ServerSwitcher from '../components/ServerSwitcher'
import MobilePageNav from '../components/MobilePageNav'
import PageNavigation from '../components/PageNavigation'
import ArchiveBrand from '../components/ArchiveBrand'

const nf = new Intl.NumberFormat('ko-KR')

function fmt(n) {
  return n === null ? '—' : nf.format(Number(n || 0))
}

function AnalyticsSidebar() {
  return (
    <aside className="side">
      <ArchiveBrand />
      <ServerSwitcher />
      <PageNavigation />
    </aside>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="ana-stat">
      <div className="ana-stat-label">{label}</div>
      <div className="ana-stat-value">{fmt(value)}</div>
      {sub && <div className="ana-stat-sub">{sub}</div>}
    </div>
  )
}

function SeriesChart({ rows }) {
  const max = Math.max(...rows.map(r => Number(r.pageviews || 0)), 1)
  return (
    <div className="ana-chart">
      {rows.map(row => {
        const h = Math.max(4, Math.round(Number(row.pageviews || 0) / max * 100))
        return (
          <div key={row.day} className="ana-bar-wrap" title={`${row.day} · ${fmt(row.pageviews)} PV · ${fmt(row.visitors)} 방문`}>
            <div className="ana-bar" style={{ height: `${h}%` }} />
            <span>{row.day.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

function TopList({ title, rows, primaryKey = 'path', secondaryKey = 'visitors' }) {
  return (
    <section className="ana-panel">
      <h2>{title}</h2>
      <div className="ana-list">
        {rows.length === 0 ? (
          <div className="ana-empty">아직 기록이 없습니다</div>
        ) : rows.map((row, i) => (
          <div key={`${row[primaryKey]}-${i}`} className="ana-list-row">
            <span className="ana-rank">{i + 1}</span>
            <span className="ana-name" title={row[primaryKey]}>{row[primaryKey]}</span>
            <span className="ana-num">{fmt(row.pageviews)}</span>
            {secondaryKey && <span className="ana-subnum">{fmt(row[secondaryKey])}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function DomainStats({ data }) {
  const rows = ['r2archive.com', 'music.r2archive.com', 'xyx.r2archive.com', 'unknown'].map(domain => ({
    domain, ...(data?.domains || []).find(row => row.domain === domain),
  }))
  return <section className="ana-domains" aria-label="도메인별 접속 통계">
    <div className="ana-panel">
      <h2>도메인별 접속</h2>
      <table className="ana-domain-table">
        <thead><tr><th>접속 도메인</th><th>페이지뷰</th><th>방문자</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.domain}><th scope="row">{row.domain === 'unknown' ? '도메인 미구분' : row.domain}</th><td>{fmt(data ? row.pageviews || 0 : null)}</td><td>{fmt(data ? row.visitors || 0 : null)}</td></tr>)}</tbody>
      </table>
      <p className="ana-domain-note">도메인 구분은 기능 반영 이후 기록부터 제공됩니다. 이전 기록은 도메인 미구분으로 표시하며, 여러 도메인을 방문하면 각각 집계됩니다.</p>
    </div>
    <div className="ana-panel ana-transition">
      <h2>메인 → 음악 아카이브 이동</h2>
      <strong>{fmt(data ? data.main_to_music?.visitors || 0 : null)}<small>명</small></strong>
      <p>메인페이지에서 음악 아카이브로 이동한 방문자입니다. 선택한 기간 내 중복 방문은 한 번으로 집계합니다.</p>
    </div>
  </section>
}

function AnalyticsContent({ data, days, setDays, loading, error }) {
  const totals = data?.totals || {}
  const series = data?.series || []
  const serverRows = useMemo(() => (data?.servers || []).map(r => ({
    ...r,
    server: ({ kr: '한국', xyx: '중국', pmang: '피망', unknown: '기타' }[r.server] || r.server),
  })), [data])

  return (
    <main className="main ana-main" aria-busy={loading}>
      <div className="ana-head">
        <div>
          <div className="ana-eyebrow">ADMIN</div>
          <h1>접속 통계</h1>
          <p>방문자는 로그인 계정 또는 브라우저 식별값 기준으로 집계합니다.</p>
        </div>
        <div className="ana-range">
          {[7, 30, 90].map(v => (
            <button key={v} className={days === v ? 'on' : ''} onClick={() => setDays(v)}>
              {v}일
            </button>
          ))}
        </div>
      </div>

      <div className="ana-status" role="status">{error || (loading ? (data ? '새 기간을 불러오는 중… 현재는 이전 조회 결과입니다.' : '접속 통계를 불러오는 중…') : '선택한 기간의 접속 통계입니다.')}</div>
        <>
          <div className="ana-stats">
            <Stat label="오늘 방문자" value={data ? totals.today_visitors : null} sub="KST 기준" />
            <Stat label="오늘 페이지뷰" value={data ? totals.today_pageviews : null} />
            <Stat label="기간 방문자" value={data ? totals.visitors : null} sub={`${data?.days || days}일`} />
            <Stat label="기간 페이지뷰" value={data ? totals.pageviews : null} sub={`${data?.days || days}일`} />
            <Stat label="로그인 유저" value={data ? totals.signed_users : null} />
            <Stat label="최근 15분" value={data ? totals.active_15m : null} sub="활성 세션" />
          </div>

          <DomainStats data={data} />
          <section className="ana-panel ana-wide">
            <h2>일자별 추이</h2>
            <SeriesChart rows={series} />
          </section>

          <div className="ana-grid">
            <TopList title="많이 본 페이지" rows={data?.pages || []} />
            <TopList title="서버별" rows={serverRows} primaryKey="server" />
            <TopList title="기기별" rows={data?.devices || []} primaryKey="device" />
            <TopList title="유입" rows={data?.referrers || []} primaryKey="referrer" secondaryKey={null} />
          </div>

          <section className="ana-panel ana-wide">
            <h2>최근 접속</h2>
            <div className="ana-recent">
              {(data?.recent || []).map((row, i) => (
                <div key={`${row.at}-${i}`} className="ana-recent-row">
                  <span className="ana-time">{row.at}</span>
                  <div className="ana-visit">
                    <span className="ana-visitor" title={row.nickname || (row.user_id ? '닉네임 없음' : '비로그인')}>{row.nickname || (row.user_id ? '닉네임 없음' : '비로그인')}</span>
                    <span className="ana-name" title={row.path}>{row.path}</span>
                  </div>
                  <span className="ana-pill">{row.server}</span>
                  <span className="ana-pill muted">{row.device}</span>
                </div>
              ))}
            </div>
          </section>
        </>
    </main>
  )
}

export default function AnalyticsPage() {
  const isMobile = useMobile()
  const { authLoaded, user, isAdmin, openLogin } = useStore()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoaded || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getAnalyticsSummary(days)
      .then(res => { if (!cancelled) setData(res) })
      .catch(err => { if (!cancelled) setError(err?.response?.data?.detail || err?.message || '불러오기 실패') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authLoaded, isAdmin, days])

  const blocked = !authLoaded
    ? '불러오는 중...'
    : !user
      ? '로그인이 필요합니다'
      : !isAdmin
        ? '관리자 권한이 필요합니다'
        : null

  if (blocked) {
    return (
      <div className={isMobile ? 'app-mobile' : 'app'}>
        {isMobile ? <MobilePageNav /> : <AnalyticsSidebar />}
        <main className="main ana-main">
          <div className="grp-empty pcat-empty-list">
            <div className="grp-empty-icon">!</div>
            <h3>{blocked}</h3>
            {!user && authLoaded && <button className="gd-btn primary" onClick={openLogin}>로그인</button>}
          </div>
        </main>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="app-mobile">
        <MobilePageNav />
        <AnalyticsContent data={data} days={days} setDays={setDays} loading={loading} error={error} />
      </div>
    )
  }

  return (
    <div className="app">
      <AnalyticsSidebar />
      <AnalyticsContent data={data} days={days} setDays={setDays} loading={loading} error={error} />
    </div>
  )
}
