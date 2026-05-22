import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Eye, ShieldCheck, Trash2, Users } from 'lucide-react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { getPersonalCategoryByCode } from '../api/client'
import useStore from '../store/useStore'
import usePersonalCategoriesStore from '../store/usePersonalCategoriesStore'
import UserChip from '../components/UserChip'
import MobilePageNav from '../components/MobilePageNav'
import { useMobile } from '../hooks/useMobile'

function roleLabel(role) {
  if (role === 'editor') return '수정 가능'
  if (role === 'viewer') return '보기 전용'
  return role || '보기 전용'
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
        <div className="brand-sub">Subscribers</div>
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
        <NavLink to="/rankings" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>판정 랭킹</span></NavLink>
        <NavLink
          to="/groups"
          className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}
          onClick={(e) => { if (!user) { e.preventDefault(); openLogin() } }}
        >
          <span>그룹</span>
        </NavLink>
        <NavLink to="/personal-categories" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}>
          <span>개인 카테고리</span>
        </NavLink>
        <NavLink to="/pmang-songs" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>과거 피망곡</span></NavLink>
        <NavLink to="/feedback" className={({ isActive }) => `page-nav-item${isActive ? ' active' : ''}`}><span>피드백</span></NavLink>
      </div>
    </div>
  )
}

function SubscribersList({ category, members, onRole, onRemove, busyKey }) {
  if (!category?.can_manage) {
    return (
      <div className="grp-empty pcat-empty-list">
        <div className="grp-empty-icon"><Users size={42} /></div>
        <h3>관리 권한이 필요해요</h3>
        <p>카테고리 소유자만 구독 사용자를 관리할 수 있어요.</p>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="grp-empty pcat-empty-list">
        <div className="grp-empty-icon"><Users size={42} /></div>
        <h3>아직 구독한 사용자가 없어요</h3>
        <p>링크로 접속한 사용자가 구독하면 여기에 표시돼요.</p>
      </div>
    )
  }

  return (
    <div className="pcat-subscriber-list">
      {members.map(member => (
        <div key={member.user_id} className="pcat-subscriber-row">
          <div className="pcat-member-avatar">{(member.nickname || '?')[0]}</div>
          <div className="pcat-member-meta">
            <b>{member.nickname || '익명'}</b>
            <span>구독 · {roleLabel(member.role)}</span>
          </div>
          <div className="pcat-member-actions">
            <button
              className={member.role === 'viewer' ? 'active' : ''}
              disabled={busyKey != null || member.role === 'viewer'}
              onClick={() => onRole(member, 'viewer')}
              title="보기 전용으로 변경"
              aria-label="보기 전용으로 변경"
            >
              <Eye size={14} />
            </button>
            <button
              className={member.role === 'editor' ? 'active' : ''}
              disabled={busyKey != null || member.role === 'editor'}
              onClick={() => onRole(member, 'editor')}
              title="수정 가능으로 변경"
              aria-label="수정 가능으로 변경"
            >
              <ShieldCheck size={14} />
            </button>
            <button
              className="danger"
              disabled={busyKey != null}
              onClick={() => onRemove(member)}
              title="구독자 삭제"
              aria-label="구독자 삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PersonalCategorySubscribersPage() {
  const isMobile = useMobile()
  const navigate = useNavigate()
  const { code } = useParams()
  const { user, openLogin } = useStore()
  const { updateMemberRole, removeMember } = usePersonalCategoriesStore()
  const [category, setCategory] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return getPersonalCategoryByCode(code)
      .then(data => {
        setCategory(data.category)
        setMembers(data.members || [])
      })
      .catch(e => {
        const status = e?.response?.status
        setError(status === 404 ? '카테고리를 찾을 수 없습니다' : '구독 사용자 정보를 불러오지 못했어요')
      })
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    load()
  }, [load])

  const changeRole = async (member, role) => {
    if (member.role === role || busyKey) return
    setBusyKey(`${member.user_id}:${role}`)
    try {
      const updated = await updateMemberRole(category.id, member.user_id, role)
      setMembers(prev => prev.map(item => item.user_id === member.user_id ? { ...item, role: updated.role } : item))
    } catch (e) {
      alert(e?.response?.data?.detail || '권한 변경에 실패했어요')
    } finally {
      setBusyKey(null)
    }
  }

  const deleteSubscriber = async (member) => {
    if (busyKey) return
    if (!confirm(`${member.nickname || '이 사용자'}님의 구독을 삭제할까요?`)) return
    setBusyKey(`${member.user_id}:delete`)
    try {
      await removeMember(category.id, member.user_id)
      setMembers(prev => prev.filter(item => item.user_id !== member.user_id))
    } catch (e) {
      alert(e?.response?.data?.detail || '구독자 삭제에 실패했어요')
    } finally {
      setBusyKey(null)
    }
  }

  const body = loading || error || !category ? (
    <div className="gd-blocked">
      <div className="gd-empty-icon">⚠</div>
      <h3>{error || '구독 사용자 정보를 불러오는 중...'}</h3>
      {error && <button className="gd-btn primary" onClick={() => navigate(`/personal-categories/${code}`)}>카테고리로</button>}
    </div>
  ) : (
    <SubscribersList
      category={category}
      members={members}
      onRole={changeRole}
      onRemove={deleteSubscriber}
      busyKey={busyKey}
    />
  )

  if (isMobile) {
    return (
      <div className="app-mobile">
        <header className="mob-top pcat-mobile-head">
          <div className="mob-top-inner">
            <div className="mob-top-row">
              <div className="mob-app-title">구독 <b>사용자 관리</b></div>
              {user ? (
                <button className="mob-icon-btn" onClick={() => navigate(`/personal-categories/${code}`)} title="카테고리로">
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <button className="mob-icon-btn" onClick={openLogin} title="로그인" style={{ width: 'auto', padding: '0 10px', fontSize: 13 }}>
                  로그인
                </button>
              )}
            </div>
            <MobilePageNav />
          </div>
        </header>
        <div className="pcat-subscriber-mobile-body">{body}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <SidebarBrand />
        <PageNav user={user} />
        <div className="side-section">
          <button className="gd-back-link" onClick={() => navigate(`/personal-categories/${code}`)}>
            <span style={{ fontSize: 11 }}>←</span>
            카테고리로
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="pcat-top-title">
            <h2>구독 사용자 관리</h2>
            {category && <span className="mono pcat-code">{category.category_code}</span>}
          </div>
          {category && (
            <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {category.name} · {members.length.toLocaleString()}명
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {user ? <UserChip /> : <button className="gd-btn ghost sm" onClick={openLogin}>로그인</button>}
          </div>
        </div>
        <div className="pcat-subscriber-body">{body}</div>
      </main>
    </div>
  )
}
