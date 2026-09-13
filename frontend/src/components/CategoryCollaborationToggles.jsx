function ToggleRow({ title, description, checked, disabled = false, onChange }) {
  return (
    <button
      type="button"
      className="grp-toggle-row pcat-collaboration-toggle"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="grp-toggle-meta">
        <b>{title}</b>
        <span>{description}</span>
      </span>
      <span className={`grp-toggle${checked ? ' on' : ''}`} aria-hidden="true" />
    </button>
  )
}

export default function CategoryCollaborationToggles({
  allowContributions,
  allowEdits,
  onAllowContributions,
  onAllowEdits,
}) {
  const changeEdits = (next) => {
    onAllowEdits(next)
    if (next) onAllowContributions(true)
  }

  return (
    <div className="pcat-collaboration-settings">
      <ToggleRow
        title="다른 사람이 내 카테고리에 음악 추가를 허용합니다."
        description={allowEdits ? '다른 사람의 편집을 허용하는 동안 항상 활성화됩니다.' : '로그인한 사용자가 이 카테고리에 곡을 추가할 수 있어요.'}
        checked={allowContributions}
        disabled={allowEdits}
        onChange={onAllowContributions}
      />
      <ToggleRow
        title="다른 사람의 내 카테고리 편집을 허용합니다."
        description="로그인한 사용자가 이 카테고리의 곡을 추가하거나 삭제할 수 있어요."
        checked={allowEdits}
        onChange={changeEdits}
      />
    </div>
  )
}
