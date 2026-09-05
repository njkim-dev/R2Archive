import { useRef, useCallback, useMemo, useEffect } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import useStore from '../store/useStore'
import { isXyxMode } from '../utils/serverMode'
import { readRestorableListState, setCurrentListScrollOffset, shouldRestoreListState } from '../utils/listState'
import { MobileCard, SongRow, useElementWidth } from './songs-table/SongRows'
import {
  CATALOG_FULL_TABLE_MIN_WIDTH,
  COMPACT_HEADERS,
  DEFAULT_HEADERS,
  DEFAULT_HEADERS_WITH_REAL_BPM,
  TableHeader,
  XYX_CATEGORY_HEADERS,
  compactLinkedHeaders,
  columnKey,
  favoriteCountHeaders,
  hideColumnsForWidth,
  personalCategoryHeaders,
  templateFromHeaders,
  xyxHeaders,
  xyxHeadersWithFavoriteCount,
} from './songs-table/TableLayout'

const SEPARATOR = { __type: 'separator' }

function SearchEmptyState({ search, isMobile }) {
  const hasSearch = !!search.trim()
  return (
    <div className={`search-empty${isMobile ? ' mobile' : ''}`}>
      <div className="search-empty-icon">♩</div>
      <div className="search-empty-title">{hasSearch ? '검색 결과가 없습니다.' : '조건에 맞는 곡이 없어요'}</div>
    </div>
  )
}

function SearchFilterHint({ suggestion, empty = false }) {
  if (!suggestion) return null
  return (
    <div className="search-filter-hint">
      <span>
        {empty
          ? '노래 난이도를 잘못 기억하신 것 같아요! 난이도 필터를 해제할까요?'
          : '혹시 원하는 결과가 나오지 않았다면 난이도 필터를 해제해보세요.'
        }
      </span>
      <button className="search-filter-hint-action" onClick={suggestion.onApply}>해제하기</button>
    </div>
  )
}

export default function SongsTable({
  exact,
  fuzzy,
  isMobile = false,
  tableMode = 'default',
  canDeleteSongs = false,
  onDeleteSong,
  categorySuggestion = null,
  catalogOpen = false,
  myPerceivedLevels = null,
}) {
  const { sort, setSort, openModal, search, quick, user, favorites, toggleFavorite, isAdmin, modalOpen, modalSong, showOriginalBpm } = useStore()
  const canFav = !!user
  const showKoreaName = isXyxMode()
  const showFavoriteCount = tableMode !== 'personalCategory' && (quick === 'favorite' || quick === 'popular')
  const showPlayCount = !showFavoriteCount && tableMode !== 'personalCategory'
  const [tableRef, tableWidth] = useElementWidth()
  const compact = catalogOpen && tableWidth < CATALOG_FULL_TABLE_MIN_WIDTH + (showKoreaName ? 140 : 0)
  const showOriginalBpmColumn = !compact && tableMode !== 'personalCategory' && showOriginalBpm
  const baseHeaders = compact
    ? (showKoreaName
      ? compactLinkedHeaders('한국 곡명', 'korea_name')
      : COMPACT_HEADERS)
    : showKoreaName
    ? (tableMode === 'personalCategory'
      ? XYX_CATEGORY_HEADERS
      : (showFavoriteCount ? xyxHeadersWithFavoriteCount(showOriginalBpmColumn) : xyxHeaders(showOriginalBpmColumn)))
    : (showOriginalBpmColumn ? DEFAULT_HEADERS_WITH_REAL_BPM : DEFAULT_HEADERS)
  const unfilteredHeaders = compact
    ? baseHeaders
    : tableMode === 'personalCategory'
    ? personalCategoryHeaders(baseHeaders)
    : (showFavoriteCount && !showKoreaName ? favoriteCountHeaders(baseHeaders) : baseHeaders)
  // 목록의 좌우 여백과 세로 스크롤바를 제외한 너비로 컬럼을 계산한다.
  const columnWidth = Math.max(0, tableWidth - (compact ? 40 : 56) - 10)
  const hiddenColumns = useMemo(() => {
    const hidden = hideColumnsForWidth(columnWidth, unfilteredHeaders, compact)
    if (showKoreaName) hidden.add('userLevel')
    return hidden
  }, [columnWidth, unfilteredHeaders, compact, showKoreaName])
  const headers = unfilteredHeaders.filter(header => !hiddenColumns.has(columnKey(header)))
    .map(header => header.key === 'userLevel' && myPerceivedLevels
      ? { ...header, label: '내 체감 난이도', cls: 'num th-my-perceived' }
      : header)
  const colTemplate = templateFromHeaders(headers, columnWidth, compact)
  const listRef = useRef(null)
  const listHeightRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const savedOffsetRef = useRef(0)
  const prevSearchRef = useRef(search)
  const restoredScrollRef = useRef(false)
  const activeSongId = modalOpen ? modalSong?.id : null
  const scrolledActiveRef = useRef(null)

  const items = useMemo(() => {
    if (!fuzzy.length) return exact
    return [...exact, SEPARATOR, ...fuzzy]
  }, [exact, fuzzy])
  const hasMobileAltName = useMemo(
    () => isMobile && items.some(item => item !== SEPARATOR && item.korea_name),
    [isMobile, items]
  )
  const rowHeight = isMobile ? (hasMobileAltName ? 92 : 80) : 44

  useEffect(() => {
    const prev = prevSearchRef.current
    const curr = search
    const wasEmpty = !prev.trim()
    const isEmpty = !curr.trim()
    if (wasEmpty && !isEmpty) {
      savedOffsetRef.current = scrollOffsetRef.current
    } else if (!wasEmpty && isEmpty) {
      const offset = savedOffsetRef.current
      requestAnimationFrame(() => {
        listRef.current?.scrollTo(offset)
      })
    }
    prevSearchRef.current = curr
  }, [search])

  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }) => {
    scrollOffsetRef.current = scrollOffset
    setCurrentListScrollOffset(scrollOffset)
  }, [])

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!(target instanceof Element)) return false
      return !!target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]')
    }

    const handlePageKey = (e) => {
      if (e.defaultPrevented || modalOpen || isTypingTarget(e.target)) return
      if (e.key !== 'PageDown' && e.key !== 'PageUp') return

      const list = listRef.current
      const height = listHeightRef.current
      if (!list || !height || items.length === 0) return

      e.preventDefault()
      const pageStep = Math.max(rowHeight, height - rowHeight)
      const maxOffset = Math.max(0, items.length * rowHeight - height)
      const direction = e.key === 'PageDown' ? 1 : -1
      const nextOffset = Math.max(0, Math.min(maxOffset, scrollOffsetRef.current + direction * pageStep))

      scrollOffsetRef.current = nextOffset
      setCurrentListScrollOffset(nextOffset)
      list.scrollTo(nextOffset)
    }

    window.addEventListener('keydown', handlePageKey)
    return () => window.removeEventListener('keydown', handlePageKey)
  }, [items.length, rowHeight, modalOpen])

  useEffect(() => {
    if (restoredScrollRef.current || !shouldRestoreListState() || items.length === 0) return
    restoredScrollRef.current = true
    const offset = Math.max(0, Number(readRestorableListState()?.scrollOffset) || 0)
    if (!offset) return
    requestAnimationFrame(() => {
      listRef.current?.scrollTo(offset)
      scrollOffsetRef.current = offset
      setCurrentListScrollOffset(offset)
    })
  }, [items.length])

  useEffect(() => {
    if (!activeSongId || items.length === 0) return
    const index = items.findIndex(item => item !== SEPARATOR && item.id === activeSongId)
    if (index < 0) return
    const key = `${activeSongId}:${index}:${isMobile ? 'm' : 'd'}`
    if (scrolledActiveRef.current === key) return
    const selectedRow = document.querySelector(`[data-song-id="${activeSongId}"].is-catalog-active`)
    if (selectedRow) {
      scrolledActiveRef.current = key
      return
    }
    scrolledActiveRef.current = key
    requestAnimationFrame(() => {
      if (typeof listRef.current?.scrollToItem === 'function') {
        listRef.current.scrollToItem(index, 'center')
      } else {
        listRef.current?.scrollTo(index * rowHeight)
      }
    })
  }, [activeSongId, items, isMobile, rowHeight])

  const handleRowClick = useCallback((song) => {
    openModal(song)
  }, [openModal])

  const Row = useCallback(({ index, style }) => {
    const item = items[index]
    if (item === SEPARATOR) {
      if (isMobile) {
        return (
          <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', color: 'var(--fg-4)', fontSize: 12 }}>
            <div style={{ width: 100, height: 1, background: 'var(--line-soft)', flexShrink: 0 }} />
            혹시 이런 곡을 찾으셨나요?
            <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
          </div>
        )
      }
      return (
        <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--fg-4)', fontSize: 12 }}>
          <div style={{ width: 100, height: 1, background: 'var(--line-soft)', flexShrink: 0 }} />
          혹시 이런 곡을 찾으셨나요?
          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        </div>
      )
    }
    const isFav = favorites?.has(item.id)
    const active = activeSongId === item.id
    if (isMobile) {
      return (
        <MobileCard
          song={item}
          style={style}
          onClick={handleRowClick}
          isFav={isFav}
          canFav={canFav}
          onToggleFav={toggleFavorite}
          canDelete={tableMode === 'personalCategory' && canDeleteSongs}
          onDeleteSong={onDeleteSong}
          showFavoriteCount={showFavoriteCount}
          active={active}
        />
      )
    }
    return (
      <SongRow
        song={item}
        index={index}
        style={style}
        onClick={handleRowClick}
        isFav={isFav}
        canFav={canFav}
        onToggleFav={toggleFavorite}
        isAdmin={isAdmin}
        tableMode={tableMode}
        canDelete={canDeleteSongs}
        onDeleteSong={onDeleteSong}
        showKoreaName={showKoreaName}
        showPlayCount={showPlayCount}
        showFavoriteCount={showFavoriteCount}
        showOriginalBpmColumn={showOriginalBpmColumn}
        userLevel={myPerceivedLevels ? (myPerceivedLevels[item.id] ?? null) : item.user_level_avg}
        hiddenColumns={hiddenColumns}
        colTemplate={colTemplate}
        compact={compact}
        active={active}
      />
    )
  }, [items, handleRowClick, isMobile, favorites, canFav, toggleFavorite, isAdmin, tableMode, canDeleteSongs, onDeleteSong, showKoreaName, showPlayCount, showFavoriteCount, showOriginalBpmColumn, myPerceivedLevels, hiddenColumns, colTemplate, compact, activeSongId])

  if (isMobile) {
    const totalCount = exact.length + fuzzy.length
    return (
      <div className="mob-list-wrap">
        <div className="mob-meta">
          <span><b>{totalCount.toLocaleString()}</b> 곡</span>
          <MobileSortButton />
        </div>
        <SearchFilterHint suggestion={categorySuggestion} empty={totalCount === 0} />
        {totalCount === 0
          ? (
            <SearchEmptyState search={search} isMobile />
          )
          : (
            <div style={{ flex: 1 }}>
              <AutoSizer>
                {({ height, width }) => {
                  listHeightRef.current = height
                  return (
                    <FixedSizeList
                      ref={listRef}
                      height={height}
                      width={width}
                      itemCount={items.length}
                      itemSize={rowHeight}
                      onScroll={handleScroll}
                    >
                      {Row}
                    </FixedSizeList>
                  )
                }}
              </AutoSizer>
            </div>
          )
        }
      </div>
    )
  }

  return (
    <div ref={tableRef} className={`table-wrap${compact ? ' compact' : ''}`} role="table" aria-label="곡 목록" aria-rowcount={items.length + 1}>
      <TableHeader sort={sort} onSort={setSort} headers={headers} colTemplate={colTemplate} />
      <SearchFilterHint suggestion={categorySuggestion} empty={items.length === 0} />
      <div className={`tbl-body${items.length === 0 ? ' tbl-body-empty' : ''}`} style={{ flex: 1, overflow: 'hidden' }} role="rowgroup">
        {items.length === 0 ? (
          <SearchEmptyState search={search} />
        ) : (
          <AutoSizer>
            {({ height, width }) => {
              listHeightRef.current = height
              return (
                <FixedSizeList
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={items.length}
                  itemSize={rowHeight}
                  style={{ overflowX: 'hidden' }}
                  onScroll={handleScroll}
                >
                  {Row}
                </FixedSizeList>
              )
            }}
          </AutoSizer>
        )}
      </div>
    </div>
  )
}

function MobileSortButton() {
  const { sort, openMobileSheet } = useStore()
  const label = useMemo(() => {
    const map = {
      file_order: sort.dir === 'asc' ? '구곡순' : '최신곡순',
      level: sort.dir === 'asc' ? '난이도 낮은순' : '난이도 높은순',
      bpm: sort.dir === 'asc' ? 'BPM 느린순' : 'BPM 빠른순',
      name: sort.dir === 'desc' ? '곡명 내림차순' : '곡명 오름차순',
      artist: sort.dir === 'desc' ? '아티스트 내림차순' : '아티스트 오름차순',
      favorite_count: '인기순',
    }
    return map[sort.key] ?? '최신곡순'
  }, [sort])
  return (
    <button className="mob-sort-btn" onClick={openMobileSheet}>
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>
  )
}
