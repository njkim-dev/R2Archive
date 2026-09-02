import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import useGroupsStore from '../store/useGroupsStore'
import { lookupGroupByCode } from '../api/client'
import UserChip from '../components/UserChip'
import { useMobile } from '../hooks/useMobile'
import GroupsMobileHeader from '../components/groups/GroupsMobileHeader'
import GroupsMobileList from '../components/groups/GroupsMobileList'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'
import PageNavigation from '../components/PageNavigation'

const PENDING_JOIN_KEY = 'r2b_pending_join_code'

function CreateGroupModal({ open, onClose }) {
  const { create } = useGroupsStore()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [autoAccept, setAutoAccept] = useState(true)
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(''); setDesc(''); setAutoAccept(true); setBio('') }
  }, [open])

  if (!open) return null
  const submit = async () => {
    if (name.trim().length < 2 || busy) return
    setBusy(true)
    try {
      const g = await create({ name: name.trim(), description: desc.trim(), auto_accept: autoAccept, bio: bio.trim() })
      onClose()
      alert(`'${g.name}' 그룹을 만들었어요. 가입 코드: ${g.join_code}`)
      navigate(`/groups/${g.id}`)
    } catch (e) {
      alert(e?.response?.data?.detail || '그룹 생성에 실패했어요')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="grp-modal" onClick={e => e.stopPropagation()}>
        <div className="grp-modal-head">
          <h3>새 그룹 만들기</h3>
          <button className="grp-modal-x" onClick={onClose}>×</button>
        </div>
        <div className="grp-modal-body">
          <div className="grp-field">
            <label>그룹 이름</label>
            <input type="text" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="2~40자" autoFocus />
          </div>
          <div className="grp-field">
            <label>설명 (선택)</label>
            <textarea maxLength={240} value={desc} onChange={e => setDesc(e.target.value)} placeholder="최대 240자" />
          </div>
          <div className="grp-field">
            <label>내 한 줄 소개 (선택)</label>
            <input
              type="text" maxLength={80} value={bio} onChange={e => setBio(e.target.value)}
              placeholder="본인을 식별할 수 있을 만한 정보를 입력해주세요(그룹 내 전체 공개됩니다)"
            />
          </div>
          <label className="grp-toggle-row" onClick={() => setAutoAccept(v => !v)}>
            <div className="grp-toggle-meta">
              <b>자동 수락</b>
              <span>코드를 가진 사람의 가입을 즉시 승인합니다. 끄면 owner 수락이 필요합니다.</span>
            </div>
            <div className={`grp-toggle${autoAccept ? ' on' : ''}`} />
          </label>
        </div>
        <div className="grp-modal-foot">
          <button className="grp-btn ghost" onClick={onClose}>취소</button>
          <button className="grp-btn primary" disabled={name.trim().length < 2 || busy} onClick={submit}>
            {busy ? '만드는 중…' : '그룹 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function JoinGroupModal({ open, onClose, initialCode = '' }) {
  const { join } = useGroupsStore()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      const v = (initialCode || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
      setCode(v.length === 9 ? v : '')
      setBio('')
    }
  }, [open, initialCode])

  if (!open) return null

  const onChange = (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/-/g, '')
    if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4, 8)
    setCode(v)
  }

  const submit = async () => {
    if (code.length !== 9 || busy) return
    setBusy(true)
    try {
      const r = await join({ code, bio: bio.trim() })
      onClose()
      if (r.status === 'joined') {
        alert(`'${r.group_name}' 그룹에 가입했어요`)
        navigate(`/groups/${r.group_id}`)
      } else {
        alert(`'${r.group_name}' 그룹에 가입 신청을 보냈어요`)
      }
    } catch (e) {
      alert(e?.response?.data?.detail || '가입에 실패했어요')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="grp-modal" onClick={e => e.stopPropagation()}>
        <div className="grp-modal-head">
          <h3>가입 코드로 입장</h3>
          <button className="grp-modal-x" onClick={onClose}>×</button>
        </div>
        <div className="grp-modal-body">
          <div className="grp-field">
            <label>가입 코드</label>
            <input
              type="text" className="grp-code-input mono" placeholder="A3F7-9K2P"
              value={code} onChange={onChange} maxLength={9} autoComplete="off" autoFocus
            />
          </div>
          <div className="grp-field">
            <label>한 줄 소개 (선택)</label>
            <input
              type="text" maxLength={80} value={bio} onChange={e => setBio(e.target.value)}
              placeholder="본인을 식별할 수 있을 만한 정보를 입력해주세요(그룹 내 전체 공개됩니다)"
            />
          </div>
        </div>
        <div className="grp-modal-foot">
          <button className="grp-btn ghost" onClick={onClose}>취소</button>
          <button className="grp-btn primary" disabled={code.length !== 9 || busy} onClick={submit}>
            {busy ? '처리 중…' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GroupsPage() {
  const isMobile = useMobile()
  const { user, openLogin, isAdmin } = useStore()
  const { myGroups, loaded, fetchMyGroups } = useGroupsStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinInitialCode, setJoinInitialCode] = useState('')

  const consumeJoinCode = useCallback(async (code) => {
    try {
      const data = await lookupGroupByCode(code)
      if (data.is_member) {
        navigate(`/groups/${data.id}`)
      } else {
        setJoinInitialCode(code)
        setJoinOpen(true)
      }
    } catch (e) {
      const status = e?.response?.status
      if (status === 410) alert('폐기된 가입 코드입니다')
      else if (status === 404) alert('유효하지 않은 가입 코드입니다')
      else alert('그룹 정보를 불러오지 못했어요')
    }
  }, [navigate])

  // 가입 코드는 OAuth 왕복 동안 sessionStorage에 보관한다.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    if (!code) return
    navigate('/groups', { replace: true })
    if (user) {
      consumeJoinCode(code)
    } else {
      try { sessionStorage.setItem(PENDING_JOIN_KEY, code) } catch {}
    }
  }, [location.search, user, navigate, consumeJoinCode])

  useEffect(() => {
    if (!user) return
    let pending = null
    try { pending = sessionStorage.getItem(PENDING_JOIN_KEY) } catch {}
    if (pending) {
      try { sessionStorage.removeItem(PENDING_JOIN_KEY) } catch {}
      consumeJoinCode(pending)
    }
  }, [user, consumeJoinCode])

  useEffect(() => {
    if (user) fetchMyGroups()
  }, [user, fetchMyGroups])

  const totalPending = useMemo(
    () => myGroups.filter(g => g.my_role !== 'member').reduce((s, g) => s + (g.pending_count || 0), 0),
    [myGroups],
  )

  if (!user) {
    if (isMobile) {
      return (
        <div className="app-mobile">
          <GroupsMobileHeader onCreate={openLogin} onJoin={openLogin} />
          <div className="grp-mob-empty">
            <div className="grp-empty-icon">🔒</div>
            <h3>로그인이 필요해요</h3>
            <p>그룹 기능은 로그인 후 이용할 수 있어요.</p>
            <button className="grp-btn primary" onClick={openLogin}>로그인</button>
          </div>
        </div>
      )
    }
    return (
      <div className="app">
        <aside className="side">
          <ServerSwitcher />
          <PageNavigation />
        </aside>
        <main className="main">
          <div className="grp-empty">
            <div className="grp-empty-icon">🔒</div>
            <h3>로그인이 필요해요</h3>
            <p>그룹 기능은 로그인 후 이용할 수 있어요.</p>
            <button className="grp-btn primary" onClick={openLogin}>로그인</button>
          </div>
        </main>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="app-mobile">
        <GroupsMobileHeader
          onCreate={() => setCreateOpen(true)}
          onJoin={() => setJoinOpen(true)}
          pendingCount={totalPending}
        />
        <div className="grp-mob-body">
          {!loaded ? (
            <div className="grp-mob-empty"><div className="grp-empty-icon">⏳</div>불러오는 중…</div>
          ) : myGroups.length === 0 ? (
            <div className="grp-mob-empty">
              <div className="grp-empty-icon">🌱</div>
              <h3>아직 가입한 그룹이 없어요</h3>
              <p>새 그룹을 만들거나, 받은 가입 코드로 입장해보세요.<br />그룹은 검색이 불가하며, 코드로만 입장할 수 있어요.</p>
            </div>
          ) : (
            <GroupsMobileList groups={myGroups} />
          )}
        </div>

        <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} />
        <JoinGroupModal
          open={joinOpen}
          onClose={() => { setJoinOpen(false); setJoinInitialCode('') }}
          initialCode={joinInitialCode}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <ServerSwitcher />
        <PageNavigation />

        <div className="side-section">
          <div className="side-label"><span>액션</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="grp-btn primary" onClick={() => setCreateOpen(true)}>+ 새 그룹 만들기</button>
            <button className="grp-btn ghost" onClick={() => setJoinOpen(true)}>가입 코드로 입장</button>
          </div>
        </div>

        <div className="side-section">
          <div className="side-label">
            <span>{isAdmin ? '모든 그룹 (관리자)' : '내 그룹'}</span>
            <span className="ct mono">{myGroups.length}</span>
          </div>
          <div className="grp-mini-list">
            {myGroups.length === 0 ? (
              <div style={{ padding: 10, textAlign: 'center', color: 'var(--fg-4)', fontSize: 11.5 }}>
                아직 가입한 그룹이 없어요
              </div>
            ) : myGroups.map(g => (
              <div key={g.id} className="grp-mini-item" onClick={() => navigate(`/groups/${g.id}`)}>
                <span className="grp-mini-ic">{g.name[0]}</span>
                <span className="grp-mini-name">{g.name}</span>
                {g.my_role === 'owner' && <span className="grp-mini-own">OWN</span>}
                <span className="grp-mini-ct mono">{g.member_count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {isAdmin ? '모든 그룹' : '내 그룹'}
          </h2>
          <span style={{ color: 'var(--fg-3)', fontSize: 12, marginLeft: 4 }}>
            {isAdmin ? '관리자: 모든 그룹을 열람할 수 있어요'
              : totalPending > 0 ? `처리할 신청 ${totalPending}건`
              : '가입한 그룹들의 활동을 확인하세요'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpButton />
            <UserChip />
          </div>
        </div>

        <div className="grp-body">
          {!loaded ? (
            <div className="grp-empty"><div className="grp-empty-icon">⏳</div>불러오는 중…</div>
          ) : myGroups.length === 0 ? (
            <div className="grp-empty">
              <div className="grp-empty-icon">🌱</div>
              <h3>아직 가입한 그룹이 없어요</h3>
              <p>새 그룹을 만들거나, 받은 가입 코드로 입장해보세요.<br />그룹은 검색이 불가하며, 코드로만 입장할 수 있어요.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="grp-btn primary" onClick={() => setCreateOpen(true)}>새 그룹 만들기</button>
                <button className="grp-btn ghost" onClick={() => setJoinOpen(true)}>가입 코드 입력</button>
              </div>
            </div>
          ) : (
            <div className="grp-grid">
              {myGroups.map(g => (
                <div key={g.id} className="grp-card" onClick={() => navigate(`/groups/${g.id}`)}>
                  <div className="grp-card-head">
                    <div className="grp-card-ic">{g.name[0]}</div>
                    <div className="grp-card-title-area">
                      <div className="grp-card-title-row">
                        <span className="grp-card-title">{g.name}</span>
                        <span className={`grp-role-chip ${g.my_role}`}>
                          {g.my_role === 'owner' ? 'OWNER'
                            : g.my_role === 'manager' ? 'MGR'
                            : g.my_role === 'admin' ? 'ADMIN'
                            : 'MEMBER'}
                        </span>
                      </div>
                      <div className="grp-card-code mono">
                        {g.auto_accept ? 'AUTO' : 'MANUAL'}
                        {g.join_code && ` · ${g.join_code}${g.code_revoked ? ' (폐기)' : ''}`}
                      </div>
                    </div>
                  </div>
                  <div className="grp-card-desc">
                    {g.description || <span style={{ color: 'var(--fg-4)' }}>설명이 없어요</span>}
                  </div>
                  <div className="grp-card-stats">
                    <div className="grp-card-stat"><div className="lbl">멤버</div><div className="val">{g.member_count}</div></div>
                    <div className="grp-card-stat">
                      <div className="lbl">대기 신청</div>
                      <div className="val dim">{g.my_role !== 'member' ? g.pending_count : '—'}</div>
                    </div>
                    <div className="grp-card-stat">
                      <div className="lbl">내 역할</div>
                      <div className="val dim" style={{ fontSize: 12 }}>
                        {g.my_role === 'owner' ? '오너'
                          : g.my_role === 'manager' ? '매니저'
                          : g.my_role === 'admin' ? '관리자 뷰'
                          : '멤버'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupModal
        open={joinOpen}
        onClose={() => { setJoinOpen(false); setJoinInitialCode('') }}
        initialCode={joinInitialCode}
      />
    </div>
  )
}
