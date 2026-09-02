import { fmtRel, roleLabel } from './groupDetailUtils'

export function Hero({ g, hue, isOwner, isStaff, pendingCount, onCopyCode, onRegen, onGoManage }) {
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

export function TabsStrip({ tab, setTab, isStaff, pendingCount, memberCount }) {
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
