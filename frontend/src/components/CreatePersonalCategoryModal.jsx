import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import usePersonalCategoriesStore from '../store/usePersonalCategoriesStore'
import CategoryCollaborationToggles from './CategoryCollaborationToggles'

const PENDING_CATEGORY_CREATE_KEY = 'r2b_pending_category_create'

export function queueCategoryCreateAfterLogin(source = 'directory') {
  try { sessionStorage.setItem(PENDING_CATEGORY_CREATE_KEY, source) } catch {}
}

export function takePendingCategoryCreate() {
  try {
    const source = sessionStorage.getItem(PENDING_CATEGORY_CREATE_KEY)
    if (!source) return null
    sessionStorage.removeItem(PENDING_CATEGORY_CREATE_KEY)
    return source === 'filter' ? 'filter' : 'directory'
  } catch {
    return null
  }
}

export default function CreatePersonalCategoryModal() {
  const navigate = useNavigate()
  const {
    categoryCreateOpen: open,
    categoryCreateSource: source,
    closeCategoryCreate,
    openMobileSheet,
    refreshPersonalCategoryFilters,
  } = useStore()
  const { create } = usePersonalCategoriesStore()
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [allowContributions, setAllowContributions] = useState(false)
  const [allowEdits, setAllowEdits] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setIsPublic(true)
    setAllowContributions(false)
    setAllowEdits(false)
    setBusy(false)
  }, [open])

  if (!open) return null

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const category = await create({
        name: trimmed,
        is_public: isPublic,
        allow_contributions: allowContributions,
        allow_edits: allowEdits,
      })
      if (source === 'filter') await refreshPersonalCategoryFilters()
      closeCategoryCreate()
      alert(`'${category.name}' 카테고리를 만들었어요.\n카테고리 코드: ${category.category_code}`)
      if (source === 'filter') openMobileSheet()
      else navigate(`/personal-categories/${category.category_code}`)
    } catch (error) {
      alert(error?.response?.data?.detail || '카테고리 생성에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={closeCategoryCreate}>
      <div className="grp-modal" onClick={event => event.stopPropagation()}>
        <div className="grp-modal-head">
          <h3>카테고리 만들기</h3>
          <button className="grp-modal-x" onClick={closeCategoryCreate} aria-label="닫기">×</button>
        </div>
        <div className="grp-modal-body">
          <div className="grp-field">
            <label>카테고리 이름</label>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="예: 오늘 들을 곡"
              autoFocus
            />
          </div>
          <label className="grp-toggle-row" onClick={() => setIsPublic(value => !value)}>
            <div className="grp-toggle-meta">
              <b>공개 카테고리</b>
              <span>비공개여도 링크를 받은 사람이나 구독자는 볼 수 있어요.</span>
            </div>
            <div className={`grp-toggle${isPublic ? ' on' : ''}`} />
          </label>
          <CategoryCollaborationToggles
            allowContributions={allowContributions}
            allowEdits={allowEdits}
            onAllowContributions={setAllowContributions}
            onAllowEdits={setAllowEdits}
          />
        </div>
        <div className="grp-modal-foot">
          <button className="grp-btn ghost" onClick={closeCategoryCreate}>취소</button>
          <button className="grp-btn primary" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? '만드는 중...' : '카테고리 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
