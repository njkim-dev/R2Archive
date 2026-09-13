import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, FolderPlus, Globe2, Lock, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import usePersonalCategoriesStore from '../store/usePersonalCategoriesStore'
import UserChip from '../components/UserChip'
import MobilePageNav from '../components/MobilePageNav'
import { useMobile } from '../hooks/useMobile'
import { HelpButton } from '../components/HelpTour'
import ServerSwitcher from '../components/ServerSwitcher'
import PageNavigation from '../components/PageNavigation'
import CategoryCollaborationToggles from '../components/CategoryCollaborationToggles'

function fmtDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function categoryLink(category) {
  return `${window.location.origin}/personal-categories/${category.category_code}`
}

function mergeCategories(...groups) {
  const categories = new Map()
  groups.flat().forEach(category => categories.set(category.id, category))
  return [...categories.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

function roleLabel(category) {
  if (category.my_role === 'owner') return '소유'
  if (category.my_role === 'editor') return '수정 가능'
  if (category.my_role === 'viewer') return '구독'
  if (category.my_role === 'admin') return '관리자'
  return '공개'
}

function CreateCategoryModal({ open, onClose }) {
  const navigate = useNavigate()
  const { create } = usePersonalCategoriesStore()
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [allowContributions, setAllowContributions] = useState(false)
  const [allowEdits, setAllowEdits] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setIsPublic(true)
      setAllowContributions(false)
      setAllowEdits(false)
      setBusy(false)
    }
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
      onClose()
      alert(`'${category.name}' 카테고리를 만들었어요.\n카테고리 코드: ${category.category_code}`)
      navigate(`/personal-categories/${category.category_code}`)
    } catch (e) {
      alert(e?.response?.data?.detail || '카테고리 생성에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="grp-modal" onClick={e => e.stopPropagation()}>
        <div className="grp-modal-head">
          <h3>카테고리 만들기</h3>
          <button className="grp-modal-x" onClick={onClose}>×</button>
        </div>
        <div className="grp-modal-body">
          <div className="grp-field">
            <label>카테고리 이름</label>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 오늘 들을 곡"
              autoFocus
            />
          </div>
          <label className="grp-toggle-row" onClick={() => setIsPublic(v => !v)}>
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
          <button className="grp-btn ghost" onClick={onClose}>취소</button>
          <button className="grp-btn primary" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? '만드는 중...' : '카테고리 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CategoryCard({ category, onCopy, onOpen }) {
  return (
    <div className="grp-card pcat-card" onClick={() => onOpen(category)}>
      <div className="grp-card-head">
        <div className="grp-card-ic pcat-card-ic">{category.name[0] || 'C'}</div>
        <div className="grp-card-title-area">
          <div className="grp-card-title-row">
            <span className="grp-card-title">{category.name}</span>
            <span className={`pcat-visibility ${category.is_public ? 'public' : 'private'}`}>
              {category.is_public ? <Globe2 size={12} /> : <Lock size={12} />}
              {category.is_public ? '공개' : '비공개'}
            </span>
            <span className={`pcat-role ${category.my_role || 'guest'}`}>{roleLabel(category)}</span>
          </div>
          <div className="grp-card-code mono">{category.category_code}</div>
        </div>
      </div>
      <div className="grp-card-desc">
        {category.owner_nickname || '익명'}님의 카테고리입니다.
      </div>
      <div className="grp-card-stats">
        <div className="grp-card-stat"><div className="lbl">곡</div><div className="val">{category.song_count}</div></div>
        <div className="grp-card-stat"><div className="lbl">생성</div><div className="val dim">{fmtDate(category.created_at)}</div></div>
        <div className="grp-card-stat pcat-card-actions">
          <button className="pcat-card-btn" onClick={(e) => { e.stopPropagation(); onCopy(category) }} title="카테고리 링크 복사">
            <Copy size={14} />
            복사
          </button>
          <button className="pcat-card-btn" onClick={(e) => { e.stopPropagation(); onOpen(category) }} title="카테고리 열기">
            <ExternalLink size={14} />
            열기
          </button>
        </div>
      </div>
    </div>
  )
}

function Tabs({ activeTab, setActiveTab, counts, user }) {
  const tabs = [
    { key: 'all', label: '전체 카테고리', count: counts.all },
    { key: 'mine', label: '내 카테고리', count: counts.mine, needLogin: true },
    { key: 'public', label: '공개 카테고리', count: counts.public },
    { key: 'subscribed', label: '구독한 카테고리', count: counts.subscribed, needLogin: true },
  ]
  return (
    <div className="pcat-tabs">
      {tabs.map(tab => {
        const disabled = tab.needLogin && !user
        return (
          <button
            key={tab.key}
            className={`pcat-tab${activeTab === tab.key ? ' on' : ''}${disabled ? ' disabled' : ''}`}
            onClick={() => !disabled && setActiveTab(tab.key)}
            title={disabled ? '로그인 후 이용 가능' : undefined}
          >
            {tab.label}
            <span className="mono">{disabled ? '-' : tab.count}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function PersonalCategoriesPage() {
  const isMobile = useMobile()
  const navigate = useNavigate()
  const { user, openLogin, isAdmin } = useStore()
  const {
    myCategories,
    publicCategories,
    subscribedCategories,
    loaded,
    publicLoaded,
    subscribedLoaded,
    fetchDirectory,
    clear,
  } = usePersonalCategoriesStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchDirectory(user).catch(() => {})
    if (!user) {
      clear()
      setActiveTab('all')
    }
  }, [user, fetchDirectory, clear])

  const publicOnlyCategories = useMemo(
    () => publicCategories.filter(category => category.is_public),
    [publicCategories],
  )
  const allCategories = useMemo(
    () => mergeCategories(publicCategories, myCategories, subscribedCategories),
    [publicCategories, myCategories, subscribedCategories],
  )

  const counts = useMemo(() => ({
    all: allCategories.length,
    mine: myCategories.length,
    public: publicOnlyCategories.length,
    subscribed: subscribedCategories.length,
  }), [allCategories.length, myCategories.length, publicOnlyCategories.length, subscribedCategories.length])

  const totalSongs = useMemo(() => {
    const all = activeTab === 'all'
      ? allCategories
      : activeTab === 'mine'
      ? myCategories
      : activeTab === 'subscribed'
        ? subscribedCategories
        : publicOnlyCategories
    return all.reduce((sum, category) => sum + (category.song_count || 0), 0)
  }, [activeTab, allCategories, myCategories, publicOnlyCategories, subscribedCategories])

  const visibleCategories = activeTab === 'all'
    ? allCategories
    : activeTab === 'mine'
    ? myCategories
    : activeTab === 'subscribed'
      ? subscribedCategories
      : publicOnlyCategories

  const currentLoaded = activeTab === 'all'
    ? publicLoaded && (!user || (loaded && subscribedLoaded))
    : activeTab === 'mine'
    ? loaded
    : activeTab === 'subscribed'
      ? subscribedLoaded
      : publicLoaded

  const copy = async (category) => {
    const link = categoryLink(category)
    try {
      await navigator.clipboard.writeText(link)
      alert(`카테고리 링크를 복사했어요.\n${link}`)
    } catch {
      alert(`클립보드 접근에 실패했어요. 직접 복사해주세요:\n${link}`)
    }
  }

  const open = (category) => navigate(`/personal-categories/${category.category_code}`)
  const openCreate = () => user ? setCreateOpen(true) : openLogin()

  const emptyTitle = activeTab === 'all'
    ? '아직 볼 수 있는 카테고리가 없어요'
    : activeTab === 'mine'
    ? '아직 만든 카테고리가 없어요'
    : activeTab === 'subscribed'
      ? '아직 구독한 카테고리가 없어요'
      : isAdmin ? '카테고리가 없어요' : '공개 카테고리가 없어요'
  const emptyBody = activeTab === 'all'
    ? '공개 카테고리가 생기거나 카테고리를 만들면 여기에 표시돼요.'
    : activeTab === 'mine'
    ? '카테고리를 만들고 곡 상세 화면에서 곡을 저장해보세요.'
    : activeTab === 'subscribed'
      ? '카테고리 링크에서 구독하면 여기에 표시돼요.'
      : '공개된 음악 카테고리가 생기면 여기에 표시돼요.'

  if (isMobile) {
    return (
      <div className="app-mobile">
        <header className="mob-top pcat-mobile-head">
          <div className="mob-top-inner">
            <div className="mob-top-row">
              <ServerSwitcher className="mob-server-switcher" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpButton />
                <button className="mob-icon-btn pcat-mobile-create" onClick={openCreate} title="카테고리 만들기">
                  <FolderPlus size={18} />
                </button>
              </div>
            </div>
            <MobilePageNav />
            <Tabs activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} user={user} />
          </div>
        </header>
        <div className="pcat-mobile-body">
          {!currentLoaded ? (
            <div className="grp-mob-empty">불러오는 중...</div>
          ) : visibleCategories.length === 0 ? (
            <div className="grp-mob-empty">
              <div className="grp-empty-icon">＋</div>
              <h3>{emptyTitle}</h3>
              <p>{emptyBody}</p>
              {activeTab === 'mine' && <button className="grp-btn primary" onClick={openCreate}>카테고리 만들기</button>}
            </div>
          ) : (
            <div className="grp-mob-list">
              {visibleCategories.map(category => (
                <div key={category.id} className="grp-mob-card" onClick={() => open(category)}>
                  <div className="grp-mob-card-head">
                    <div className="grp-mob-card-ic">{category.name[0] || 'C'}</div>
                    <div className="grp-mob-card-titles">
                      <div className="grp-mob-card-row">
                        <span className="grp-mob-card-title">{category.name}</span>
                        <span className={`pcat-visibility ${category.is_public ? 'public' : 'private'}`}>
                          {category.is_public ? '공개' : '비공개'}
                        </span>
                        <span className={`pcat-role ${category.my_role || 'guest'}`}>{roleLabel(category)}</span>
                      </div>
                      <div className="grp-mob-card-meta mono">{category.category_code}</div>
                    </div>
                    <button className="pcat-mobile-copy" onClick={(e) => { e.stopPropagation(); copy(category) }} title="복사">
                      <Copy size={15} />
                    </button>
                  </div>
                  <div className="grp-mob-card-stats">
                    <div className="grp-mob-stat"><span className="lbl">곡</span><span className="val">{category.song_count}</span></div>
                    <div className="grp-mob-stat"><span className="lbl">소유자</span><span className="val">{category.owner_nickname || '익명'}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <CreateCategoryModal open={createOpen} onClose={() => setCreateOpen(false)} />
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
          <button className="grp-btn primary" onClick={openCreate}>
            <FolderPlus size={15} />
            카테고리 만들기
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>음악 카테고리</h2>
          <span style={{ color: 'var(--fg-3)', fontSize: 12, marginLeft: 4 }}>
            {visibleCategories.length.toLocaleString()}개 · 저장된 곡 {totalSongs.toLocaleString()}곡
            {isAdmin && activeTab === 'all' ? ' · 관리자 전체 보기' : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpButton />
            {user ? <UserChip /> : <button className="gd-btn primary sm" onClick={openLogin}>로그인</button>}
          </div>
        </div>

        <div className="pcat-tabs-wrap">
          <Tabs activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} user={user} />
        </div>

        <div className="grp-body">
          {!currentLoaded ? (
            <div className="grp-empty"><div className="grp-empty-icon">⏳</div>불러오는 중...</div>
          ) : visibleCategories.length === 0 ? (
            <div className="grp-empty">
              <div className="grp-empty-icon"><Users size={42} /></div>
              <h3>{emptyTitle}</h3>
              <p>{emptyBody}</p>
              {activeTab === 'mine' && <button className="grp-btn primary" onClick={openCreate}>카테고리 만들기</button>}
            </div>
          ) : (
            <div className="grp-grid">
              {visibleCategories.map(category => (
                <CategoryCard key={category.id} category={category} onCopy={copy} onOpen={open} />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateCategoryModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
