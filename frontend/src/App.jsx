import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import useStore from './store/useStore'
import { getSongs, getMeta } from './api/client'
import SongModal from './components/SongModal'
import LoginModal from './components/LoginModal'
import OnboardingModal from './components/OnboardingModal'
import FeedbackModal from './components/FeedbackModal'
import MyPageModal from './components/MyPageModal'
import HelpTour from './components/HelpTour'
import SongsPage from './pages/SongsPage'
import PmangSongsPage from './pages/PmangSongsPage'
import RankingsPage from './pages/RankingsPage'
import GroupsPage from './pages/GroupsPage'
import GroupDetailPage from './pages/GroupDetailPage'
import PersonalCategoriesPage from './pages/PersonalCategoriesPage'
import PersonalCategoryDetailPage from './pages/PersonalCategoryDetailPage'
import PersonalCategorySubscribersPage from './pages/PersonalCategorySubscribersPage'
import FeedbackPage from './pages/FeedbackPage'

export default function App() {
  const { songs, setSongs, initFromMeta, openModal, refreshUser, user, openOnboarding } = useStore()

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

  // 곡 상세 모달은 #song=<id> 해시로 표현. 라우트(/, /rankings)와 직교 — 어느 페이지에서든 해시가 있으면 모달이 열림.
  useEffect(() => {
    const openFromHash = () => {
      const match = location.hash.match(/^#song=(\d+)$/)
      if (!match) return
      const id = parseInt(match[1], 10)
      if (songs.length === 0) return
      const song = songs.find(x => x.id === id)
      if (!song) { alert('존재하지 않는 곡입니다. URL을 확인해주세요.'); return }
      const { modalOpen, closeModal } = useStore.getState()
      // 이미 열려있는 모달을 다른 곡으로 전환하려면 닫고 다시 열어야 SongModal의 useEffect가 다시 발동.
      if (modalOpen) {
        closeModal()
        setTimeout(() => openModal(song), 150)
      } else {
        openModal(song)
      }
    }
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [songs])

  useEffect(() => {
    Promise.all([
      getSongs().then(data => { setSongs(data); return data }),
      getMeta().then(initFromMeta),
    ]).then(() => {
      const match = location.hash.match(/^#song=(\d+)$/)
      if (match) {
        const id = parseInt(match[1], 10)
        const { songs: s, openModal: open } = useStore.getState()
        const song = s.find(x => x.id === id)
        if (song) open(song)
      }
    }).catch(console.error)
  }, [])

  return (
    <>
      <Routes>
        <Route path="/" element={<SongsPage />} />
        <Route path="/pmang-songs" element={<PmangSongsPage />} />
        <Route path="/rankings" element={<RankingsPage />} />
        <Route path="/rankings/:nickname" element={<RankingsPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:gid" element={<GroupDetailPage />} />
        <Route path="/personal-categories" element={<PersonalCategoriesPage />} />
        <Route path="/personal-categories/:code/subscribers" element={<PersonalCategorySubscribersPage />} />
        <Route path="/personal-categories/:code" element={<PersonalCategoryDetailPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
      </Routes>
      <SongModal />
      <LoginModal />
      <OnboardingModal />
      <FeedbackModal />
      <MyPageModal />
      <HelpTour />
    </>
  )
}
