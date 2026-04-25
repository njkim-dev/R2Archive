import { useEffect, useMemo } from 'react'
import useStore from './store/useStore'
import { getSongs, getMeta } from './api/client'
import { filterSongs, sortSongs } from './utils/helpers'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import FilterBar from './components/FilterBar'
import SongsTable from './components/SongsTable'
import SongModal from './components/SongModal'
import LoginModal from './components/LoginModal'
import OnboardingModal from './components/OnboardingModal'
import FeedbackModal from './components/FeedbackModal'
import MobileHeader from './components/MobileHeader'
import FilterSheet from './components/FilterSheet'
import { useMobile } from './hooks/useMobile'

export default function App() {
  const isMobile = useMobile()
  const {
    songs, setSongs, initFromMeta, openModal,
    search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, artists,
    sort, favorites, played,
    refreshUser, user, openOnboarding,
  } = useStore()

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
  }, [])

  const filtered = useMemo(() => {
    const { exact, fuzzy } = filterSongs(songs, { search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, favorites, played })
    return { exact: sortSongs(exact, sort), fuzzy: sortSongs(fuzzy, sort) }
  }, [songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, sort, favorites, played])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length

  if (isMobile) {
    return (
      <div className="app-mobile">
        <MobileHeader totalFiltered={totalFiltered} />
        <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} isMobile />
        <SongModal />
        <FilterSheet />
        <LoginModal />
        <OnboardingModal />
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side">
        <Sidebar songs={songs} filtered={filtered.exact} />
      </aside>

      <main className="main">
        <TopBar filteredCount={totalFiltered} totalCount={songs.length} />
        <FilterBar />
        <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} />
      </main>

      <SongModal />
      <LoginModal />
      <OnboardingModal />
      <FeedbackModal />
    </div>
  )
}
