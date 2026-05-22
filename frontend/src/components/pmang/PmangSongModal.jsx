import { useEffect, useState } from 'react'
import { Link2, Check } from 'lucide-react'
import useStore from '../../store/useStore'
import { artworkBg } from '../../utils/helpers'
import { useMobile } from '../../hooks/useMobile'
import { getPmangComments, addPmangComment, getPmangRecords, addPmangRecord } from '../../api/client'

function catFromLevel(lv) {
  if (lv >= 7) return 'sun'
  if (lv >= 4) return 'moon'
  return 'star'
}

// 본 records와 동일한 검증: youtu.be/<id> 또는 youtube.com/watch?v=<id>, 11자 video id.
const isValidYtUrl = (u) =>
  /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}(?:[/?#&].*)?$/.test(u) ||
  /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=[A-Za-z0-9_-]{11}(?:[&#].*)?$/.test(u)


function PmangRecordsTab({ song }) {
  const user = useStore(s => s.user)
  const [records, setRecords] = useState(null)
  const [url, setUrl] = useState('')
  const [ytTitle, setYtTitle] = useState(null)
  const [ytLoading, setYtLoading] = useState(false)
  const [nick, setNick] = useState(user?.nickname || '')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { getPmangRecords(song.id).then(setRecords).catch(() => setRecords([])) }, [song.id])

  useEffect(() => { setNick(user?.nickname || '') }, [user?.id, user?.nickname])

  const fetchYtTitle = async (rawUrl) => {
    if (!rawUrl.trim()) { setYtTitle(null); return }
    if (!isValidYtUrl(rawUrl)) { setYtTitle(false); return }
    setYtLoading(true)
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`)
      if (res.ok) {
        const data = await res.json()
        setYtTitle(data.title ?? null)
      } else {
        setYtTitle(null)
      }
    } catch {
      setYtTitle(null)
    } finally {
      setYtLoading(false)
    }
  }

  const handleSubmit = async () => {
    // 로그인 사용자는 회원 닉네임 자동 사용. submit 시점에 직접 user.nickname을 읽어 race 우회.
    const effectiveNickname = (user?.nickname || nick || '').trim()
    if (!effectiveNickname || !url.trim()) return
    setSubmitting(true)
    try {
      await addPmangRecord(song.id, {
        nickname: effectiveNickname,
        youtube_url: url,
        memo: memo || null,
      })
      const fresh = await getPmangRecords(song.id)
      setRecords(fresh)
      setDone(true); setUrl(''); setYtTitle(null); setMemo('')
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '플레이 영상 등록에 실패했어요')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="record-form">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>플레이 영상</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>피망 시절 추억의 플레이 영상을 공유하세요</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {!user && (
            <div className="rf-field">
              <label>닉네임</label>
              <input value={nick} onChange={e => setNick(e.target.value)} placeholder="닉네임" />
            </div>
          )}
          <div className="rf-field">
            <label>YouTube URL</label>
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setYtTitle(null) }}
              onBlur={e => fetchYtTitle(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
            {ytLoading && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-4)' }}>제목 조회 중…</div>
            )}
            {!ytLoading && ytTitle && ytTitle !== false && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>▸</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ytTitle}</span>
              </div>
            )}
            {!ytLoading && ytTitle === false && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--err, #e05)' }}>
                youtu.be/… 또는 youtube.com/watch?v=… 형식만 등록 가능합니다
              </div>
            )}
          </div>
          <div className="rf-field">
            <label>한마디</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="이 판에 대한 소감 (선택)" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setUrl(''); setNick(user?.nickname || ''); setMemo(''); setYtTitle(null); setDone(false) }}>초기화</button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            disabled={submitting || (!user?.nickname && !nick.trim()) || !url.trim() || ytTitle === false}
            onClick={handleSubmit}
          >
            {done ? '등록 완료 ✓' : submitting ? '등록 중…' : '플레이 영상 등록'}
          </button>
        </div>
      </div>

      {records == null ? (
        <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중…</div>
      ) : records.length === 0 ? (
        <div className="record-empty">
          <span className="big">🏆</span>
          아직 등록된 영상이 없어요<br/>
          <span style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>위 폼으로 첫 영상을 등록해보세요</span>
        </div>
      ) : (
        <div className="leaderboard">
          {records.map((r, i) => (
            <div key={r.id} className={`lb-row${i < 3 ? ' top' : ''}`}>
              <span className="lb-rank">#{i + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div className="lb-avatar">{(r.nickname || '?')[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg)' }}>{r.nickname}</div>
                  {r.youtube_url && (
                    <a
                      href={r.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 280 }}
                    >
                      ▸ {r.youtube_title || 'YouTube'}
                    </a>
                  )}
                </div>
              </div>
              <div className="lb-date">{(r.created_at || '').slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function PmangCommentsTab({ song }) {
  const user = useStore(s => s.user)
  const [comments, setComments] = useState(null)
  const [nick, setNick] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { getPmangComments(song.id).then(setComments).catch(() => setComments([])) }, [song.id])

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await addPmangComment(song.id, {
        nickname: nick.trim() || null,
        content: content.trim(),
      })
      const fresh = await getPmangComments(song.id)
      setComments(fresh)
      setContent('')
      if (!user) setNick('')
    } catch (e) {
      const detail = e?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : '댓글 등록에 실패했어요')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="record-form" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {!user && (
            <div className="rf-field">
              <label>닉네임 (선택)</label>
              <input value={nick} onChange={e => setNick(e.target.value)} placeholder="비워두면 자동 부여" />
            </div>
          )}
          <div className="rf-field">
            <label>내용</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={3}
              placeholder="이 곡에 대한 한마디를 남겨보세요"
              maxLength={1000}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            disabled={submitting || !content.trim()}
            onClick={handleSubmit}
          >
            {submitting ? '등록 중…' : '댓글 등록'}
          </button>
        </div>
      </div>

      {comments == null ? (
        <div style={{ textAlign: 'center', color: 'var(--fg-4)', padding: 20 }}>불러오는 중…</div>
      ) : comments.length === 0 ? (
        <div className="record-empty">
          <span className="big">💬</span>
          아직 댓글이 없어요<br/>
          <span style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>첫 댓글의 주인공이 되어보세요</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--surface-1)', borderRadius: 10 }}>
              <div className="lb-avatar" style={{ width: 30, height: 30 }}>{(c.nickname || '?')[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{c.nickname}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-4)', fontFamily: "'JetBrains Mono',monospace", marginLeft: 'auto' }}>
                    {(c.created_at || '').slice(0, 10)}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{c.content}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PmangMobileDetail({
  song,
  tab,
  setTab,
  onClose,
  copied,
  onCopyLink,
  onMusicClick,
  user,
  isFav,
  onToggleFavorite,
}) {
  const displayLv = song.level / 2
  const cat = catFromLevel(displayLv)
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div className="mob-detail open" data-cat={cat}>
      <div className="mob-detail-top scrolled">
        <button className="mob-detail-back" onClick={onClose} aria-label="닫기">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="mob-detail-top-title">{song.name}</div>
        <button className="mob-icon-btn" onClick={onCopyLink} aria-label="링크 복사" style={copied ? { color: 'var(--ok)' } : {}}>
          {copied ? <Check size={18} strokeWidth={2.5} /> : <Link2 size={18} strokeWidth={2.5} />}
        </button>
      </div>

      <div className="mob-detail-body">
        <section className="mob-hero">
          <div className="mob-hero-art" style={{ background: artworkBg(song.id) }}>
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
              : <span className="mob-hero-init">{initials}</span>
            }
          </div>
          <h1 className="mob-hero-title">{song.name}</h1>
          <div className="mob-hero-sub">{song.artist}</div>
          <div className="mob-hero-tags">
            <span className="mob-h-tag mob-h-tag-accent">LV {displayLv.toFixed(1)}</span>
            {song.game_index != null && <span className="mob-h-tag">#{song.game_index}</span>}
            <span className="mob-h-tag">과거 피망곡</span>
          </div>
        </section>

        <div className="mob-action-row">
          {song.youtube_url && (
            <button className="mob-act-btn mob-act-primary" onClick={onMusicClick}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              음악 듣기
            </button>
          )}
          <button
            className="mob-act-btn mob-act-ghost"
            disabled={!user}
            onClick={() => { if (user) onToggleFavorite(song.id) }}
            style={!user ? { opacity: 0.45 } : (isFav ? { color: 'var(--accent)' } : {})}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
            </svg>
            {isFav ? '즐겨찾기 해제' : '즐겨찾기'}
          </button>
          <button className="mob-act-btn mob-act-ghost" onClick={onCopyLink}>
            {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={16} strokeWidth={2.5} />}
            링크 복사
          </button>
        </div>

        <div className="mob-stats">
          {[
            { lbl: '카탈로그', val: '피망' },
            { lbl: '번호', val: song.game_index != null ? `#${song.game_index}` : '-' },
            { lbl: '레벨', val: displayLv.toFixed(1) },
            { lbl: '아티스트', val: song.artist || '-' },
          ].map(item => (
            <div key={item.lbl} className="mob-stat">
              <div className="mob-stat-v">{item.val}</div>
              <div className="mob-stat-l">{item.lbl}</div>
            </div>
          ))}
        </div>

        <div className="mob-tabs">
          {[
            { key: 'records', label: '플레이 영상' },
            { key: 'comments', label: '댓글' },
          ].map(item => (
            <button
              key={item.key}
              className={`mob-tab${tab === item.key ? ' active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mob-tab-body">
          {tab === 'records' && <PmangRecordsTab song={song} />}
          {tab === 'comments' && <PmangCommentsTab song={song} />}
        </div>
      </div>
    </div>
  )
}


export default function PmangSongModal({ song, onClose }) {
  const isMobile = useMobile()
  const { user, pmangFavorites, togglePmangFavorite } = useStore()
  const [tab, setTab] = useState('records')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!song) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [song, onClose])

  useEffect(() => { if (song) setTab('records') }, [song?.id])

  useEffect(() => {
    if (!isMobile || !song) return
    history.pushState({ pmangMobileDetail: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop, { once: true })
    return () => window.removeEventListener('popstate', onPop)
  }, [isMobile, song?.id, onClose])

  if (!song) return null

  const displayLv = song.level / 2
  const initials = (song.artist || '').split(/[\s_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const isFav = pmangFavorites?.has(song.id)

  const handleCopyLink = () => {
    const url = `${location.origin}/pmang-songs#pmang-song=${song.id}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleMusicClick = () => {
    if (song.youtube_url) window.open(song.youtube_url, '_blank')
  }

  const handleMobileClose = () => {
    history.back()
  }

  if (isMobile) {
    return (
      <PmangMobileDetail
        song={song}
        tab={tab}
        setTab={setTab}
        onClose={handleMobileClose}
        copied={copied}
        onCopyLink={handleCopyLink}
        onMusicClick={handleMusicClick}
        user={user}
        isFav={isFav}
        onToggleFavorite={togglePmangFavorite}
      />
    )
  }

  return (
    <div
      className="modal-backdrop"
      data-cat={catFromLevel(displayLv)}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="m-hero">
          <div className="m-top">
            <div className="m-breadcrumb">
              <b>카탈로그</b> · 과거 피망곡
            </div>
            <button className="m-close" onClick={onClose} aria-label="닫기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>

          <div className="m-title-row">
            <div className="m-artwork" style={{ background: artworkBg(song.id) }}>
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
                : initials
              }
            </div>
            <div className="m-name-wrap">
              <div className="level-hero-pill">
                <span className="k">LV</span>
                <span className="n">{displayLv.toFixed(1)}</span>
              </div>
              <div className="m-name">{song.name}</div>
              <div className="m-artist">by <b>{song.artist}</b></div>
            </div>
          </div>

          <div className="m-actions">
            {song.youtube_url && (
              <button className="btn btn-primary" onClick={handleMusicClick}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                음악 듣기
              </button>
            )}
            <button
              className="btn btn-ghost"
              disabled={!user}
              style={!user ? { opacity: 0.5 } : (isFav ? { color: 'var(--accent, #ff6b9d)' } : {})}
              title={user ? (isFav ? '즐겨찾기 해제' : '즐겨찾기 추가') : '즐겨찾기 (로그인 필요)'}
              onClick={() => { if (user) togglePmangFavorite(song.id) }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
              </svg>
              {isFav ? '즐겨찾기 해제' : '즐겨찾기'}
            </button>
            <button className="btn btn-ghost btn-icon" title="링크 복사" onClick={handleCopyLink} style={copied ? { color: 'var(--ok)' } : {}}>
              {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={18} strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        <div className="m-tabs">
          {[
            { key: 'records',  label: '플레이 영상' },
            { key: 'comments', label: '댓글' },
          ].map(({ key, label }) => (
            <button key={key} className={`m-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="m-body">
          {tab === 'records'  && <PmangRecordsTab song={song} />}
          {tab === 'comments' && <PmangCommentsTab song={song} />}
        </div>
      </div>
    </div>
  )
}
