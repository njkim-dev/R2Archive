import { useEffect, useRef, useState } from 'react'
import useRankingsStore from '../../store/useRankingsStore'
import useStore from '../../store/useStore'
import UserSearchList from './UserSearchList'
import { HelpButton } from '../HelpTour'
import ScreenshotRegisterButton from '../ScreenshotRegisterButton'

const SEARCH_MODES = [
  { key: 'song', label: '곡명 + 아티스트' },
  { key: 'user', label: '사용자' },
]

function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const update = () => setWidth(node.getBoundingClientRect().width)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect?.width
      if (nextWidth != null) setWidth(nextWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export default function RankingsTopBar({ filteredCount, totalCount }) {
  const {
    search, setSearch, searchMode, setSearchMode, sort, pinnedUser,
    editMode, enableEditMode, disableEditMode, dirty, saving, saveDirty,
  } = useRankingsStore()
  const { user, openLogin, logout, openOnboarding, openMyPage } = useStore()

  const dirtyCount = dirty.size

  const handleEditToggle = (e) => {
    if (e.target.checked) {
      if (!user) { openLogin(); e.target.checked = false; return }
      const ok = window.confirm(
        '편집 모드에서 입력한 판정은 유튜브 링크를 등록한 것에 한해서만 개인 성과에 반영되며,\n' +
        '영상 링크가 없는 성과는 본인 확인 혹은 다른 사람이 본인 닉네임을 검색하여 확인할 수만 있습니다. 계속 하시겠습니까?'
      )
      if (!ok) { e.target.checked = false; return }
      enableEditMode()
    } else {
      if (dirtyCount > 0) {
        const ok = window.confirm('저장하지 않은 변경분이 있어요. 편집 모드를 종료할까요?')
        if (!ok) { e.target.checked = true; return }
      }
      disableEditMode()
    }
  }

  const handleSave = async () => {
    if (saving || dirtyCount === 0) return
    try {
      const r = await saveDirty()
      if (r.ok === false && r.invalidUrls) {
        // 422: 잘못된 URL이 포함됨 → 모달은 store가 띄움
        return
      }
      if (r.ok === false && r.urlOnlyWithoutJudgment?.length) {
        alert(`${r.urlOnlyWithoutJudgment.length}곡은 점수를 함께 입력해야 등록됩니다.\n해당 행은 무시됐어요.`)
        return
      }
      if (r.sent > 0) {
        let msg = `${r.sent}곡 저장했어요`
        if (r.urlOnlyWithoutJudgment?.length) {
          msg += `\n(${r.urlOnlyWithoutJudgment.length}곡은 점수가 비어있어 무시됨)`
        }
        alert(msg)
      } else {
        alert('변경된 항목이 없어요')
      }
    } catch {
      alert('저장에 실패했어요. 잠시 후 다시 시도해주세요')
    }
  }
  const inputRef = useRef(null)
  const [modeOpen, setModeOpen] = useState(false)
  const modeRef = useRef(null)
  const searchWrapRef = useRef(null)
  const [userListOpen, setUserListOpen] = useState(false)
  const [topbarRef, topbarWidth] = useElementWidth()

  useEffect(() => {
    const onClick = (e) => {
      if (modeRef.current && !modeRef.current.contains(e.target)) setModeOpen(false)
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setUserListOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // 사용자가 핀되면 팝오버 닫기
  useEffect(() => { if (pinnedUser) setUserListOpen(false) }, [pinnedUser])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const currentMode = SEARCH_MODES.find(m => m.key === searchMode) ?? SEARCH_MODES[0]

  const sortLabels = {
    idx: '신곡', name: '곡명', artist: '아티스트',
    level: '난이도', bpm: 'BPM', combo: '콤보',
    rankScore: '성과 판정', myScore: '내 판정',
  }

  const hideHelp = topbarWidth > 0 && topbarWidth < 980
  const topbarClassName = ['topbar', 'rankings-topbar', hideHelp && 'hide-help'].filter(Boolean).join(' ')

  return (
    <div ref={topbarRef} className={topbarClassName}>
      <div className="search" ref={searchWrapRef}>
        <div className="search-mode" ref={modeRef}>
          <button
            type="button"
            className="search-mode-btn"
            onClick={() => setModeOpen(v => !v)}
          >
            <span className="search-mode-label">{currentMode.label}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {modeOpen && (
            <div className="search-mode-menu">
              {SEARCH_MODES.map(m => (
                <button
                  key={m.key}
                  type="button"
                  className={`search-mode-item${m.key === searchMode ? ' active' : ''}`}
                  onClick={() => { setSearchMode(m.key); setModeOpen(false); inputRef.current?.focus() }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder={`${currentMode.label}(으)로 검색…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setUserListOpen(true)}
        />
        {/* 검색어가 있을 때만 popover 노출 — 빈 상태에서 '닉네임을 입력하세요' 박스가
            모드 드롭다운을 가로막던 문제 해결 */}
        {searchMode === 'user' && userListOpen && search.trim() && (
          <div className="user-search-popover">
            <UserSearchList />
          </div>
        )}
      </div>

      <div className="topbar-meta">
        <HelpButton className="topbar-help-control" />
        <span className="count">
          <b>{filteredCount.toLocaleString()}</b>
          {' '}<span style={{ color: 'var(--fg-3)' }}>/ {totalCount.toLocaleString()} 곡</span>
        </span>
        <span style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />
        <span>
          정렬: <b className="mono" style={{ color: 'var(--fg)' }}>
            {sortLabels[sort.key] ?? sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
          </b>
        </span>
      </div>

      <ScreenshotRegisterButton className="reg-btn rankings-reg-btn" />

      <label className="edit-toggle" title="내 판정을 직접 입력하는 편집 모드">
        <input type="checkbox" checked={editMode} onChange={handleEditToggle} />
        <span>편집 모드</span>
      </label>
      {editMode && (
        <button
          type="button"
          className="save-btn"
          onClick={handleSave}
          disabled={saving || dirtyCount === 0}
          title={dirtyCount === 0 ? '변경된 항목이 없어요' : `${dirtyCount}곡 저장`}
        >
          {saving ? '저장 중…' : `저장${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
        </button>
      )}

      {user ? (
        <div className="user-chip">
          <button type="button" className="user-chip-open" onClick={openMyPage} title="마이페이지">
            <div className="user-avatar">{((user.nickname || '?')[0] || '?').toUpperCase()}</div>
            <span className="user-name">{user.nickname || '...'}</span>
          </button>
          <button className="user-logout" onClick={openOnboarding} title="프로필 수정" style={{ marginRight: 2 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button className="user-logout" onClick={logout} title="로그아웃">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      ) : (
        <button className="login-btn" onClick={openLogin}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          로그인
        </button>
      )}
    </div>
  )
}
