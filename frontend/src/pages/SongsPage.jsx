import { useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import { filterSongs, sortSongs } from '../utils/helpers'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import FilterBar from '../components/FilterBar'
import SongsTable from '../components/SongsTable'
import MobileHeader from '../components/MobileHeader'
import FilterSheet from '../components/FilterSheet'
import { useMobile } from '../hooks/useMobile'
import { useMyPerceivedLevels } from '../hooks/useMyPerceivedLevels'
import { isXyxMode } from '../utils/serverMode'

function distinctSongCount(items) {
  const keys = new Set()
  for (const song of items) {
    keys.add(`${(song.name || '').trim().toLowerCase()}::${(song.artist || '').trim().toLowerCase()}`)
  }
  return keys.size
}

function CatalogLoadingState({ isMobile }) {
  const count = isMobile ? 7 : 10
  return (
    <div className={`catalog-loading${isMobile ? ' mobile' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">곡 목록을 불러오는 중입니다.</span>
      <div className="catalog-loading-label" aria-hidden="true">곡 목록을 불러오는 중입니다</div>
      <div className="catalog-skeleton-list" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="catalog-skeleton-row" key={index}>
            <span className="catalog-skeleton-thumb" />
            <span className="catalog-skeleton-lines"><i /><i /></span>
            <span className="catalog-skeleton-value" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CatalogErrorState({ message, onRetry, isMobile }) {
  return (
    <div className={`catalog-error${isMobile ? ' mobile' : ''}`} role="alert">
      <div className="catalog-error-icon" aria-hidden="true">!</div>
      <h2>곡 목록을 불러오지 못했습니다</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>다시 시도</button>
    </div>
  )
}

export default function SongsPage() {
  const isMobile = useMobile(isXyxMode() ? 1100 : 768)
  const {
    songs, search, searchMode, excludeSearch, levelMin, levelMax, bpmMin, bpmMax,
    category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
    artists, sort, favorites, played, playedAll,
    meta, setCategory, setQuick, isAdmin, modalOpen,
    loading, error, loadCatalog, showMyPerceived,
  } = useStore()
  const effectiveExcludeSearch = !isMobile && excludeSearch
  const myPerceived = useMyPerceivedLevels(!isMobile && !isXyxMode() && showMyPerceived)

  useEffect(() => {
    if (quick === 'popular' && !isAdmin) setQuick('all')
  }, [quick, isAdmin, setQuick])

  const filtered = useMemo(() => {
    // 카테고리 안에서는 다른 난이도에서 재생한 동일 곡도 포함한다.
    const playedForFilter = category ? playedAll : played
    const { exact, fuzzy } = filterSongs(songs, {
      search, searchMode, excludeSearch: effectiveExcludeSearch, levelMin, levelMax, bpmMin, bpmMax,
      category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed,
      artists, favorites, played: playedForFilter,
    })
    const effectiveSort = quick === 'popular' ? { key: 'favorite_count', dir: 'desc' } : sort
    return { exact: sortSongs(exact, effectiveSort, myPerceived.levels), fuzzy: sortSongs(fuzzy, effectiveSort, myPerceived.levels) }
  }, [songs, search, searchMode, effectiveExcludeSearch, levelMin, levelMax, bpmMin, bpmMax, category, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, sort, favorites, played, playedAll, myPerceived.levels])

  const totalFiltered = filtered.exact.length + filtered.fuzzy.length
  const categorySuggestion = useMemo(() => {
    if (effectiveExcludeSearch || !search.trim() || !category) return null
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
  }, [search, effectiveExcludeSearch, category, meta, levelMin, levelMax, bpmMin, bpmMax, songs, searchMode, quick, flagNew, flagVariants, flagFavorite, flagMyPlayed, artists, favorites, played, filtered.exact, filtered.fuzzy, setCategory])

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <MobileHeader totalFiltered={totalFiltered} />
        {loading
          ? <CatalogLoadingState isMobile />
          : error
            ? <CatalogErrorState message={error} onRetry={loadCatalog} isMobile />
            : <SongsTable exact={filtered.exact} fuzzy={filtered.fuzzy} isMobile categorySuggestion={categorySuggestion} />
        }
        <FilterSheet />
      </div>
    )
  }

  const catalogPanelOpen = modalOpen && !isMobile

  return (
    <div className={`app song-list-layout${catalogPanelOpen ? ' catalog-panel-open' : ''}`} data-cat={category || undefined}>
      <Sidebar songs={songs} filtered={filtered.exact} loading={loading} error={error} />
      <main className="main">
        <TopBar
          filteredCount={totalFiltered}
          totalCount={songs.length}
          loading={loading}
          error={error}
          showOriginalBpmToggle
          showMyPerceivedToggle={!isXyxMode()}
          myPerceivedStatus={myPerceived.status}
          onRetryMyPerceived={myPerceived.retry}
        />
        {!loading && !error && <FilterBar />}
        {loading
          ? <CatalogLoadingState />
          : error
            ? <CatalogErrorState message={error} onRetry={loadCatalog} />
            : <SongsTable
                exact={filtered.exact}
                fuzzy={filtered.fuzzy}
                categorySuggestion={categorySuggestion}
                catalogOpen={catalogPanelOpen}
                myPerceivedLevels={myPerceived.levels}
              />
        }
      </main>
    </div>
  )
}
