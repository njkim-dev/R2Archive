import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import useStore from './store/useStore'
import { getSongs, getMeta } from './api/client'
import SongModal from './components/SongModal'
import LoginModal from './components/LoginModal'
import OnboardingModal from './components/OnboardingModal'
import FeedbackModal from './components/FeedbackModal'
import MyPageModal from './components/MyPageModal'
import SongsPage from './pages/SongsPage'

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

  useEffect(() => {
    const openFromHash = () => {
      const match = location.hash.match(/^#song=(\d+)$/)
      if (!match) return
      const id = parseInt(match[1], 10)
      if (songs.length === 0) return
      const song = songs.find(x => x.id === id)
      if (!song) { alert('존재하지 않는 곡입니다. URL을 확인해주세요.'); return }
      const { modalOpen, closeModal } = useStore.getState()
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
  }, [])  // eslint-disable-line

  return (
    <>
      <Routes>
        <Route path="/" element={<SongsPage />} />
        <Route path="*" element={<SongsPage />} />
      </Routes>
      <SongModal />
      <LoginModal />
      <OnboardingModal />
      <FeedbackModal />
      <MyPageModal />
    </>
  )
}
