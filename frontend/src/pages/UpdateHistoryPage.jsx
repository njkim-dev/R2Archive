import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AutoSizer from 'react-virtualized-auto-sizer'
import { VariableSizeList } from 'react-window'
import { ChevronDown, ExternalLink, Search } from 'lucide-react'
import MobilePageNav from '../components/MobilePageNav'
import PageNavigation from '../components/PageNavigation'
import ServerSwitcher from '../components/ServerSwitcher'
import ArchiveBrand from '../components/ArchiveBrand'
import ReleaseDatePicker from '../components/update-history/ReleaseDatePicker'
import { useMobile } from '../hooks/useMobile'
import { filterReleaseHistory, formatReleaseDate, formatReleaseTitle, releaseWeekday } from '../utils/releaseHistory'
import { levelBarColor, staticUrl } from '../utils/helpers'
import useStore from '../store/useStore'
import '../styles/update-history.css'

function HistorySidebar() {
  return (
    <aside className="side rh-sidebar">
      <ArchiveBrand />
      <ServerSwitcher />
      <PageNavigation />
    </aside>
  )
}

function HistoryMobileHeader() {
  return (
    <header className="rh-mobile-head">
      <div className="rh-mobile-head-row">
        <Link to="/" className="rh-mobile-brand" aria-label="곡 목록으로 이동">
          <span className="brand-mark" aria-hidden="true">R2</span>
          <span>R2Music Archive</span>
        </Link>
        <ServerSwitcher className="rh-mobile-server" />
      </div>
      <MobilePageNav />
    </header>
  )
}

function SongRow({ song, onOpenVariant }) {
  const highestVariant = song.variants?.at(-1)
  return (
    <div className="rh-song-row">
      <div className="rh-song-art" aria-hidden="true">
        {song.image && <img src={staticUrl(song.image)} alt="" draggable={false} onError={event => { event.currentTarget.style.display = 'none' }} />}
      </div>
      <button
        type="button"
        className="rh-song-name"
        title={`${song.name} 최고 난이도 카탈로그 열기`}
        disabled={!highestVariant}
        onClick={() => onOpenVariant(song, highestVariant)}
      >
        {song.name}
      </button>
      <div className="rh-song-artist" title={song.artist}>{song.artist}</div>
      <div className="rh-levels" aria-label={`난이도 ${song.levels.join(', ')}`}>
        {(song.variants || []).map(variant => (
          <button
            type="button"
            key={variant.id}
            style={{ '--lv-bar': levelBarColor(variant.level) }}
            title={`난이도 ${Number(variant.level).toFixed(1)} 카탈로그 열기`}
            aria-label={`난이도 ${Number(variant.level).toFixed(1)} 카탈로그 열기`}
            onClick={() => onOpenVariant(song, variant)}
          >
            {Number(variant.level).toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

function HistoryCard({ entry, expanded, onToggle, onOpenVariant }) {
  return (
    <div className="rh-history-item">
      <div className="rh-date-column">
        <strong>{formatReleaseDate(entry.release_date)}</strong>
        <span>{releaseWeekday(entry.release_date)}</span>
      </div>
      <div className="rh-rail" aria-hidden="true"><span /></div>
      <article className={`rh-release-card${expanded ? ' is-open' : ''}`}>
        <div
          className={`rh-card-head${entry.songs.length > 0 ? ' is-toggleable' : ''}`}
          onClick={entry.songs.length > 0 ? onToggle : undefined}
        >
          <h2>{formatReleaseTitle(entry.release_date)}</h2>
          <span className="rh-song-count">{entry.songs.length.toLocaleString()}곡</span>
          {entry.notice_url && (
            <a
              className="rh-notice-link"
              href={entry.notice_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => event.stopPropagation()}
            >
              공식 공지 <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          {entry.songs.length > 0 && (
            <button
              type="button"
              className="rh-expand"
              aria-label={`${formatReleaseTitle(entry.release_date)} 음원 목록 ${expanded ? '접기' : '펼치기'}`}
              aria-expanded={expanded}
              onClick={event => {
                event.stopPropagation()
                onToggle()
              }}
            >
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        {expanded && (
          <div className="rh-card-body">
            {entry.songs.map(song => <SongRow key={`${song.name}\u0000${song.artist}`} song={song} onOpenVariant={onOpenVariant} />)}
          </div>
        )}
      </article>
    </div>
  )
}

export default function UpdateHistoryPage() {
  const mobile = useMobile()
  const openModal = useStore(state => state.openModal)
  const listRef = useRef(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [expandedDates, setExpandedDates] = useState(() => new Set())

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/release-history', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('업데이트 내역을 불러오지 못했습니다.')
        return response.json()
      })
      .then(data => {
        setEntries(data)
        setExpandedDates(new Set(data[0] ? [data[0].release_date] : []))
        setError('')
      })
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message || '업데이트 내역을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const filteredEntries = useMemo(
    () => filterReleaseHistory(entries, query, selectedDate),
    [entries, query, selectedDate],
  )
  const forceExpanded = Boolean(query.trim() || selectedDate)

  useEffect(() => {
    listRef.current?.resetAfterIndex(0, true)
  }, [filteredEntries, expandedDates, mobile])

  const toggleEntry = useCallback(date => {
    setExpandedDates(current => {
      const next = new Set(current)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }, [])

  const openVariant = useCallback((song, variant) => {
    if (!variant) return
    openModal({
      id: variant.id,
      name: song.name,
      artist: song.artist,
      image: song.image,
      level: variant.level,
    }, { preservePath: true })
  }, [openModal])

  const itemSize = useCallback(index => {
    const entry = filteredEntries[index]
    const expanded = forceExpanded || expandedDates.has(entry.release_date)
    const collapsedHeight = mobile ? 114 : 88
    const rowHeight = mobile ? 66 : 60
    return expanded && entry.songs.length > 0 ? collapsedHeight + entry.songs.length * rowHeight + 12 : collapsedHeight
  }, [expandedDates, filteredEntries, forceExpanded, mobile])

  const itemKey = useCallback((index, data) => data[index].release_date, [])

  const content = (
    <main className="main rh-main">
      <header className="rh-page-head">
        <div className="rh-eyebrow">RELEASE ARCHIVE</div>
        <h1>업데이트 내역</h1>
      </header>

      <div className="rh-toolbar">
        <label className="rh-search">
          <span className="sr-only">곡명 또는 아티스트 검색</span>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="곡명 또는 아티스트 검색"
            autoComplete="off"
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <ReleaseDatePicker entries={entries} value={selectedDate} onChange={setSelectedDate} />
      </div>

      <section className="rh-list-shell" aria-label="날짜별 업데이트 내역">
        {loading ? (
          <div className="rh-status" role="status">업데이트 내역을 불러오는 중…</div>
        ) : error ? (
          <div className="rh-status is-error" role="alert">{error}</div>
        ) : filteredEntries.length === 0 ? (
          <div className="rh-status" role="status">조건에 맞는 업데이트가 없습니다.</div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <VariableSizeList
                ref={listRef}
                className="rh-virtual-list"
                height={height}
                width={width}
                itemCount={filteredEntries.length}
                itemData={filteredEntries}
                itemKey={itemKey}
                itemSize={itemSize}
                overscanCount={4}
              >
                {({ index, style, data }) => {
                  const entry = data[index]
                  const expanded = forceExpanded || expandedDates.has(entry.release_date)
                  return (
                    <div className="rh-virtual-row" style={style}>
                      <HistoryCard
                        entry={entry}
                        expanded={expanded}
                        onToggle={() => toggleEntry(entry.release_date)}
                        onOpenVariant={openVariant}
                      />
                    </div>
                  )
                }}
              </VariableSizeList>
            )}
          </AutoSizer>
        )}
      </section>
    </main>
  )

  if (mobile) {
    return <div className="app-mobile rh-mobile-page"><HistoryMobileHeader />{content}</div>
  }
  return <div className="app rh-app"><HistorySidebar />{content}</div>
}
