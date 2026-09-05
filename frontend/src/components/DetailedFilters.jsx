import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FixedSizeList } from 'react-window'
import { LockKeyhole, Moon, RotateCcw, Search, Shield, SlidersHorizontal, Star, Sun, X } from 'lucide-react'
import useStore from '../store/useStore'
import { filterSongs } from '../utils/helpers'
import { AI_MODES, allowedQuickFilter, buildArtistCatalog, defaultDetailedFilters, normalizeDetailedFilters, visibleQuickFilters } from '../utils/catalogFilters'
import { isXyxMode } from '../utils/serverMode'

const SORT_ROWS = [
  { key: 'file_order', label: '날짜', options: [['desc', '최신곡순'], ['asc', '구곡순']] },
  { key: 'level', label: '난이도', options: [['desc', '높은 순'], ['asc', '낮은 순']] },
  { key: 'bpm', label: 'BPM', options: [['desc', '빠른 순'], ['asc', '느린 순']] },
  { key: 'name', label: '곡명', options: [['asc', '오름차순'], ['desc', '내림차순']] },
  { key: 'artist', label: '아티스트', options: [['asc', '오름차순'], ['desc', '내림차순']] },
]
const CHANNELS = [
  { key: null, label: '전체' },
  { key: 'star', label: '별', Icon: Star },
  { key: 'moon', label: '달', Icon: Moon },
  { key: 'sun', label: '해', Icon: Sun },
]

function ArtistRow({ index, style, data }) {
  const { artist, count } = data.items[index]
  return (
    <label className="detailed-artist-row" style={style} title={`${artist} (${count.toLocaleString()}곡)`}>
      <input type="checkbox" checked={data.selected.has(artist)} onChange={() => data.toggle(artist)} aria-label={artist} />
      <span className="detailed-artist-name">{artist}</span>
      <span className="detailed-artist-count">{count.toLocaleString()}곡</span>
    </label>
  )
}

function NumberRange({ label, minKey, maxKey, min, max, step, draft, update }) {
  return (
    <section>
      <h3>{label}</h3>
      <div className="detailed-range">
        <input type="number" min={min} max={max} step={step} value={draft[minKey] ?? ''}
          placeholder={String(min ?? '')} aria-label={`${label} 최솟값`} onChange={e => update(minKey, e.target.value)} />
        <span aria-hidden="true">~</span>
        <input type="number" min={min} max={max} step={step} value={draft[maxKey] ?? ''}
          placeholder={String(max ?? '')} aria-label={`${label} 최댓값`} onChange={e => update(maxKey, e.target.value)} />
      </div>
    </section>
  )
}

function FilterDialog({ songs, isMobile }) {
  const { meta, user, isAdmin, search, searchMode, excludeSearch, favorites, played, playedAll } = useStore()
  const xyxMode = isXyxMode()
  const [draft, setDraft] = useState(() => normalizeDetailedFilters(useStore.getState(), meta))
  const [artistSearch, setArtistSearch] = useState('')
  const draftRef = useRef(draft)
  const overlayRef = useRef(null)
  const panelRef = useRef(null)
  const artistListRef = useRef(null)
  draftRef.current = draft

  const close = useCallback(() => {
    useStore.getState().applyDetailedFilters(draftRef.current)
  }, [])

  useEffect(() => {
    useStore.getState().applyDetailedFilters(draft, { close: false })
  }, [draft])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const background = [...document.body.children]
      .filter(element => element instanceof HTMLElement && element !== overlayRef.current)
      .map(element => ({ element, inert: element.inert }))
    background.forEach(({ element }) => { element.inert = true })
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('.detailed-close')?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
      } else if (event.key === 'Tab') {
        const controls = [...(panelRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled])') || [])]
          .filter(element => element.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      background.forEach(({ element, inert }) => { element.inert = inert })
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [close])

  const options = visibleQuickFilters({ xyxMode, isAdmin })
  const catalog = useMemo(() => {
    const { exact } = filterSongs(songs, { category: draft.category, aiMode: draft.aiMode, artists: new Set() })
    return buildArtistCatalog(exact)
  }, [songs, draft.category, draft.aiMode])
  const artists = useMemo(() => {
    const term = artistSearch.trim().normalize('NFKC').toLowerCase()
    return catalog.filter(item => item.artist.normalize('NFKC').toLowerCase().includes(term))
  }, [catalog, artistSearch])
  useEffect(() => { artistListRef.current?.scrollTo(0) }, [artists])

  const update = useCallback((key, value) => setDraft(current => ({ ...current, [key]: value })), [])
  const toggleArtist = useCallback(artist => setDraft(current => {
    const selected = new Set(current.artists)
    if (selected.has(artist)) selected.delete(artist)
    else selected.add(artist)
    return { ...current, artists: selected }
  }), [])
  const artistData = useMemo(() => ({ items: artists, selected: draft.artists, toggle: toggleArtist }), [artists, draft.artists, toggleArtist])

  const previewCount = useMemo(() => {
    const filters = normalizeDetailedFilters(draft, meta)
    filters.quick = allowedQuickFilter(filters.quick, { xyxMode, isAdmin, user })
    const { exact, fuzzy } = filterSongs(songs, {
      ...filters, search, searchMode, excludeSearch: !isMobile && excludeSearch,
      favorites, played: filters.category ? playedAll : played,
    })
    return exact.length + fuzzy.length
  }, [draft, meta, xyxMode, isAdmin, user, songs, search, searchMode, isMobile, excludeSearch, favorites, played, playedAll])

  return createPortal(
    <div className="detailed-filter-overlay" ref={overlayRef} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="detailed-filter-dialog" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="detailed-filter-title">
        <header className="detailed-filter-header">
          <h2 id="detailed-filter-title"><SlidersHorizontal size={18} aria-hidden="true" />상세 필터</h2>
          <button type="button" className="detailed-close" onClick={close} aria-label="상세 필터 닫기" title="닫기"><X size={20} /></button>
        </header>
        <div className="detailed-filter-scroll">
          <section className="detailed-quick-section">
            <h3 id="detailed-quick-title">빠른 필터</h3>
            <div className="detailed-quick-grid" role="radiogroup" aria-labelledby="detailed-quick-title">
              {options.map(option => {
                const disabled = option.needLogin && !user
                return (
                  <label className={`detailed-quick-option${disabled ? ' locked' : ''}`} key={option.key} title={disabled ? '로그인 후 이용 가능' : undefined}>
                    <input type="radio" name="detailed-quick" value={option.key} checked={draft.quick === option.key} disabled={disabled} onChange={() => update('quick', option.key)} />
                    <span>{option.label}</span>
                    {option.adminOnly && <Shield size={13} aria-label="관리자 전용" />}
                    {disabled && <LockKeyhole size={13} aria-hidden="true" />}
                  </label>
                )
              })}
            </div>
          </section>
          <div className="detailed-filter-body">
            <div className="detailed-conditions">
              <section><h3>채널</h3><div className="detailed-channels" role="group" aria-label="채널 선택">
                {CHANNELS.map(({ key, label, Icon }) => (
                  <button type="button" key={key || 'all'} data-channel={key || 'all'} aria-pressed={draft.category === key}
                    onClick={() => setDraft(current => ({ ...current, category: key, levelMin: meta?.level_min ?? null, levelMax: meta?.level_max ?? null }))}>
                    {Icon && <Icon size={15} aria-hidden="true" />}{label}
                  </button>
                ))}
              </div></section>
              <NumberRange label="난이도" minKey="levelMin" maxKey="levelMax" min={meta?.level_min ?? 0.5} max={meta?.level_max ?? 12} step="0.5" draft={draft} update={update} />
              <NumberRange label="BPM" minKey="bpmMin" maxKey="bpmMax" min={meta?.bpm_min ?? 0} max={meta?.bpm_max ?? 1000} step="any" draft={draft} update={update} />
              <label className="detailed-listen-option"><span>음악 듣기 제공 곡만</span><input type="checkbox" role="switch" checked={draft.listenOnly} onChange={event => update('listenOnly', event.target.checked)} /></label>
              <section><h3 id="detailed-ai-title">AI 생성 음원</h3><div className="detailed-ai-options" role="radiogroup" aria-labelledby="detailed-ai-title">
                {AI_MODES.map(option => (
                  <label key={option.key} title={option.title}>
                    <input type="radio" name="detailed-ai" value={option.key} checked={draft.aiMode === option.key} onChange={() => update('aiMode', option.key)} aria-label={`AI 생성 음원 ${option.label}`} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div></section>
            </div>
            <section className="detailed-artists">
              <div className="detailed-artist-heading"><h3>아티스트 <span>{draft.artists.size ? `${draft.artists.size}개 선택` : `${catalog.length}개`}</span></h3>
                <button type="button" onClick={() => update('artists', new Set())} disabled={!draft.artists.size}>선택 해제</button>
              </div>
              <label className="detailed-artist-search"><Search size={16} aria-hidden="true" /><input type="search" value={artistSearch} onChange={event => setArtistSearch(event.target.value)} placeholder="아티스트 검색" aria-label="아티스트 검색" /></label>
              <div className="detailed-artist-list" role="group" aria-label="곡명 수가 많은 순 아티스트 목록">
                {artists.length ? <FixedSizeList ref={artistListRef} width="100%" height={Math.min(320, artists.length * 40)} itemSize={40} itemCount={artists.length} itemData={artistData} itemKey={(index, data) => data.items[index].artist} overscanCount={8}>{ArtistRow}</FixedSizeList>
                  : <div className="detailed-empty">검색 결과가 없습니다.</div>}
              </div>
            </section>
          </div>
          {isMobile && <section className="detailed-sort-section"><h3>정렬</h3><div className="mob-sort-rows">
            {SORT_ROWS.map(row => <div className="mob-sort-row" key={row.key}><span className="mob-sort-row-label">{row.label}</span><div className="mob-sort-toggle">
              {row.options.map(([dir, label]) => <button type="button" key={dir} className={`mob-sort-tog${draft.sort.key === row.key && draft.sort.dir === dir ? ' on' : ''}`} aria-pressed={draft.sort.key === row.key && draft.sort.dir === dir} onClick={() => update('sort', { key: row.key, dir })}>{label}</button>)}
            </div></div>)}
          </div></section>}
        </div>
        <footer className="detailed-filter-footer">
          <button type="button" className="detailed-reset" onClick={() => { setDraft(defaultDetailedFilters(meta)); setArtistSearch('') }}><RotateCcw size={15} aria-hidden="true" />초기화</button>
          <span aria-live="polite"><b>{previewCount.toLocaleString()}</b>곡</span>
        </footer>
      </section>
    </div>, document.body,
  )
}

export default function DetailedFilters({ songs, isMobile = false }) {
  const open = useStore(state => state.mobileSheetOpen)
  return open ? <FilterDialog songs={songs} isMobile={isMobile} /> : null
}
