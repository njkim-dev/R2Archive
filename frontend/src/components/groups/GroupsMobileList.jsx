import { useNavigate } from 'react-router-dom'

export default function GroupsMobileList({ groups }) {
  const navigate = useNavigate()
  if (!groups || groups.length === 0) return null

  return (
    <div className="grp-mob-list">
      {groups.map(g => {
        const roleLabel = g.my_role === 'owner' ? 'OWNER'
          : g.my_role === 'manager' ? 'MGR'
          : g.my_role === 'admin' ? 'ADMIN'
          : 'MEMBER'
        return (
          <div key={g.id} className="grp-mob-card" onClick={() => navigate(`/groups/${g.id}`)}>
            <div className="grp-mob-card-head">
              <div className="grp-mob-card-ic">{g.name[0]}</div>
              <div className="grp-mob-card-titles">
                <div className="grp-mob-card-row">
                  <span className="grp-mob-card-title">{g.name}</span>
                  <span className={`grp-role-chip ${g.my_role}`}>{roleLabel}</span>
                </div>
                <div className="grp-mob-card-meta mono">
                  {g.auto_accept ? 'AUTO' : 'MANUAL'}
                  {g.join_code && ` · ${g.join_code}${g.code_revoked ? ' (폐기)' : ''}`}
                </div>
              </div>
            </div>
            {g.description && (
              <div className="grp-mob-card-desc">{g.description}</div>
            )}
            <div className="grp-mob-card-stats">
              <div className="grp-mob-stat">
                <span className="lbl">멤버</span>
                <span className="val mono">{g.member_count}</span>
              </div>
              {g.my_role !== 'member' && (
                <div className="grp-mob-stat">
                  <span className="lbl">대기</span>
                  <span className={`val mono${g.pending_count > 0 ? ' hot' : ''}`}>
                    {g.pending_count}
                  </span>
                </div>
              )}
              <div className="grp-mob-stat">
                <span className="lbl">랭킹곡</span>
                <span className="val mono">{g.ranked_song_count || 0}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
