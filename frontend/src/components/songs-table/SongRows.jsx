import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import useStore from '../../store/useStore'
import { artworkBg, bpmWaveBars, fmt, fmtBpm, levelBarColor, staticUrl } from '../../utils/helpers'
import { logPlay } from '../../api/client'
import PersonalCategoryPicker from '../PersonalCategoryPicker'
import { SONG_ROW_HEIGHT } from './songGroups'

const COMBO_WARNING_TEXT = '공방에서 해당 노래 올콤하면 튕기는 버그가 있으니 주의하세요.'
const XYX_ARTWORK_CACHE_VERSION = '20260902'

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
  const source = staticUrl(image)
  const imageSrc = String(image).replace(/^\/+/, '').startsWith('xyx/')
    ? `${source}?v=${XYX_ARTWORK_CACHE_VERSION}`
    : source

  return (
    <img
      src={imageSrc}
      alt=""
      draggable={false}
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
      onError={e => { e.currentTarget.style.display = 'none' }}
    />
  )
}

function SharedSongValue({ songs, index, className = '', children }) {
  if (index !== 0) return null
  return (
    <div
      className={`group-shared-value ${className}`}
      style={{ height: songs.length * SONG_ROW_HEIGHT }}
    >
      {children}
    </div>
  )
}

export function useElementWidth() {
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

export function MobileCard({ song, style, onClick, isFav, canFav, onToggleFav, canDelete, onDeleteSong, showFavoriteCount, active = false }) {
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
        {song.image
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

export function SongRow({
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
  userLevel = song.user_level_avg,
  hiddenColumns,
  colTemplate,
  compact,
  active = false,
  groupSongs = null,
  groupIndex = 0,
}) {
  const [copied, setCopied] = useState(false)
  const lvInt = Math.floor(song.level)
  const lvDec = song.level % 1 === 0 ? '.0' : '.5'
  const comboPct = Math.min(100, (song.combo / 2000) * 100)
  const bpmTier =
    song.bpm >= 220 ? 'hot'
      : song.bpm >= 200 ? 'warm'
      : song.bpm < 120 ? 'cool'
      : undefined
  const showColumn = (key) => !hiddenColumns?.has(key)
  const groupActionsWidth = groupSongs ? Math.max(...groupSongs.map(member =>
    (member.combo_warning ? 44 : 0) + (member.youtube_url ? 26 : 0) +
    (compact ? 0 : 34 + (isAdmin ? 30 : 0))
  )) : 0
  const rowStyle = { ...style, gridTemplateColumns: colTemplate, ...(groupSongs && { '--group-actions-width': `${groupActionsWidth}px` }) }
  const sharedValue = (value, className = '') => groupSongs
    ? <SharedSongValue songs={groupSongs} index={groupIndex} className={className}>{value}</SharedSongValue>
    : value
  const sharedTitle = groupSongs && sharedValue(
    <>
      <div className="title-thumb" style={{ background: artworkBg(groupSongs[0].id) }}>
        {groupSongs.some(member => member.image) && <ArtworkThumbnail image={groupSongs.find(member => member.image).image} />}
      </div>
      <span className="title-main" title={`${song.name} - ${song.artist}`}>{song.name}</span>
    </>,
    'group-shared-title'
  )

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
        className={`tbl-row tbl-row-compact${groupSongs ? ' tbl-row-grouped' : ''}${active ? ' is-catalog-active' : ''}`}
        data-song-id={song.id}
        data-bpm-tier={bpmTier}
        style={rowStyle}
        role="row"
        tabIndex={0}
        aria-label={rowAriaLabel(song)}
        onClick={() => onClick(song)}
        onKeyDown={e => openRowFromKeyboard(e, song, onClick)}
      >
        <div className={`td${groupSongs ? ' group-name-cell' : ''}`} role="cell" data-column="name">
          <div className="title-cell">
            {sharedTitle}
            {!groupSongs && <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
              {song.image
                ? <ArtworkThumbnail image={song.image} />
                : null
              }
            </div>}
            {song.combo_warning && (
              <span className="combo-warning-tag" title={COMBO_WARNING_TEXT}>팅곡</span>
            )}
            {!groupSongs && <span className="title-main">{song.name}</span>}
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

        {showColumn('artist') && <div className={`td artist-cell${groupSongs ? ' group-shared-cell' : ''}`} role="cell" data-column="artist" aria-rowspan={groupSongs && groupIndex === 0 ? groupSongs.length : undefined} aria-hidden={groupSongs && groupIndex > 0 ? true : undefined}>
          {sharedValue(song.artist)}
        </div>}

        {showColumn('level') && <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }} role="cell">
          <span className="level-val">
            <span className="int">{lvInt}</span>
            <span className="dec">{lvDec}</span>
          </span>
        </div>}
      </div>
    )
  }

  return (
    <div
      className={`tbl-row${groupSongs ? ' tbl-row-grouped' : ''}${active ? ' is-catalog-active' : ''}`}
      data-song-id={song.id}
      data-bpm-tier={bpmTier}
      style={rowStyle}
      role="row"
      tabIndex={0}
      aria-label={rowAriaLabel(song)}
      onClick={() => onClick(song)}
      onKeyDown={e => openRowFromKeyboard(e, song, onClick)}
    >
      {showColumn('file_order') && <div className="td" role="cell">
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
      </div>}

      <div className={`td${groupSongs ? ' group-name-cell' : ''}`} role="cell" data-column="name">
        <div className="title-cell">
          {sharedTitle}
          {!groupSongs && <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
            {song.image
              ? <ArtworkThumbnail image={song.image} />
              : null
            }
          </div>}
          {song.combo_warning && (
            <span className="combo-warning-tag" title={COMBO_WARNING_TEXT}>팅곡</span>
          )}
          {!groupSongs && <span className="title-main">{song.name}</span>}
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

      {showColumn('artist') && (
        <div className={`td artist-cell${groupSongs ? ' group-shared-cell' : ''}`} role="cell" data-column="artist" aria-rowspan={groupSongs && groupIndex === 0 ? groupSongs.length : undefined} aria-hidden={groupSongs && groupIndex > 0 ? true : undefined}>
          {sharedValue(song.artist)}
        </div>
      )}

      <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }} role="cell">
        <span className="level-val">
          <span className="int">{lvInt}</span>
          <span className="dec">{lvDec}</span>
        </span>
      </div>

      {showColumn('userLevel') && (
        <div className="td num" role="cell">
          {userLevel != null
            ? <span className="user-lv">{userLevel.toFixed(1)}</span>
            : <span className="user-lv-empty">—</span>
          }
        </div>
      )}

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

      {showColumn('combo') && (
        <div className="td num" role="cell">
          <span className="combo-num">{fmt(song.combo)}</span>
          <div className="combo-bar">
            <div style={{ width: `${comboPct}%` }} />
          </div>
        </div>
      )}

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
        <div className={`td num${groupSongs ? ' group-shared-cell' : ''}`} style={{ color: song.play_count ? 'var(--fg-2)' : 'var(--fg-4)' }} role="cell" data-column="play_count" aria-rowspan={groupSongs && groupIndex === 0 ? groupSongs.length : undefined} aria-hidden={groupSongs && groupIndex > 0 ? true : undefined}>
          {sharedValue(song.play_count ? fmt(song.play_count) : '—')}
        </div>
      ) : showFavoriteCount && showColumn('favorite_count') ? (
        <div className="td num" style={{ color: song.favorite_count ? 'var(--fg-2)' : 'var(--fg-4)' }} role="cell">
          {song.favorite_count ? fmt(song.favorite_count) : '—'}
        </div>
      ) : null}

      {showColumn('variant') && <div className="td center" role="cell">
        <span className={`variant${song.is_change ? ' has' : ''}`}>
          {song.is_change ? '✓' : '×'}
        </span>
      </div>}
    </div>
  )
}
