import { useCallback, useMemo, useRef, useEffect } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import useStore from '../../store/useStore'
import { levelBarColor, artworkBg } from '../../utils/helpers'

const COL_TEMPLATE = '56px 72px 2fr 1fr 96px'

const HEADERS = [
  { label: '',         key: null,         cls: '' },
  { label: '#',        key: 'game_index', cls: 'num' },
  { label: '곡명',     key: 'name',       cls: '' },
  { label: '아티스트', key: 'artist',     cls: '' },
  { label: '난이도',   key: 'level',      cls: 'num' },
]

function YoutubeLinkIcon({ song }) {
  if (!song.youtube_url) return null
  return (
    <button
      type="button"
      className="song-youtube-icon"
      title="YouTube에서 듣기"
      aria-label="YouTube에서 듣기"
      onClick={e => {
        e.stopPropagation()
        window.open(song.youtube_url, '_blank', 'noopener,noreferrer')
      }}
    >
      ♪
    </button>
  )
}

function TableHeader({ sort, onSort }) {
  return (
    <div className="tbl-header" style={{ gridTemplateColumns: COL_TEMPLATE }}>
      {HEADERS.map(({ label, key, cls }, i) => (
        <div
          key={i}
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

function SongRow({ song, style, onClick, isFav, canFav, onToggleFav }) {
  const displayLv = song.level / 2
  const lvInt = Math.floor(displayLv)
  const lvDec = displayLv % 1 === 0 ? '.0' : '.5'

  return (
    <div
      className="tbl-row"
      style={{ ...style, gridTemplateColumns: COL_TEMPLATE }}
      onClick={() => onClick?.(song)}
    >
      <div className="td">
        <div className="idx-cell">
          <button
            className={`fav-btn${isFav ? ' on' : ''}`}
            title={canFav ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 이용 가능'}
            onClick={e => { e.stopPropagation(); if (canFav) onToggleFav(song.id) }}
            disabled={!canFav}
          >{isFav ? '★' : '☆'}</button>
        </div>
      </div>

      <div className="td num" style={{ color: 'var(--fg-3)' }}>{song.game_index}</div>

      <div className="td">
        <div className="title-cell">
          <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
            {song.image && (
              <img
                src={`${import.meta.env.VITE_API_URL ?? ''}/static/${song.image}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                onError={e => {
                  const el = e.currentTarget
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1'
                    const basename = song.image.split('/').pop()
                    el.src = `${import.meta.env.VITE_API_URL ?? ''}/static/rnr_image/img_music/${basename}`
                  } else {
                    el.style.display = 'none'
                  }
                }}
              />
            )}
          </div>
          <span className="title-main">{song.name}</span>
          <YoutubeLinkIcon song={song} />
        </div>
      </div>

      <div className="td artist-cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {song.artist}
      </div>

      <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(displayLv) }}>
        <span className="level-val">
          <span className="int">{lvInt}</span>
          <span className="dec">{lvDec}</span>
        </span>
      </div>
    </div>
  )
}

// pmang 곡은 BPM/변속/체감난이도 데이터가 없어 메타 라인이 더 간소함.
function MobileCard({ song, style, onClick, isFav, canFav, onToggleFav }) {
  const displayLv = song.level / 2
  const cat = displayLv >= 7 ? 'sun' : displayLv >= 4 ? 'moon' : 'star'
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div className="mob-card" style={style} onClick={() => onClick?.(song)}>
      {canFav && (
        <button
          className={`mob-fav-btn${isFav ? ' on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleFav(song.id) }}
          aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >{isFav ? '★' : '☆'}</button>
      )}
      <div className="mob-art" style={{ background: artworkBg(song.id) }}>
        {song.image
          ? <img
              src={`${import.meta.env.VITE_API_URL ?? ''}/static/${song.image}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
              onError={e => {
                const el = e.currentTarget
                if (!el.dataset.fallback) {
                  el.dataset.fallback = '1'
                  const basename = song.image.split('/').pop()
                  el.src = `${import.meta.env.VITE_API_URL ?? ''}/static/rnr_image/img_music/${basename}`
                } else {
                  el.style.display = 'none'
                }
              }}
            />
          : <span style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, fontSize: 13, color: 'oklch(0.98 0.01 270 / 0.9)' }}>
              {initials}
            </span>
        }
      </div>
      <div className="mob-card-main">
        <div className="mob-card-title">
          <span className="mob-card-name">{song.name}</span>
        </div>
        <div className="mob-card-artist">{song.artist}</div>
        <div className="mob-card-inline">
          <span className="mob-lv" data-cat={cat}>Lv {displayLv.toFixed(1)}</span>
          <span className="mob-sep">·</span>
          <span style={{ color: 'var(--fg-4)' }}>#{song.game_index}</span>
        </div>
      </div>
    </div>
  )
}

const SEPARATOR = { __type: 'separator' }

export default function PmangSongsTable({ exact, fuzzy, search, sort, onSort, onRowClick, isMobile = false }) {
  const { user, pmangFavorites, togglePmangFavorite } = useStore()
  const canFav = !!user
  const listRef = useRef(null)

  const scrollOffsetRef = useRef(0)
  const savedOffsetRef = useRef(0)
  const prevSearchRef = useRef(search)

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
  }, [])

  const Row = useCallback(({ index, style }) => {
    const item = items[index]
    if (item === SEPARATOR) {
      return (
        <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--fg-4)', fontSize: 12 }}>
          <div style={{ width: 100, height: 1, background: 'var(--line-soft)', flexShrink: 0 }} />
          혹시 이런 곡을 찾으셨나요?
          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        </div>
      )
    }
    const isFav = pmangFavorites?.has(item.id)
    if (isMobile) {
      return (
        <MobileCard
          song={item}
          style={style}
          onClick={onRowClick}
          isFav={isFav}
          canFav={canFav}
          onToggleFav={togglePmangFavorite}
        />
      )
    }
    return (
      <SongRow
        song={item}
        style={style}
        onClick={onRowClick}
        isFav={isFav}
        canFav={canFav}
        onToggleFav={togglePmangFavorite}
      />
    )
  }, [items, onRowClick, pmangFavorites, canFav, togglePmangFavorite, isMobile])

  if (isMobile) {
    const totalCount = exact.length + fuzzy.length
    return (
      <div className="mob-list-wrap">
        <div className="mob-meta">
          <span><b>{totalCount.toLocaleString()}</b> 곡</span>
        </div>
        {totalCount === 0
          ? (
            <div className="mob-empty">
              <div className="mob-empty-icon">♩</div>
              조건에 맞는 곡이 없어요
            </div>
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
      <TableHeader sort={sort} onSort={onSort} />
      <div className="tbl-body" style={{ flex: 1, overflow: 'hidden' }}>
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
      </div>
    </div>
  )
}
