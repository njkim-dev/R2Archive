import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderPlus, X } from 'lucide-react'
import useStore from '../store/useStore'
import usePersonalCategoriesStore from '../store/usePersonalCategoriesStore'

export default function PersonalCategoryPicker({
  songId,
  className = 'btn btn-ghost',
  children = '개인 카테고리 저장',
  iconOnly = false,
}) {
  const { user, openLogin } = useStore()
  const { editableCategories, fetchEditableCategories, saveSong } = usePersonalCategoriesStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  const openPicker = async (e) => {
    e?.stopPropagation?.()
    if (!user) {
      openLogin()
      return
    }
    if (busy) return
    setBusy(true)
    try {
      const categories = await fetchEditableCategories()
      if (!categories || categories.length === 0) {
        alert('카테고리를 먼저 생성하세요')
        return
      }
      setOpen(true)
    } catch (err) {
      alert(err?.response?.data?.detail || '카테고리 목록을 불러오지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const selectCategory = async (category) => {
    if (busyId) return
    setBusyId(category.id)
    try {
      const result = await saveSong(category.id, songId)
      window.dispatchEvent(new CustomEvent('personal-category-song-saved', { detail: { songId, categoryId: category.id } }))
      showToast(result.added
        ? `'${category.name}'에 저장했어요`
        : `'${category.name}'에 이미 저장된 곡이에요`)
      setOpen(false)
    } catch (err) {
      alert(err?.response?.data?.detail || '개인 카테고리 저장에 실패했어요')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title="개인 카테고리 저장"
        aria-label="개인 카테고리 저장"
        onClick={openPicker}
      >
        <FolderPlus size={iconOnly ? 15 : 14} />
        {!iconOnly && <span>{busy ? '불러오는 중...' : children}</span>}
      </button>

      {open && createPortal(
        <div className="pcat-picker-backdrop" onClick={e => e.stopPropagation()}>
          <div className="pcat-picker" onClick={e => e.stopPropagation()}>
            <div className="pcat-picker-head">
              <div>
                <h3>개인 카테고리 저장</h3>
                <p>저장할 카테고리를 선택하세요.</p>
              </div>
              <button className="pcat-picker-close" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <div className="pcat-picker-list">
              {editableCategories.map(category => (
                <button
                  key={category.id}
                  className="pcat-picker-item"
                  disabled={busyId != null}
                  onClick={() => selectCategory(category)}
                >
                  <span className="pcat-picker-avatar">{category.name[0] || 'C'}</span>
                  <span className="pcat-picker-meta">
                    <b>{category.name}</b>
                    <span>{category.is_public ? '공개' : '비공개'} · {category.song_count || 0}곡</span>
                  </span>
                  <span className="pcat-picker-code mono">{category.category_code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {toast && createPortal(
        <div className="pcat-toast" role="status" aria-live="polite">
          {toast}
        </div>,
        document.body,
      )}
    </>
  )
}
