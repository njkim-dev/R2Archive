import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { Trash2 } from 'lucide-react'
import useStore from '../store/useStore'
import { levelBarColor, bpmWaveBars, fmt, fmtBpm, artworkBg } from '../utils/helpers'
import { logPlay } from '../api/client'
import PersonalCategoryPicker from './PersonalCategoryPicker'
import { isXyxMode } from '../utils/serverMode'
import { readSavedListState, setCurrentListScrollOffset, shouldRestoreListState } from '../utils/listState'

function MobileCard({ song, style, onClick, isFav, canFav, onToggleFav, canDelete, onDeleteSong, showFavoriteCount }) {
  const cat = song.level >= 7 ? 'sun' : song.level >= 4 ? 'moon' : 'star'
  const hasMusic = !!song.youtube_url

  const openMusic = (e) => {
    e.stopPropagation()
    if (!song.youtube_candidate) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
    }
    window.open(song.youtube_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mob-card" style={style} onClick={() => onClick(song)}>
      {(canDelete || hasMusic || canFav) && (
        <div className="mob-card-actions">
          {canDelete && (
            <button
              className="mob-delete-btn"
              onClick={e => { e.stopPropagation(); onDeleteSong?.(song) }}
              aria-label="카테고리에서 삭제"
              title="카테고리에서 삭제"
            >
              <Trash2 size={15} />
            </button>
          )}
          {hasMusic && (
            <button
              type="button"
              className="mob-music-btn"
              onClick={openMusic}
              aria-label="YouTube에서 듣기"
              title="YouTube에서 듣기"
            >
              ♪
            </button>
          )}
          {canFav && (
            <button
              className={`mob-fav-btn${isFav ? ' on' : ''}`}
              onClick={e => { e.stopPropagation(); onToggleFav(song.id) }}
              aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            >{isFav ? '★' : '☆'}</button>
          )}
        </div>
      )}
      <div className="mob-art" style={{ background: artworkBg(song.id) }}>
        {song.image
          ? <img
              src={`${import.meta.env.VITE_API_URL}/static/${song.image}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          : <span style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, fontSize: 13, color: 'oklch(0.98 0.01 270 / 0.9)' }}>
              {(song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </span>
        }
      </div>

      <div className="mob-card-main">
        <div className="mob-card-title">
          {song.is_new && <span className="mob-new-dot" />}
          <span className="mob-card-name">{song.name}</span>
        </div>
        <div className="mob-card-artist">{song.artist}</div>
        <div className="mob-card-inline">
          <span className="mob-lv" data-cat={cat}>Lv {song.level.toFixed(1)}</span>
          {song.is_change && <><span className="mob-sep">·</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>⇄ 변속</span></>}
          <span className="mob-sep">·</span>
          <span>{fmtBpm(song.bpm)} BPM</span>
          {song.user_level_avg != null && (
            <><span className="mob-sep">·</span><span style={{ color: 'var(--fg-3)' }}>체감 {song.user_level_avg.toFixed(1)}</span></>
          )}
          {showFavoriteCount && (
            <><span className="mob-sep">·</span><span style={{ color: 'var(--fg-3)' }}>★ {fmt(song.favorite_count || 0)}</span></>
          )}
        </div>
      </div>

    </div>
  )
}

const COL_TEMPLATE = '56px 2fr 1fr 76px 100px 110px 110px 68px 80px 56px'
const XYX_COL_TEMPLATE = '50px minmax(0, 2.2fr) minmax(0, 1.15fr) minmax(0, 0.95fr) 68px 86px 94px 96px 58px 46px'
const XYX_CATEGORY_COL_TEMPLATE = '50px minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 0.95fr) 68px 86px 94px 96px 58px 64px 46px'

const DEFAULT_HEADERS = [
  { label: '#',        key: 'file_order', cls: '' },
  { label: '곡명',     key: 'name',      cls: '' },
  { label: '아티스트',  key: 'artist',    cls: '' },
  { label: '난이도',   key: 'level',     cls: 'num' },
  { label: '유저 난이도', key: 'userLevel', cls: 'num' },
  { label: 'BPM',     key: 'bpm',       cls: 'num' },
  { label: '콤보',    key: 'combo',     cls: 'num' },
  { label: '시간',    key: 'time',      cls: 'num' },
  { label: '재생',    key: 'play_count', cls: 'num' },
  { label: '변속',    key: null,        cls: 'center' },
]

const XYX_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'play_count'),
]

const FAVORITE_COUNT_HEADER = { label: '즐겨찾기', key: 'favorite_count', cls: 'num' }

const favoriteCountHeaders = (headers) => headers.map(header =>
  header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
)

const xyxFavoriteCountHeaders = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).map(header =>
    header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
  ),
]

const XYX_CATEGORY_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2),
]

const personalCategoryHeaders = (headers) => headers.map(header =>
  header.key === 'play_count'
    ? { label: '삭제', key: null, cls: 'center' }
    : header
)

function TableHeader({ sort, onSort, headers = DEFAULT_HEADERS, colTemplate = COL_TEMPLATE }) {
  return (
    <div className="tbl-header" style={{ gridTemplateColumns: colTemplate }}>
      {headers.map(({ label, key, cls }) => (
        <div
          key={label}
          className={`th ${cls}${sort.key === key ? ' sorted' : ''}`}
          onClick={() => key && onSort(key)}
          style={key ? { cursor: 'pointer' } : {}}
        >
          {label}
          {key && sort.key === key && (
            <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>
          )}
          {key && sort.key !== key && (
            <span style={{ color: 'var(--fg-4)', fontSize: 9, opacity: 0.5 }}>⇅</span>
          )}
        </div>
      ))}
    </div>
  )
}

function SongRow({
  song,
  index,
  style,
  onClick,
  isFav,
  canFav,
  onToggleFav,
  isAdmin,
  tableMode,
  canDelete,
  onDeleteSong,
  showKoreaName,
  showPlayCount,
  showFavoriteCount,
  colTemplate,
}) {
  const [copied, setCopied] = useState(false)
  const lvInt = Math.floor(song.level)
  const lvDec = song.level % 1 === 0 ? '.0' : '.5'
  const comboPct = Math.min(100, (song.combo / 2000) * 100)
  // BPM에 따른 곡명/아티스트/BPM 텍스트 색상 티어. CSS 쪽 [data-bpm-tier]에서 사용.
  const bpmTier =
    song.bpm >= 220 ? 'hot'
      : song.bpm >= 200 ? 'warm'
      : song.bpm < 120 ? 'cool'
      : undefined

  const handleCopyName = (e) => {
    e.stopPropagation()
    if (copied) return
    navigator.clipboard?.writeText(song.name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  return (
    <div
      className="tbl-row"
      data-bpm-tier={bpmTier}
      style={{ ...style, gridTemplateColumns: colTemplate }}
      onClick={() => onClick(song)}
    >
      {/* # / new tag */}
      <div className="td">
        <div className="idx-cell">
          {song.is_new && <span className="new-tag">NEW</span>}
          <button
            className={`fav-btn${isFav ? ' on' : ''}`}
            title={canFav ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 이용 가능'}
            onClick={e => { e.stopPropagation(); if (canFav) onToggleFav(song.id) }}
            disabled={!canFav}
          >{isFav ? '★' : '☆'}</button>
        </div>
      </div>

      {/* 곡명 */}
      <div className="td">
        <div className="title-cell">
          <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
            {song.image
              ? <img
                  src={`${import.meta.env.VITE_API_URL}/static/${song.image}`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              : null
            }
          </div>
          <span className="title-main">{song.name}</span>
          {song.youtube_candidate && (
            <span
              className="candidate-pill"
              title={song.candidate_video_title || 'YouTube 후보'}
            >
              후보 {song.candidate_rank}
              {song.candidate_score != null && ` · ${Number(song.candidate_score).toFixed(2)}`}
            </span>
          )}
          {song.youtube_url && (
            <button
              type="button"
              className="song-youtube-icon"
              title="YouTube에서 듣기"
              aria-label="YouTube에서 듣기"
              onClick={e => {
                e.stopPropagation()
                if (!song.youtube_candidate) {
                  logPlay(song.id)
                  useStore.getState().markPlayed(song.id)
                }
                window.open(song.youtube_url, '_blank', 'noopener,noreferrer')
              }}
            >♪</button>
          )}
          {isAdmin && (
            <button
              className={`copy-name-btn${copied ? ' copied' : ''}`}
              title={copied ? '곡명 복사됨' : '곡명 복사'}
              onClick={handleCopyName}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>
          )}
          <PersonalCategoryPicker songId={song.id} className="pcat-row-btn" iconOnly />
        </div>
      </div>

      {showKoreaName && (
        <div className="td korea-name-cell" title={song.korea_name || ''}>
          {song.korea_name || <span className="muted-dash">—</span>}
        </div>
      )}

      {/* 아티스트 */}
      <div className="td artist-cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {song.artist}
      </div>

      {/* 난이도 */}
      <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }}>
        <span className="level-val">
          <span className="int">{lvInt}</span>
          <span className="dec">{lvDec}</span>
        </span>
      </div>

      {/* 유저 난이도 */}
      <div className="td num">
        {song.user_level_avg != null
          ? <span className="user-lv">{song.user_level_avg.toFixed(1)}</span>
          : <span className="user-lv-empty">—</span>
        }
      </div>

      {/* BPM */}
      <div className="td num bpm-cell">
        <span className="bpm-num">{fmtBpm(song.bpm)}</span>
        <div className="bpm-wave">
          {bpmWaveBars(song.bpm).map((style, i) => <div key={i} className="bar" style={style} />)}
        </div>
      </div>

      {/* 콤보 */}
      <div className="td num">
        <span className="combo-num">{fmt(song.combo)}</span>
        <div className="combo-bar">
          <div style={{ width: `${comboPct}%` }} />
        </div>
      </div>

      {/* 시간 */}
      <div className="td num" style={{ color: 'var(--fg-2)' }}>{song.time}</div>

      {tableMode === 'personalCategory' ? (
        <div className="td center">
          <button
            className="pcat-song-delete"
            disabled={!canDelete}
            title={canDelete ? '카테고리에서 삭제' : '수정 권한이 필요해요'}
            aria-label="카테고리에서 삭제"
            onClick={e => { e.stopPropagation(); if (canDelete) onDeleteSong?.(song) }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : showPlayCount ? (
        <div className="td num" style={{ color: song.play_count ? 'var(--fg-2)' : 'var(--fg-4)' }}>
          {song.play_count ? fmt(song.play_count) : '—'}
        </div>
      ) : showFavoriteCount ? (
        <div className="td num" style={{ color: song.favorite_count ? 'var(--fg-2)' : 'var(--fg-4)' }}>
          {song.favorite_count ? fmt(song.favorite_count) : '—'}
        </div>
      ) : null}

      {/* 변속 */}
      <div className="td center">
        <span className={`variant${song.is_change ? ' has' : ''}`}>
          {song.is_change ? '✓' : '×'}
        </span>
      </div>
    </div>
  )
}

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
}) {
  const { sort, setSort, openModal, search, quick, user, favorites, toggleFavorite, isAdmin } = useStore()
  const canFav = !!user
  const showKoreaName = isXyxMode()
  const showFavoriteCount = tableMode !== 'personalCategory' && (quick === 'favorite' || quick === 'popular')
  const showPlayCount = !showFavoriteCount && !(showKoreaName && tableMode !== 'personalCategory')
  const colTemplate = showKoreaName
    ? (tableMode === 'personalCategory'
      ? XYX_CATEGORY_COL_TEMPLATE
      : (showFavoriteCount ? XYX_CATEGORY_COL_TEMPLATE : XYX_COL_TEMPLATE))
    : COL_TEMPLATE
  const baseHeaders = showKoreaName
    ? (tableMode === 'personalCategory'
      ? XYX_CATEGORY_HEADERS
      : (showFavoriteCount ? xyxFavoriteCountHeaders : XYX_HEADERS))
    : DEFAULT_HEADERS
  const headers = tableMode === 'personalCategory'
    ? personalCategoryHeaders(baseHeaders)
    : (showFavoriteCount && !showKoreaName ? favoriteCountHeaders(baseHeaders) : baseHeaders)
  const listRef = useRef(null)
  const scrollOffsetRef = useRef(0)
  const savedOffsetRef = useRef(0)
  const prevSearchRef = useRef(search)
  const restoredScrollRef = useRef(false)

  const items = useMemo(() => {
    if (!fuzzy.length) return exact
    return [...exact, SEPARATOR, ...fuzzy]
  }, [exact, fuzzy])

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

  const handleScroll = useCallback(({ scrollOffset }) => {
    scrollOffsetRef.current = scrollOffset
    setCurrentListScrollOffset(scrollOffset)
  }, [])

  useEffect(() => {
    if (restoredScrollRef.current || !shouldRestoreListState() || items.length === 0) return
    restoredScrollRef.current = true
    const offset = Math.max(0, Number(readSavedListState()?.scrollOffset) || 0)
    if (!offset) return
    requestAnimationFrame(() => {
      listRef.current?.scrollTo(offset)
      scrollOffsetRef.current = offset
      setCurrentListScrollOffset(offset)
    })
  }, [items.length])

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
        colTemplate={colTemplate}
      />
    )
  }, [items, handleRowClick, isMobile, favorites, canFav, toggleFavorite, isAdmin, tableMode, canDeleteSongs, onDeleteSong, showKoreaName, showPlayCount, showFavoriteCount, colTemplate])

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
                {({ height, width }) => (
                  <FixedSizeList
                    ref={listRef}
                    height={height}
                    width={width}
                    itemCount={items.length}
                    itemSize={80}
                    onScroll={handleScroll}
                  >
                    {Row}
                  </FixedSizeList>
                )}
              </AutoSizer>
            </div>
          )
        }
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <TableHeader sort={sort} onSort={setSort} headers={headers} colTemplate={colTemplate} />
      <SearchFilterHint suggestion={categorySuggestion} empty={items.length === 0} />
      <div className={`tbl-body${items.length === 0 ? ' tbl-body-empty' : ''}`} style={{ flex: 1, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <SearchEmptyState search={search} />
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                ref={listRef}
                height={height}
                width={width}
                itemCount={items.length}
                itemSize={44}
                style={{ overflowX: 'hidden' }}
                onScroll={handleScroll}
              >
                {Row}
              </FixedSizeList>
            )}
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
