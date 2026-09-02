import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useStore from '../store/useStore'
import useGroupsStore from '../store/useGroupsStore'
import UserChip from '../components/UserChip'
import { useMobile } from '../hooks/useMobile'
import GroupDetailMobileHeader from '../components/groups/GroupDetailMobileHeader'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'
import PageNavigation from '../components/PageNavigation'
import { Hero, TabsStrip } from '../components/groups/GroupDetailHeader'
import LeaderboardTab from '../components/groups/GroupLeaderboardTab'
import { FeedTab, FirstsTab, MembersTab } from '../components/groups/GroupActivityTabs'
import { ManageTab, SettingsTab } from '../components/groups/GroupAdminTabs'
import { hueOf } from '../components/groups/groupDetailUtils'

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

  // 가입 코드 경로는 로그인 후에도 이어지도록 가입 화면으로 넘긴다.
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

  const mobileShell = (content) => (
    <div className="app-mobile">{content}</div>
  )
  const desktopShell = (content) => (
    <div className="app">
      <aside className="side">
        <ServerSwitcher />
        <PageNavigation />
      </aside>
      <main className="main">{content}</main>
    </div>
  )

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
          {tab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} currentUserId={user.id} isMobile />}
          {tab === 'feed' && <FeedTab feed={feed} />}
          {tab === 'firsts' && <FirstsTab songFirsts={songFirsts} currentUserId={user.id} />}
          {tab === 'members' && <MembersTab g={g} leaderboard={leaderboard} currentUserId={user.id} />}
          {tab === 'manage' && isStaff && <ManageTab g={g} />}
          {tab === 'settings' && <SettingsTab g={g} navigate={navigate} />}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <ServerSwitcher />
        <PageNavigation />

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
          />

          <TabsStrip
            tab={tab}
            setTab={setTab}
            isStaff={isStaff}
            pendingCount={pendingCount}
            memberCount={g.members.length}
          />

          {tab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} currentUserId={user.id} />}
          {tab === 'feed' && <FeedTab feed={feed} />}
          {tab === 'firsts' && <FirstsTab songFirsts={songFirsts} currentUserId={user.id} />}
          {tab === 'members' && <MembersTab g={g} leaderboard={leaderboard} currentUserId={user.id} />}
          {tab === 'manage' && isStaff && <ManageTab g={g} />}
          {tab === 'settings' && <SettingsTab g={g} navigate={navigate} />}
        </div>
      </main>
    </div>
  )
}
