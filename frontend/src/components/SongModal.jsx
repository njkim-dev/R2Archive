import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Check, ExternalLink, Layers } from 'lucide-react'
import useStore from '../store/useStore'
import { getPerceivedStats, getSong, logPlay, trackSongCatalogView } from '../api/client'
import { artworkBg, fmt, fmtBpm, getAnonId, staticUrl } from '../utils/helpers'
import { useMobile } from '../hooks/useMobile'
import PersonalCategoryPicker from './PersonalCategoryPicker'
import { isXyxMode, SERVER_LINKS } from '../utils/serverMode'
import { songCatalogUrl } from '../utils/catalogUrl'
import BpmTimelineSection, { BpmTimelineTable } from './song-modal/BpmTimeline'
import PerceivedSection from './song-modal/PerceivedSection'
import RecordsTab from './song-modal/RecordsTab'
import CommentsTab from './song-modal/CommentsTab'
import {
  PracticeSectionForm,
  PracticeSectionsSummary,
  SavedCategoryTags,
  UserPracticeSectionsTab,
  usePracticeSectionCount,
} from './song-modal/PracticeSections'

const COMBO_WARNING_TEXT = '공방에서 해당 노래 올콤하면 튕기는 버그가 있으니 주의하세요.'

function originalBpmText(song, detail) {
  const value = detail?.real_bpm ?? song?.real_bpm
  return value != null ? fmtBpm(value) : '-'
}

function MobileBpmTimeline({ timeline }) {
  return (
    <div className="mob-section">
      <div className="mob-section-title">BPM 변속 타임라인</div>
      <BpmTimelineTable timeline={timeline} compact />
    </div>
  )
}

function MobileDetail({ song, detail, onClose, difficultyVariants = [], onDifficultySelect }) {
  const [tab, setTab] = useState('overview')
  const [scrolled, setScrolled] = useState(false)
  const [perceivedStats, setPerceivedStats] = useState(null)
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const bodyRef = useRef(null)
  const anonId = getAnonId()
  const user = useStore(s => s.user)
  const favorites = useStore(s => s.favorites)
  const toggleFavorite = useStore(s => s.toggleFavorite)
  const isFav = favorites?.has(song.id)
  const xyxMode = isXyxMode()
  const practiceSectionCount = usePracticeSectionCount(song.id, !xyxMode)
  const counterpartUrl = getCounterpartUrl(song.counterpart)
  const counterpartLabel = getCounterpartLabel(song.counterpart)

  const cat = song.level >= 7 ? 'sun' : song.level >= 4 ? 'moon' : 'star'
  const catLabel = { star: '별 (1.5–3.5)', moon: '달 (4–6.5)', sun: '해 (7–12)' }[cat]
  const linkedName = song.korea_name
    ? { label: '한국 곡명', value: song.korea_name }
    : song.xyx_name
    ? { label: '중국 곡명', value: song.xyx_name }
    : null

  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  useEffect(() => {
    // 로그인 사용자의 익명 ID는 URL에 노출하지 않는다.
    getPerceivedStats(song.id, user ? '' : anonId).then(setPerceivedStats)
  }, [song.id, user?.id])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const handler = () => setScrolled(el.scrollTop > 60)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    setDifficultyOpen(false)
    setTab('overview')
    bodyRef.current?.scrollTo({ top: 0 })
  }, [song.id])

  useEffect(() => {
    if (tab === 'practice-user' && practiceSectionCount === 0) setTab('overview')
  }, [tab, practiceSectionCount])

  const handlePlay = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
  }

  const hasDifficultyVariants = difficultyVariants.length > 0
  const handleDifficultySelect = (targetSong) => {
    setDifficultyOpen(false)
    onDifficultySelect?.(targetSong)
  }

  return (
    <div ref={bodyRef} className="mob-detail-body">
      <div className={`mob-detail-top${scrolled ? ' scrolled' : ''}`}>
        <button className="mob-icon-btn" onClick={onClose} aria-label="뒤로">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="mob-detail-top-title">{song.name}</div>
        <button className="mob-icon-btn" onClick={() => {
          const url = songCatalogUrl(song.id)
          navigator.clipboard?.writeText(url)
        }} aria-label="링크 복사">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
          </svg>
        </button>
      </div>

      <div className="mob-hero">
        <div className="mob-hero-art" style={{ background: artworkBg(song.id) }}>
          {song.image
            ? <img
                src={staticUrl(song.image)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            : <span className="mob-hero-init">{initials}</span>
          }
        </div>
        <h1 className="mob-hero-title">{song.name}</h1>
        {linkedName && (
          <div className="mob-hero-linked-name">{linkedName.label} : {linkedName.value}</div>
        )}
        <div className="mob-hero-sub">{song.artist}{song.chapter ? ` · ${song.chapter}` : ''}</div>
        <div className="mob-hero-tags">
          <span className="mob-h-tag mob-h-tag-accent">LV {song.level.toFixed(1)}</span>
          {perceivedStats?.avg != null && (
            <span className="mob-h-tag" style={{ color: 'var(--fg-2)' }}>
              체감 {perceivedStats.avg.toFixed(1)}
            </span>
          )}
          {song.is_change && <span className="mob-h-tag">변속</span>}
          {song.is_new && <span className="mob-h-tag mob-h-tag-new">NEW</span>}
          <span className="mob-h-tag">{fmtBpm(song.bpm)} BPM</span>
          <span className="mob-h-tag">{song.time}</span>
        </div>
      </div>

      <div className="mob-actions">
        <button
          className="mob-act-btn mob-act-primary"
          onClick={handlePlay}
          disabled={!song.youtube_url}
          style={!song.youtube_url ? { opacity: 0.4 } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          음악 듣기
        </button>
        <button
          className="mob-act-btn mob-act-ghost"
          disabled={!user}
          style={!user ? { opacity: 0.4 } : (isFav ? { color: 'var(--accent, #ff6b9d)' } : {})}
          title={user ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '로그인 후 이용 가능'}
          onClick={() => { if (user) toggleFavorite(song.id) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
          </svg>
          즐겨찾기
        </button>
        <PersonalCategoryPicker
          songId={song.id}
          className="mob-act-btn mob-act-ghost pcat-mobile-action"
        />
        {counterpartUrl && (
          <button
            className="mob-act-btn mob-act-ghost pcat-mobile-action"
            onClick={() => navigateToCounterpart(counterpartUrl)}
          >
            <ExternalLink size={15} />
            {counterpartLabel}
          </button>
        )}
        <button
          className="mob-act-btn mob-act-ghost mob-difficulty-action"
          disabled={!hasDifficultyVariants}
          style={!hasDifficultyVariants ? { opacity: 0.4 } : undefined}
          title={hasDifficultyVariants ? '동일한 음악의 다른 난이도 보기' : '다른 난이도가 없습니다'}
          onClick={() => { if (hasDifficultyVariants) setDifficultyOpen(true) }}
        >
          <Layers size={15} strokeWidth={2.4} />
          다른 난이도로 이동
        </button>
      </div>

      {difficultyOpen && (
        <div className="mob-difficulty-backdrop" onClick={() => setDifficultyOpen(false)}>
          <div className="mob-difficulty-sheet" onClick={e => e.stopPropagation()}>
            <div className="mob-difficulty-head">
              <div>
                <b>다른 난이도로 이동</b>
                <span>{difficultyVariants.length}개</span>
              </div>
              <button type="button" onClick={() => setDifficultyOpen(false)} aria-label="닫기">닫기</button>
            </div>
            <div className="mob-difficulty-list">
              {difficultyVariants.map(variant => (
                <button
                  key={variant.id}
                  type="button"
                  className="mob-difficulty-row"
                  data-cat={catFromLevel(variant.level)}
                  onClick={() => handleDifficultySelect(variant)}
                >
                  <span className="mob-difficulty-info">
                    <span className="mob-difficulty-name">{variant.name}</span>
                    <span className="mob-difficulty-meta">
                    {fmtBpm(variant.bpm)} BPM · {fmt(variant.combo)} 콤보
                    </span>
                  </span>
                  <span className="mob-difficulty-level">LV {Number(variant.level).toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mob-stats">
        {[
          { lbl: '난이도', val: song.level?.toFixed(1), cat },
          { lbl: '게임 BPM', val: song.bpm?.toFixed(1) },
          { lbl: '콤보', val: fmt(song.combo) },
          { lbl: '시간', val: song.time },
        ].map(({ lbl, val, cat: c }) => (
          <div key={lbl} className="mob-stat">
            <div className="mob-stat-val" data-cat={c}>{val}</div>
            <div className="mob-stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>
      {song.combo_warning && (
        <div className="mob-combo-warning">
          {COMBO_WARNING_TEXT}
        </div>
      )}

      <div className="mob-tabs">
        {[
          { key: 'overview', label: '개요' },
          { key: 'records',  label: '플레이 영상' },
          ...(!xyxMode ? [
            { key: 'practice-new', label: '연습구간 등록' },
            ...(practiceSectionCount > 0 ? [{ key: 'practice-user', label: '유저 연습 구간' }] : []),
          ] : []),
          { key: 'comments', label: '댓글' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`mob-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mob-tab-body">
        {tab === 'overview' && (
          <>
            {detail?.is_change && detail?.bpm_timeline?.length > 0 && (
              <MobileBpmTimeline timeline={detail.bpm_timeline} />
            )}
            <PerceivedSection song={song} />
              <div className="mob-section">
              <div className="mob-section-title">메타 정보</div>
              <div className="mob-meta-grid">
                {[
                  { lbl: 'ID', val: song.id },
                  { lbl: '카테고리', val: catLabel },
                  { lbl: '음악 원 BPM', val: originalBpmText(song, detail) },
                  { lbl: '콤보', val: fmt(song.combo) },
                  { lbl: '변속', val: song.is_change ? '있음' : '없음' },
                  { lbl: '재생 수', val: `${(detail?.play_count ?? song.play_count ?? 0).toLocaleString()}회` },
                ].map(({ lbl, val }) => (
                  <div key={lbl} className="mob-meta-row">
                    <span className="mob-meta-lbl">{lbl}</span>
                    <span className="mob-meta-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'records' && <RecordsTab song={song} />}
        {!xyxMode && tab === 'practice-new' && <PracticeSectionForm song={song} />}
        {!xyxMode && practiceSectionCount > 0 && tab === 'practice-user' && <UserPracticeSectionsTab song={song} />}
        {tab === 'comments' && <CommentsTab song={song} />}
      </div>
    </div>
  )
}

function catFromLevel(lv) {
  if (lv >= 7) return 'sun'
  if (lv >= 4) return 'moon'
  return 'star'
}

function getCounterpartUrl(counterpart) {
  if (!counterpart?.id || !counterpart?.server) return null
  const base = SERVER_LINKS[counterpart.server]
  if (!base) return null
  const path = counterpart.is_removed ? '/removed-songs' : '/'
  return `${base}${path}#song=${counterpart.id}`
}

function getCounterpartLabel(counterpart) {
  if (counterpart?.server === 'kr') return '한국 서버로 이동'
  if (counterpart?.server === 'xyx') return '중국 서버로 이동'
  return '다른 서버로 이동'
}

function navigateToCounterpart(url) {
  window.location.href = url
}

function normalizeSongIdentity(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase()
}

function isDifficultyVariantOf(a, b) {
  if (!a || !b || a.id === b.id) return false
  const aGroup = Number(a.same_music_group_id || 0)
  const bGroup = Number(b.same_music_group_id || 0)
  if (aGroup > 0 && aGroup === bGroup) return true

  const sameArtist = normalizeSongIdentity(a.artist) === normalizeSongIdentity(b.artist)
  const sameTitle = normalizeSongIdentity(a.name) === normalizeSongIdentity(b.name)
  const levelDiffers = Math.abs(Number(a.level) - Number(b.level)) > 1e-9
  return sameTitle && sameArtist && levelDiffers
}

export default function SongModal() {
  const xyxMode = isXyxMode()
  const isMobile = useMobile(xyxMode ? 1100 : 768)
  const navigate = useNavigate()
  // 모달은 라우트 밖에 있어 곡 난이도 기반 data-cat을 직접 지정한다.
  const { modalOpen, modalSong, closeModal, openModal, openFeedback, user, favorites, toggleFavorite, songs } = useStore()
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePos, setMorePos] = useState({ top: 0, right: 0 })
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const [difficultyPos, setDifficultyPos] = useState({ top: 0, left: 0 })
  const [copied, setCopied] = useState(false)
  const difficultyBtnRef = useRef(null)
  const difficultyMenuRef = useRef(null)
  const moreBtnRef = useRef(null)
  const moreMenuRef = useRef(null)
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [show, setShow] = useState(false)
  const currentSong = useMemo(() => {
    if (!detail) return modalSong
    return {
      ...modalSong,
      ...detail,
      korea_name: detail.korea_name || modalSong?.korea_name || '',
      xyx_name: detail.xyx_name || modalSong?.xyx_name || '',
    }
  }, [detail, modalSong])
  const difficultyVariants = useMemo(() => {
    if (!currentSong || !Array.isArray(songs)) return []
    return songs
      .filter(s => isDifficultyVariantOf(s, currentSong))
      .sort((a, b) =>
        Number(a.level) - Number(b.level) ||
        Number(a.combo || 0) - Number(b.combo || 0) ||
        Number(a.id) - Number(b.id)
      )
  }, [songs, currentSong?.id, currentSong?.name, currentSong?.artist, currentSong?.level, currentSong?.same_music_group_id])
  const practiceSectionCount = usePracticeSectionCount(currentSong?.id, modalOpen && !xyxMode)

  useEffect(() => {
    if (!modalOpen || !modalSong) { setDetail(null); setTab('overview'); return }
    getSong(modalSong.id).then(setDetail)
  }, [modalOpen, modalSong?.id])

  useEffect(() => {
    if (!modalOpen || !modalSong?.id) return
    trackSongCatalogView({
      server: xyxMode ? 'xyx' : 'kr',
      song_id: modalSong.id,
    })
  }, [modalOpen, modalSong?.id, xyxMode])

  useEffect(() => {
    if (tab === 'practice-user' && practiceSectionCount === 0) setTab('overview')
  }, [tab, practiceSectionCount])

  useEffect(() => {
    if (!modalOpen) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalOpen, closeModal])

  useLayoutEffect(() => {
    if (!modalOpen) return undefined
    const triggerSongId = modalSong?.id
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const selector = isMobile ? '.mob-detail-back' : '.m-close'
      panelRef.current?.querySelector(selector)?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      const songRow = triggerSongId ? document.querySelector(`[data-song-id="${triggerSongId}"]`) : null
      if (songRow instanceof HTMLElement) {
        songRow.dataset.restoredFocus = 'true'
        const clearRestoredFocus = (event) => {
          delete songRow.dataset.restoredFocus
          songRow.removeEventListener('pointerleave', clearRestoredFocus)
          songRow.removeEventListener('keydown', clearRestoredFocus)
          songRow.removeEventListener('blur', clearRestoredFocus)
          if (event?.type.startsWith('pointer') && document.activeElement === songRow) songRow.blur()
        }
        songRow.addEventListener('pointerleave', clearRestoredFocus, { once: true })
        songRow.addEventListener('keydown', clearRestoredFocus, { once: true })
        songRow.addEventListener('blur', clearRestoredFocus, { once: true })
        songRow.focus({ preventScroll: true })
      }
      else previousFocusRef.current?.focus?.()
    }
  }, [modalOpen, isMobile])

  // 모바일 뒤로가기는 페이지 대신 모달만 닫는다.
  useEffect(() => {
    if (!isMobile) return
    if (modalOpen) {
      history.pushState({ mobileDetail: true }, '')
      setShow(true)
      const onPop = () => closeModal()
      window.addEventListener('popstate', onPop, { once: true })
      return () => window.removeEventListener('popstate', onPop)
    } else {
      setShow(false)
    }
  }, [modalOpen, isMobile])

  const handleMobileClose = () => {
    history.back()
  }

  useEffect(() => {
    if (!moreOpen) return
    const handler = () => setMoreOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [moreOpen])

  useEffect(() => {
    if (!difficultyOpen) return
    const handler = () => setDifficultyOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [difficultyOpen])

  const handleDifficultySelect = (targetSong) => {
    setDifficultyOpen(false)
    setMoreOpen(false)
    setTab('overview')
    openModal(targetSong)
  }

  if (isMobile) {
    if (!show && !modalOpen) return null
    const song = currentSong
    if (!song) return null
    return (
      <div
        ref={panelRef}
        className={`mob-detail${modalOpen ? ' open' : ''}`}
        data-cat={catFromLevel(song.level)}
        role="dialog"
        aria-modal="true"
        aria-label={`${song.name} 곡 상세`}
        aria-hidden={!modalOpen}
      >
        <MobileDetail
          song={song}
          detail={detail}
          onClose={handleMobileClose}
          difficultyVariants={difficultyVariants}
          onDifficultySelect={handleDifficultySelect}
        />
      </div>
    )
  }

  if (!modalOpen || !modalSong) return null

  const song = currentSong
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const counterpartUrl = getCounterpartUrl(song.counterpart)
  const counterpartLabel = getCounterpartLabel(song.counterpart)
  const linkedName = song.korea_name
    ? { label: '한국 곡명', value: song.korea_name }
    : song.xyx_name
    ? { label: '중국 곡명', value: song.xyx_name }
    : null

  const handlePlayClick = () => {
    if (song.youtube_url) {
      logPlay(song.id)
      useStore.getState().markPlayed(song.id)
      window.open(song.youtube_url, '_blank')
    }
  }

  const handleCopyLink = () => {
    const url = songCatalogUrl(song.id)
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    setMoreOpen(false)
  }

  const handleOpenCategory = (category) => {
    navigate(`/personal-categories/${category.category_code}`, { state: { keepCatalogOpen: true } })
  }

  return (
    <div
      className="modal-backdrop song-catalog-backdrop"
      data-cat={catFromLevel(song.level)}
      onClick={e => e.target === e.currentTarget && closeModal()}
    >
      <aside ref={panelRef} className="modal song-catalog-panel" aria-label={`${song.name} 곡 상세`}>
          <div className="m-hero">
          <div className="m-top">
            <div className="m-breadcrumb">
              <b>카탈로그</b>{song.is_change ? ' · 변속곡' : ''}
            </div>
            <button className="m-close" onClick={closeModal} aria-label="닫기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>

          <div className="m-title-row">
            <div className="m-artwork" style={{ background: artworkBg(song.id) }}>
              {song.image
                ? <img
                    src={staticUrl(song.image)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                : initials
              }
            </div>
            <div className="m-name-wrap">
              <div className="level-hero-pill">
                <span className="k">LV</span>
                <span className="n">{song.level?.toFixed(1)}</span>
              </div>
              <div className="m-name">{song.name}</div>
              {linkedName && (
                <div className="m-linked-name">{linkedName.label} : {linkedName.value}</div>
              )}
              <div className="m-artist">by <b>{song.artist}</b> · {song.time} · {fmt(song.combo)} 콤보</div>
            </div>
          </div>

          <div className="m-actions is-split">
            <div className="m-actions-row">
              {song.youtube_url ? (
                <button className="btn btn-primary" onClick={handlePlayClick}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  음악 듣기
                </button>
              ) : (
                <button className="btn btn-primary" disabled style={{ opacity: 0.5 }}>음악 듣기</button>
              )}
              <button
                className="btn btn-ghost"
                disabled={!user}
                style={!user ? { opacity: 0.5 } : (favorites?.has(song.id) ? { color: 'var(--accent, #ff6b9d)' } : {})}
                title={user ? (favorites?.has(song.id) ? '즐겨찾기 해제' : '즐겨찾기 추가') : '즐겨찾기 (로그인 필요)'}
                onClick={() => { if (user) toggleFavorite(song.id) }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={favorites?.has(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
                </svg>
                즐겨찾기
              </button>
              <PersonalCategoryPicker songId={song.id} className="btn btn-ghost" />
            </div>
            <div className="m-actions-row">
              {counterpartUrl && (
                <button className="btn btn-ghost" onClick={() => navigateToCounterpart(counterpartUrl)}>
                  <ExternalLink size={14} strokeWidth={2.4} />
                  {counterpartLabel}
                </button>
              )}
              <div className="difficulty-wrap">
                <button
                  ref={difficultyBtnRef}
                  className="btn btn-ghost"
                  disabled={difficultyVariants.length === 0}
                  title={difficultyVariants.length ? '동일한 음악의 다른 난이도 보기' : '다른 난이도가 없습니다'}
                  style={difficultyVariants.length === 0 ? { opacity: 0.5 } : undefined}
                  onClick={e => {
                    e.stopPropagation()
                    if (difficultyVariants.length === 0) return
                    const rect = difficultyBtnRef.current.getBoundingClientRect()
                    const menuWidth = 260
                    setDifficultyPos({
                      top: rect.bottom + 6,
                      left: Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left)),
                    })
                    setMoreOpen(false)
                    setDifficultyOpen(v => !v)
                  }}
                >
                  <Layers size={14} strokeWidth={2.4} />
                  다른 난이도로 이동
                </button>
                {difficultyOpen && (
                  <div
                    ref={difficultyMenuRef}
                    className="difficulty-menu"
                    style={{ top: difficultyPos.top, left: difficultyPos.left }}
                    onClick={e => e.stopPropagation()}
                  >
                    {difficultyVariants.map(variant => (
                      <button
                        key={variant.id}
                        data-cat={catFromLevel(variant.level)}
                        onClick={() => handleDifficultySelect(variant)}
                      >
                        <span className="difficulty-info">
                          <span className="difficulty-name">{variant.name}</span>
                          <span className="difficulty-meta">
                          {fmtBpm(variant.bpm)} BPM · {fmt(variant.combo)} 콤보
                          </span>
                        </span>
                        <span className="difficulty-level">LV {Number(variant.level).toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-icon" title="링크 복사" onClick={handleCopyLink} style={copied ? { color: 'var(--ok)' } : {}}>
                {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={18} strokeWidth={2.5} />}
              </button>
              <div className="more-wrap">
                <button ref={moreBtnRef} className="btn btn-ghost btn-icon" title="더 보기" onClick={e => {
                  e.stopPropagation()
                  const rect = moreBtnRef.current.getBoundingClientRect()
                  setMorePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                  setDifficultyOpen(false)
                  setMoreOpen(v => !v)
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1, letterSpacing: 1 }}>···</span>
                </button>
                {moreOpen && (
                  <div ref={moreMenuRef} className="more-menu" style={{ top: morePos.top, right: morePos.right }} onClick={e => e.stopPropagation()}>
                    {!xyxMode && (
                      <button onClick={() => { setMoreOpen(false); closeModal(); openFeedback(song) }}>
                        <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>피드백</span>
                      </button>
                    )}
                    <button onClick={handleCopyLink}>
                      <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      <span>링크 복사</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="m-stats">
          {[
            { lbl: '난이도', val: song.level?.toFixed(1), sub: '공식', hi: true },
            { lbl: '게임 BPM',   val: song.bpm?.toFixed(1),   sub: song.is_change ? '변속 있음' : '고정' },
            { lbl: '음악 원 BPM', val: originalBpmText(song, detail), sub: '원본' },
            { lbl: '콤보',  val: fmt(song.combo),         sub: '최대' },
            { lbl: '시간',  val: song.time,               sub: '재생' },
            { lbl: '재생 수', val: detail?.play_count ?? song.play_count ?? 0, sub: '회' },
          ].map(({ lbl, val, sub, hi }) => (
            <div key={lbl} className={`m-stat${hi ? ' highlight' : ''}`}>
              <div className="lbl">{lbl}</div>
              <div className="val">{val}</div>
              <div className="sub">{sub}</div>
            </div>
          ))}
        </div>
        {song.combo_warning && (
          <div className="m-combo-warning">
            {COMBO_WARNING_TEXT}
          </div>
        )}

        <SavedCategoryTags song={song} onOpenCategory={handleOpenCategory} />
        {!xyxMode && <PracticeSectionsSummary song={song} />}

          <div className="m-tabs" role="tablist" aria-label="곡 상세 정보">
          {[
            { key: 'overview', label: '개요' },
            { key: 'records',  label: '플레이 영상' },
            ...(!xyxMode ? [
              { key: 'practice-new', label: '연습구간 등록' },
              ...(practiceSectionCount > 0 ? [{ key: 'practice-user', label: '유저 연습 구간' }] : []),
            ] : []),
            { key: 'comments', label: '댓글' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`m-tab${tab === key ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="m-body" role="tabpanel">
          {tab === 'overview' && (
            <>
              {detail && detail.is_change && <BpmTimelineSection timeline={detail.bpm_timeline} songTime={detail.time} />}
              <PerceivedSection song={song} />
            </>
          )}
          {tab === 'records' && <RecordsTab song={song} />}
          {!xyxMode && tab === 'practice-new' && <PracticeSectionForm song={song} />}
          {!xyxMode && practiceSectionCount > 0 && tab === 'practice-user' && <UserPracticeSectionsTab song={song} />}
          {tab === 'comments' && <CommentsTab song={song} />}
        </div>
      </aside>
    </div>
  )
}
