import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import useStore from '../store/useStore'
import { getAnalyticsSummary } from '../api/client'
import { useMobile } from '../hooks/useMobile'
import { isXyxMode } from '../utils/serverMode'
import ServerSwitcher from '../components/ServerSwitcher'
import MobilePageNav from '../components/MobilePageNav'

const nf = new Intl.NumberFormat('ko-KR')

function fmt(n) {
  return nf.format(Number(n || 0))
}

function PageNav() {
  const xyxMode = isXyxMode()
  const { user, openLogin, isAdmin } = useStore()
  return (
    <aside className="side">
      <ServerSwitcher />
      <div className="side-section">
        <div className="side-label"><span>페이지</span></div>
        <div className="page-nav">
          <NavLink to="/" end className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>곡 목록</span></NavLink>
          {!xyxMode && <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>개인 성과</span></NavLink>}
          {!xyxMode && (
            <NavLink
              to="/groups"
              className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
              onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
            >
              <span>그룹</span>
            </NavLink>
          )}
          <NavLink
            to="/personal-categories"
            className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
            onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
          >
            <span>음악 카테고리</span>
          </NavLink>
          {!xyxMode && <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>과거 피망곡</span></NavLink>}
          {isAdmin && <NavLink to="/removed-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>미출시곡</span></NavLink>}
          {isAdmin && <NavLink to="/analytics" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>접속 통계</span></NavLink>}
          {!xyxMode && <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>피드백</span></NavLink>}
        </div>
      </div>
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

function AnalyticsContent({ data, days, setDays, loading }) {
  const totals = data?.totals || {}
  const series = data?.series || []
  const serverRows = useMemo(() => (data?.servers || []).map(r => ({
    ...r,
    server: ({ kr: '한국', xyx: '중국', pmang: '피망', unknown: '기타' }[r.server] || r.server),
  })), [data])

  return (
    <main className="main ana-main">
      <div className="ana-head">
        <div>
          <div className="ana-eyebrow">ADMIN</div>
          <h1>접속 통계</h1>
          <p>배포 이후부터 수집된 방문 기록입니다. 방문자는 세션 기준으로 집계합니다.</p>
        </div>
        <div className="ana-range">
          {[7, 30, 90].map(v => (
            <button key={v} className={days === v ? 'on' : ''} onClick={() => setDays(v)}>
              {v}일
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="ana-loading">불러오는 중...</div>
      ) : (
        <>
          <div className="ana-stats">
            <Stat label="오늘 방문자" value={totals.today_visitors} sub="KST 기준" />
            <Stat label="오늘 페이지뷰" value={totals.today_pageviews} />
            <Stat label="기간 방문자" value={totals.visitors} sub={`${days}일`} />
            <Stat label="기간 페이지뷰" value={totals.pageviews} sub={`${days}일`} />
            <Stat label="로그인 유저" value={totals.signed_users} />
            <Stat label="최근 15분" value={totals.active_15m} sub="활성 세션" />
          </div>

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
                  <span className="ana-name">{row.path}</span>
                  <span className="ana-pill">{row.server}</span>
                  <span className="ana-pill muted">{row.device}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
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
        : error

  if (blocked) {
    return (
      <div className={isMobile ? 'app-mobile' : 'app'}>
        {isMobile ? <MobilePageNav /> : <PageNav />}
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
        <AnalyticsContent data={data} days={days} setDays={setDays} loading={loading} />
      </div>
    )
  }

  return (
    <div className="app">
      <PageNav />
      <AnalyticsContent data={data} days={days} setDays={setDays} loading={loading} />
    </div>
  )
}
