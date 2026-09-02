import { useEffect, useState } from 'react'
import useGroupsStore from '../../store/useGroupsStore'
import { fmtRel } from './groupDetailUtils'

export function ManageTab({ g }) {
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

export function SettingsTab({ g, navigate }) {
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
