import { useMemo } from 'react'
import useStore from '../store/useStore'
import { filterSongs, sortSongs } from '../utils/helpers'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import FilterBar from '../components/FilterBar'
import SongsTable from '../components/SongsTable'
import MobileHeader from '../components/MobileHeader'
import FilterSheet from '../components/FilterSheet'
import { useMobile } from '../hooks/useMobile'

export default function SongsPage() {
  const isMobile = useMobile()
  const {
    songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
    category, quick, artists, sort, favorites, played,
  } = useStore()

  const filtered = useMemo(() => {
    const { exact, fuzzy } = filterSongs(songs, {
      search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
      category, quick, artists, favorites, played,
    })
    return { exact: sortSongs(exact, sort), fuzzy: sortSongs(fuzzy, sort) }
  }, [songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, artists, sort, favorites, played])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length

  if (isMobile) {
    return (
      <div className="app-mobile">
        <MobileHeader totalFiltered={totalFiltered} />
        <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} isMobile />
        <FilterSheet />
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
    </div>
  )
}
