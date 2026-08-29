import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import useStore from './store/useStore'
import { isXyxMode } from './utils/serverMode'
import { clearRestoreListParam, readRestorableListState, shouldRestoreListState } from './utils/listState'
import { replaceCatalogHash, songCatalogHash } from './utils/catalogUrl'
import { categoryFromLevel } from './utils/helpers'
import LoginModal from './components/LoginModal'
import OnboardingModal from './components/OnboardingModal'
import FeedbackModal from './components/FeedbackModal'
import MyPageModal from './components/MyPageModal'
import HelpTour from './components/HelpTour'
import AnalyticsTracker from './components/AnalyticsTracker'
import SongModal from './components/SongModal'
import SongsPage from './pages/SongsPage'

const RemovedSongsPage = lazy(() => import('./pages/RemovedSongsPage'))
const PmangSongsPage = lazy(() => import('./pages/PmangSongsPage'))
const RankingsPage = lazy(() => import('./pages/RankingsPage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage'))
const PersonalCategoriesPage = lazy(() => import('./pages/PersonalCategoriesPage'))
const PersonalCategoryDetailPage = lazy(() => import('./pages/PersonalCategoryDetailPage'))
const PersonalCategorySubscribersPage = lazy(() => import('./pages/PersonalCategorySubscribersPage'))
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))

function CloseModalOnCataloglessRoutes() {
  const location = useLocation()

  useEffect(() => {
    const path = location.pathname
    const shouldClose =
      path === '/feedback' ||
      path === '/analytics' ||
      path === '/groups' ||
      path.startsWith('/groups/') ||
      ((path === '/personal-categories' || path.startsWith('/personal-categories/')) && !location.state?.keepCatalogOpen)

    if (shouldClose) {
      const { modalOpen, closeModal } = useStore.getState()
      if (modalOpen) closeModal()
    }
  }, [location.pathname])

  return null
}

function SyncCatalogUrl() {
  const location = useLocation()
  const modalOpen = useStore(s => s.modalOpen)
  const songId = useStore(s => s.modalSong?.id)

  useEffect(() => {
    if (!modalOpen || !songId) return
    useStore.getState().setModalReturnUrl(`${location.pathname}${location.search}` || '/')
    replaceCatalogHash(songCatalogHash(songId), '/', '')
  }, [modalOpen, songId, location.pathname, location.search])

  return null
}

function openSongFromHash(song) {
  const { setCategoryDirect, openModal } = useStore.getState()
  setCategoryDirect(categoryFromLevel(song.level))
  openModal(song)
}

export default function App() {
  const { songs, loadCatalog, refreshUser, user, openOnboarding, restoreListState } = useStore()
  const xyxMode = isXyxMode()

  useEffect(() => { refreshUser() }, [])  // eslint-disable-line

  useEffect(() => {
    if (!user) return
    if (!user.onboarded) openOnboarding()
  }, [user, openOnboarding])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('auth')) {
      const fail = params.get('auth') === 'fail'
      if (fail) alert(`로그인 실패: ${params.get('reason') || '알 수 없는 오류'}`)
      const cleaned = location.pathname + location.hash
      history.replaceState(null, '', cleaned)
      refreshUser()
    }
  }, [])  // eslint-disable-line

  // 곡 상세 모달은 #song=<id> 해시로 표현. 어느 페이지에서든 해시가 있으면 모달이 열림.
  useEffect(() => {
    const openFromHash = () => {
      const match = location.hash.match(/^#song=(\d+)$/)
      if (!match) return
      const id = parseInt(match[1], 10)
      if (songs.length === 0) return
      const song = songs.find(x => x.id === id)
      if (!song) { alert('존재하지 않는 곡입니다. URL을 확인해주세요.'); return }
      const { modalOpen, modalSong, closeModal } = useStore.getState()
      if (modalOpen && modalSong?.id === id) return
      // 이미 열려있는 모달을 다른 곡으로 전환하려면 닫고 다시 열어야 SongModal의 useEffect가 다시 발동.
      if (modalOpen) {
        closeModal()
        setTimeout(() => openSongFromHash(song), 150)
      } else {
        openSongFromHash(song)
      }
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [songs])

  useEffect(() => {
    let cancelled = false
    loadCatalog().then(success => {
      if (!success || cancelled) return
      const match = location.hash.match(/^#song=(\d+)$/)
      if (shouldRestoreListState()) {
        if (!match) {
          const saved = readRestorableListState()
          if (saved) restoreListState(saved)
        }
        clearRestoreListParam()
      }
    })
    return () => { cancelled = true }
  }, [loadCatalog, restoreListState])

  return (
    <>
      <SyncCatalogUrl />
      <CloseModalOnCataloglessRoutes />
      <AnalyticsTracker />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<SongsPage />} />
          <Route path="/removed-songs" element={<RemovedSongsPage />} />
          {!xyxMode && <Route path="/pmang-songs" element={<PmangSongsPage />} />}
          {!xyxMode && <Route path="/rankings" element={<RankingsPage />} />}
          {!xyxMode && <Route path="/rankings/:nickname" element={<RankingsPage />} />}
          {!xyxMode && <Route path="/achievements" element={<RankingsPage />} />}
          {!xyxMode && <Route path="/achievements/:nickname" element={<RankingsPage />} />}
          {!xyxMode && <Route path="/groups" element={<GroupsPage />} />}
          {!xyxMode && <Route path="/groups/:gid" element={<GroupDetailPage />} />}
          <Route path="/personal-categories" element={<PersonalCategoriesPage />} />
          <Route path="/personal-categories/:code/subscribers" element={<PersonalCategorySubscribersPage />} />
          <Route path="/personal-categories/:code" element={<PersonalCategoryDetailPage />} />
          {!xyxMode && <Route path="/feedback" element={<FeedbackPage />} />}
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SongModal />
      <LoginModal />
      <OnboardingModal />
      <FeedbackModal />
      <MyPageModal />
      <HelpTour />
    </>
  )
}
