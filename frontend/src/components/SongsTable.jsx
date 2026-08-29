import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { Trash2 } from 'lucide-react'
import useStore from '../store/useStore'
import { levelBarColor, bpmWaveBars, fmt, fmtBpm, artworkBg, artworkThumbnailUrl, staticUrl } from '../utils/helpers'
import { logPlay } from '../api/client'
import PersonalCategoryPicker from './PersonalCategoryPicker'
import { isXyxMode } from '../utils/serverMode'
import { readRestorableListState, setCurrentListScrollOffset, shouldRestoreListState } from '../utils/listState'

const COMBO_WARNING_TEXT = '공방에서 해당 노래 올콤하면 튕기는 버그가 있으니 주의하세요.'
const loadedArtworkPaths = new Set()

function openRowFromKeyboard(e, song, onClick) {
  if (e.target !== e.currentTarget) return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onClick(song)
}

function rowAriaLabel(song) {
  return `${song.name}, ${song.artist}, 난이도 ${song.level.toFixed(1)}. Enter 또는 Space로 상세 열기`
}

function ArtworkThumbnail({ image }) {
  const optimizedSrc = artworkThumbnailUrl(image)
  const originalSrc = staticUrl(image)

  return (
    <img
      key={optimizedSrc}
      src={optimizedSrc}
      alt=""
      decoding="async"
      draggable={false}
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
      onLoad={() => loadedArtworkPaths.add(String(image))}
      onError={e => {
        const el = e.currentTarget
        if (optimizedSrc !== originalSrc && el.dataset.originalTried !== 'true') {
          el.dataset.originalTried = 'true'
          el.src = originalSrc
          return
        }
        el.style.display = 'none'
      }}
    />
  )
}

function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => setWidth(node.getBoundingClientRect().width)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect?.width
      if (nextWidth != null) setWidth(nextWidth)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

function MobileCard({ song, style, onClick, isFav, canFav, onToggleFav, canDelete, onDeleteSong, showFavoriteCount, suppressArtwork = false, active = false }) {
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
    <div
      className={`mob-card${active ? ' is-catalog-active' : ''}`}
      data-song-id={song.id}
      style={style}
      role="group"
      tabIndex={0}
      aria-label={rowAriaLabel(song)}
      onClick={() => onClick(song)}
      onKeyDown={e => openRowFromKeyboard(e, song, onClick)}
    >
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
        {song.image && !suppressArtwork
          ? <ArtworkThumbnail image={song.image} />
          : <span style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, fontSize: 13, color: 'oklch(0.98 0.01 270 / 0.9)' }}>
              {(song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </span>
        }
      </div>

      <div className="mob-card-main">
        <div className="mob-card-title">
          {song.is_new && <span className="mob-new-dot" />}
          {song.combo_warning && (
            <span className="combo-warning-tag" title={COMBO_WARNING_TEXT}>팅곡</span>
          )}
          <span className="mob-card-name">{song.name}</span>
        </div>
        {song.korea_name && (
          <div className="mob-card-korea">
            한국 곡명 : {song.korea_name}
          </div>
        )}
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
const COMPACT_COL_TEMPLATE = 'minmax(0, 1.45fr) minmax(110px, 0.9fr) 76px'
const LINKED_COMPACT_COL_TEMPLATE = 'minmax(0, 1.25fr) minmax(0, 1fr) minmax(100px, 0.8fr) 76px'
const XYX_COL_TEMPLATE = '50px minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 0.95fr) 68px 86px 94px 96px 58px 64px 46px'
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

const REAL_BPM_HEADER = { label: '원 BPM', key: 'real_bpm', cls: 'num' }
const DEFAULT_HEADERS_WITH_REAL_BPM = [
  ...DEFAULT_HEADERS.slice(0, 6),
  REAL_BPM_HEADER,
  ...DEFAULT_HEADERS.slice(6),
]

const XYX_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel'),
]

const FAVORITE_COUNT_HEADER = { label: '즐겨찾기', key: 'favorite_count', cls: 'num' }
const COMPACT_HEADERS = [
  { label: '곡명', key: 'name', cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
]
const compactLinkedHeaders = (label, key) => [
  { label: '곡명', key: 'name', cls: '' },
  { label, key, cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
]

const favoriteCountHeaders = (headers) => headers.map(header =>
  header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
)

const xyxFavoriteCountHeaders = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel').map(header =>
    header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
  ),
]

const XYX_CATEGORY_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel'),
]

const KOREA_NAME_HEADER = XYX_HEADERS[2]
const xyxHeaders = (showOriginalBpmColumn = false) => [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  KOREA_NAME_HEADER,
  ...DEFAULT_HEADERS.slice(2, 6).filter(header => header.key !== 'userLevel'),
  ...(showOriginalBpmColumn ? [REAL_BPM_HEADER] : []),
  ...DEFAULT_HEADERS.slice(6),
]
const xyxHeadersWithFavoriteCount = (showOriginalBpmColumn = false) =>
  xyxHeaders(showOriginalBpmColumn).map(header =>
    header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
  )

const personalCategoryHeaders = (headers) => headers.map(header =>
  header.key === 'play_count'
    ? { label: '삭제', key: null, cls: 'center' }
    : header
)

function hideColumnsForWidth(width, showOriginalBpmColumn) {
  const hidden = new Set()
  if (!width) return hidden
  if (width < 1180) {
    hidden.add('play_count')
    hidden.add('favorite_count')
  }
  if (width < 1080) hidden.add('userLevel')
  if (width < 980) hidden.add('time')
  if (width < 900) hidden.add('combo')
  if (showOriginalBpmColumn && width < 820) hidden.add('real_bpm')
  if (width < 740) hidden.add('artist')
  return hidden
}

function columnWidthForHeader(header) {
  if (header.key === 'file_order') return '56px'
  if (header.key === 'name') return 'minmax(240px, 2fr)'
  if (header.key === 'korea_name') return 'minmax(140px, 1.1fr)'
  if (header.key === 'artist') return 'minmax(120px, 1fr)'
  if (header.key === 'level') return '76px'
  if (header.key === 'userLevel') return '100px'
  if (header.key === 'bpm') return '100px'
  if (header.key === 'real_bpm') return '100px'
  if (header.key === 'combo') return '110px'
  if (header.key === 'time') return '68px'
  if (header.key === 'play_count' || header.key === 'favorite_count') return '80px'
  return '56px'
}

function templateFromHeaders(headers) {
  return headers.map(columnWidthForHeader).join(' ')
}

function TableHeader({ sort, onSort, headers = DEFAULT_HEADERS, colTemplate = COL_TEMPLATE }) {
  return (
    <div className="tbl-header" style={{ gridTemplateColumns: colTemplate }} role="row">
      {headers.map(({ label, key, cls }) => {
        const content = (
          <>
            {label}
            {key && sort.key === key && (
              <span className="arrow" aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</span>
            )}
            {key && sort.key !== key && (
              <span style={{ color: 'var(--fg-4)', fontSize: 9, opacity: 0.5 }} aria-hidden="true">⇅</span>
            )}
          </>
        )
        if (!key) {
          return <div key={label} className={`th ${cls}`} role="columnheader">{content}</div>
        }
        const direction = sort.key === key ? (sort.dir === 'asc' ? '오름차순' : '내림차순') : '정렬되지 않음'
        return (
          <button
            type="button"
            key={label}
            className={`th ${cls}${sort.key === key ? ' sorted' : ''}`}
            role="columnheader"
            aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            onClick={() => onSort(key)}
            aria-label={`${label} 기준 정렬, 현재 ${direction}`}
          >
            {content}
          </button>
        )
      })}
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
  showOriginalBpmColumn,
  hiddenColumns,
  colTemplate,
  compact,
  suppressArtwork,
  active = false,
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
  const showColumn = (key) => !hiddenColumns?.has(key)

  const handleCopyName = (e) => {
    e.stopPropagation()
    if (copied) return
    const copyText = `${song.name || ''} - ${song.artist || ''}`.trim()
    navigator.clipboard?.writeText(copyText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  if (compact) {
    return (
      <div
        className={`tbl-row tbl-row-compact${active ? ' is-catalog-active' : ''}`}
        data-song-id={song.id}
        data-bpm-tier={bpmTier}
        style={{ ...style, gridTemplateColumns: colTemplate }}
        role="row"
        tabIndex={0}
        aria-label={rowAriaLabel(song)}
        onClick={() => onClick(song)}
        onKeyDown={e => openRowFromKeyboard(e, song, onClick)}
      >
        <div className="td" role="cell">
          <div className="title-cell">
            <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
              {song.image && !suppressArtwork
                ? <ArtworkThumbnail image={song.image} />
                : null
              }
            </div>
            {song.combo_warning && (
              <span className="combo-warning-tag" title={COMBO_WARNING_TEXT}>팅곡</span>
            )}
            <span className="title-main">{song.name}</span>
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
          </div>
        </div>

        {showKoreaName && (
          <div className="td korea-name-cell" title={song.korea_name || ''} role="cell">
            {song.korea_name || <span className="muted-dash">—</span>}
          </div>
        )}

        <div className="td artist-cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} role="cell">
          {song.artist}
        </div>

        <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }} role="cell">
          <span className="level-val">
            <span className="int">{lvInt}</span>
            <span className="dec">{lvDec}</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`tbl-row${active ? ' is-catalog-active' : ''}`}
      data-song-id={song.id}
      data-bpm-tier={bpmTier}
      style={{ ...style, gridTemplateColumns: colTemplate }}
      role="row"
      tabIndex={0}
      aria-label={rowAriaLabel(song)}
      onClick={() => onClick(song)}
      onKeyDown={e => openRowFromKeyboard(e, song, onClick)}
    >
      {/* # / new tag */}
      <div className="td" role="cell">
        <div className="idx-cell">
          {song.is_new && <span className="new-tag">NEW</span>}
          <button
            className={`fav-btn${isFav ? ' on' : ''}`}
            title={canFav ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 이용 가능'}
            aria-label={canFav ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 즐겨찾기 이용 가능'}
            onClick={e => { e.stopPropagation(); if (canFav) onToggleFav(song.id) }}
            disabled={!canFav}
          >{isFav ? '★' : '☆'}</button>
        </div>
      </div>

      {/* 곡명 */}
      <div className="td" role="cell">
        <div className="title-cell">
          <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
            {song.image && !suppressArtwork
              ? <ArtworkThumbnail image={song.image} />
              : null
            }
          </div>
          {song.combo_warning && (
            <span className="combo-warning-tag" title={COMBO_WARNING_TEXT}>팅곡</span>
          )}
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
              title={copied ? '곡명 - 아티스트 복사됨' : '곡명 - 아티스트 복사'}
              aria-label={copied ? '곡명 - 아티스트 복사됨' : '곡명 - 아티스트 복사'}
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
        <div className="td korea-name-cell" title={song.korea_name || ''} role="cell">
          {song.korea_name || <span className="muted-dash">—</span>}
        </div>
      )}

      {/* 아티스트 */}
      {showColumn('artist') && (
        <div className="td artist-cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} role="cell">
          {song.artist}
        </div>
      )}

      {/* 난이도 */}
      <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }} role="cell">
        <span className="level-val">
          <span className="int">{lvInt}</span>
          <span className="dec">{lvDec}</span>
        </span>
      </div>

      {/* 유저 난이도 */}
      {showColumn('userLevel') && (
        <div className="td num" role="cell">
          {song.user_level_avg != null
            ? <span className="user-lv">{song.user_level_avg.toFixed(1)}</span>
            : <span className="user-lv-empty">—</span>
          }
        </div>
      )}

      {/* BPM */}
      <div className="td num bpm-cell" role="cell">
        <span className="bpm-num">{fmtBpm(song.bpm)}</span>
        <div className="bpm-wave">
          {bpmWaveBars(song.bpm).map((style, i) => <div key={i} className="bar" style={style} />)}
        </div>
      </div>

      {showOriginalBpmColumn && showColumn('real_bpm') && (
        <div className="td num bpm-cell real-bpm-cell" role="cell">
          <span className="bpm-num">{song.real_bpm != null ? fmtBpm(song.real_bpm) : '-'}</span>
          {song.real_bpm != null && (
            <div className="bpm-wave">
              {bpmWaveBars(song.real_bpm).map((style, i) => <div key={i} className="bar" style={style} />)}
            </div>
          )}
        </div>
      )}

      {/* 콤보 */}
      {showColumn('combo') && (
        <div className="td num" role="cell">
          <span className="combo-num">{fmt(song.combo)}</span>
          <div className="combo-bar">
            <div style={{ width: `${comboPct}%` }} />
          </div>
        </div>
      )}

      {/* 시간 */}
      {showColumn('time') && (
        <div className="td num" style={{ color: 'var(--fg-2)' }} role="cell">{song.time}</div>
      )}

      {tableMode === 'personalCategory' ? (
        <div className="td center" role="cell">
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
      ) : showPlayCount && showColumn('play_count') ? (
        <div className="td num" style={{ color: song.play_count ? 'var(--fg-2)' : 'var(--fg-4)' }} role="cell">
          {song.play_count ? fmt(song.play_count) : '—'}
        </div>
      ) : showFavoriteCount && showColumn('favorite_count') ? (
        <div className="td num" style={{ color: song.favorite_count ? 'var(--fg-2)' : 'var(--fg-4)' }} role="cell">
          {song.favorite_count ? fmt(song.favorite_count) : '—'}
        </div>
      ) : null}

      {/* 변속 */}
      <div className="td center" role="cell">
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
  compact = false,
}) {
  const { sort, setSort, openModal, search, quick, user, favorites, toggleFavorite, isAdmin, modalOpen, modalSong, showOriginalBpm } = useStore()
  const canFav = !!user
  const showKoreaName = isXyxMode()
  const showFavoriteCount = tableMode !== 'personalCategory' && (quick === 'favorite' || quick === 'popular')
  const showPlayCount = !showFavoriteCount && tableMode !== 'personalCategory'
  const [tableRef, tableWidth] = useElementWidth()
  const showOriginalBpmColumn = !compact && tableMode !== 'personalCategory' && showOriginalBpm
  const hiddenColumns = useMemo(
    () => {
      const hidden = !compact ? hideColumnsForWidth(tableWidth, showOriginalBpmColumn) : new Set()
      if (showKoreaName) hidden.add('userLevel')
      return hidden
    },
    [compact, showKoreaName, tableWidth, showOriginalBpmColumn]
  )
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
  const headers = !compact
    ? unfilteredHeaders.filter(header => !hiddenColumns.has(header.key))
    : unfilteredHeaders
  const colTemplate = compact
    ? (showKoreaName ? LINKED_COMPACT_COL_TEMPLATE : COMPACT_COL_TEMPLATE)
    : templateFromHeaders(headers)
  const listRef = useRef(null)
  const listHeightRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const scrollSampleRef = useRef({ offset: 0, time: 0 })
  const fastScrollTimerRef = useRef(null)
  const fastScrollingRef = useRef(false)
  const [fastScrolling, setFastScrolling] = useState(false)
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

    if (scrollUpdateWasRequested) return
    const now = performance.now()
    const previous = scrollSampleRef.current
    const elapsed = previous.time ? Math.max(1, now - previous.time) : Infinity
    const velocity = Math.abs(scrollOffset - previous.offset) / elapsed
    scrollSampleRef.current = { offset: scrollOffset, time: now }

    if (velocity >= 1.2 && !fastScrollingRef.current) {
      fastScrollingRef.current = true
      setFastScrolling(true)
    }
    clearTimeout(fastScrollTimerRef.current)
    fastScrollTimerRef.current = setTimeout(() => {
      fastScrollingRef.current = false
      setFastScrolling(false)
    }, 120)
  }, [])

  useEffect(() => () => clearTimeout(fastScrollTimerRef.current), [])

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
    const suppressArtwork = !!(fastScrolling && item.image && !loadedArtworkPaths.has(String(item.image)))
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
          suppressArtwork={suppressArtwork}
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
        hiddenColumns={hiddenColumns}
        colTemplate={colTemplate}
        compact={compact}
        suppressArtwork={suppressArtwork}
        active={active}
      />
    )
  }, [items, handleRowClick, isMobile, favorites, canFav, toggleFavorite, isAdmin, tableMode, canDeleteSongs, onDeleteSong, showKoreaName, showPlayCount, showFavoriteCount, showOriginalBpmColumn, hiddenColumns, colTemplate, compact, activeSongId, fastScrolling])

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
                      overscanCount={20}
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
                  overscanCount={20}
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
