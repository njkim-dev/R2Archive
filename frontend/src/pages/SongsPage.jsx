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
import { isXyxMode } from '../utils/serverMode'

function distinctSongCount(items) {
  const keys = new Set()
  for (const song of items) {
    keys.add(`${(song.name || '').trim().toLowerCase()}::${(song.artist || '').trim().toLowerCase()}`)
  }
  return keys.size
}

export default function SongsPage() {
  const isMobile = useMobile(isXyxMode() ? 1100 : 768)
  const {
    songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
    category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
    artists, sort, favorites, played, playedAll,
    meta, setCategory,
  } = useStore()

  const filtered = useMemo(() => {
    // 카테고리 필터 ON일 때만 cross-channel 확장된 playedAll 사용 — 동일 곡을 채널 내에서 노출.
    // OFF면 채널별 분리된 played를 그대로 사용해 중복 표시를 피한다.
    const playedForFilter = category ? playedAll : played
    const { exact, fuzzy } = filterSongs(songs, {
      search, searchMode, levelMin, levelMax, bpmMin, bpmMax,
      category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
      artists, favorites, played: playedForFilter,
    })
    return { exact: sortSongs(exact, sort), fuzzy: sortSongs(fuzzy, sort) }
  }, [songs, search, searchMode, levelMin, levelMax, bpmMin, bpmMax, category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, sort, favorites, played, playedAll])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length
  const categorySuggestion = useMemo(() => {
    if (!search.trim() || !category) return null
    const levelBounds = {
      levelMin: meta?.level_min ?? levelMin,
      levelMax: meta?.level_max ?? levelMax,
    }
    const result = filterSongs(songs, {
      search,
      searchMode,
      ...levelBounds,
      bpmMin,
      bpmMax,
      category: null,
      quick,
      flagNew,
      flagVariants,
      flagFavorite,
      flagMyPlayed,
      artists,
      favorites,
      played,
    })
    const currentDistinct = distinctSongCount([...filtered.exact, ...filtered.fuzzy])
    const expandedDistinct = distinctSongCount([...result.exact, ...result.fuzzy])
    if (expandedDistinct <= currentDistinct) return null
    return {
      onApply: () => setCategory(category),
    }
  }, [search, category, meta, levelMin, levelMax, bpmMin, bpmMax, songs, searchMode, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, favorites, played, filtered.exact, filtered.fuzzy, setCategory])

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <MobileHeader totalFiltered={totalFiltered} />
        <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} isMobile categorySuggestion={categorySuggestion} />
        <FilterSheet />
      </div>
    )
  }

  return (
    <div className="app" data-cat={category || undefined}>
      <Sidebar songs={songs} filtered={filtered.exact} />
      <main className="main">
        <TopBar filteredCount={totalFiltered} totalCount={songs.length} />
        <FilterBar />
        <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} categorySuggestion={categorySuggestion} />
      </main>
    </div>
  )
}
