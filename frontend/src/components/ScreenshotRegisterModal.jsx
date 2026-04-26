import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'
import { filterSongs } from '../utils/helpers'
import { addRecord, parseScreenshot, uploadRecordScreenshot, getMyScreenshotFilenames } from '../api/client'

const MAX_FILES = 50

export default function ScreenshotRegisterModal({ open, onClose }) {
  const { songs, user } = useStore()
  const [shots, setShots] = useState([])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('upload')
  const [registered, setRegistered] = useState(0)
  const [usedNames, setUsedNames] = useState(new Set())

  useEffect(() => {
    if (open) {
      setShots([]); setIdx(0); setPhase('upload')
      setRegistered(0)
      getMyScreenshotFilenames()
        .then(data => setUsedNames(new Set(data.filenames || [])))
        .catch(() => setUsedNames(new Set()))
    } else {
      shots.forEach(s => { if (s._url) URL.revokeObjectURL(s._url) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  if (!user) return null

  const patchShot = (id, patch) =>
    setShots(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))

  const addFiles = async (fileList) => {
    const allFiles = [...fileList].filter(f => f.type.startsWith('image/'))
    const alreadyInShots = new Set(shots.map(s => s.file?.name).filter(Boolean))
    const duplicates = []
    const files = allFiles.filter(f => {
      if (usedNames.has(f.name) || alreadyInShots.has(f.name)) {
        duplicates.push(f.name)
        return false
      }
      return true
    })
    if (duplicates.length > 0) {
      alert(`이미 등록된 스크린샷은 건너뛰었어요:\n${duplicates.slice(0, 10).join('\n')}${duplicates.length > 10 ? '\n...' : ''}`)
    }
    const room = MAX_FILES - shots.length
    const accepted = files.slice(0, room)
    const newShots = accepted.map(file => ({
      id: 'ss_' + Math.random().toString(36).slice(2, 10),
      file,
      _url: URL.createObjectURL(file),
      status: 'waiting',
      parsedScore: null,
      error: null,
    }))
    setShots(prev => [...prev, ...newShots])
    for (const s of newShots) {
      patchShot(s.id, { status: 'reading' })
      try {
        const res = await parseScreenshot(s.file)
        const pct = res?.judgment_percent
        const parsedScore = (typeof pct === 'number' && pct >= 0 && pct <= 99.0)
          ? pct.toFixed(3)
          : null
        patchShot(s.id, parsedScore
          ? { status: 'done', parsedScore, error: null }
          : { status: 'failed', parsedScore: null, error: '판정% 인식 실패 · 직접 입력해주세요' })
      } catch {
        patchShot(s.id, { status: 'failed', error: '판정% 인식 실패 · 직접 입력해주세요' })
      }
    }
  }

  const removeShot = (i) => {
    setShots(prev => {
      const next = [...prev]
      const [removed] = next.splice(i, 1)
      if (removed?._url) URL.revokeObjectURL(removed._url)
      return next
    })
  }

  const start = () => {
    if (shots.length === 0) return
    setIdx(0); setPhase('register')
  }

  const handleSubmitOne = async ({ score, selectedSong, youtube_url, memo, memo_public }) => {
    const currentShot = shots[idx]
    try {
      // visibility는 가입 시 설정한 user.default_visibility를 따름
      // routers/records.py add_record() -> user.default_visibility로 fallback
      const created = await addRecord(selectedSong.id, {
        nickname: user.nickname,
        judgment_percent: parseFloat(score),
        youtube_url: youtube_url || null,
        memo: memo || null,
        memo_public: !!memo_public,
      })
      // 스크린샷 파일을 서버에 업로드해 기록에 첨부 (프로필에서 show_screenshot 해제 시에도 저장, API 응답에서 노출 제어)
      // routers/records.py upload_record_screenshot()
      if (created?.id && currentShot?.file) {
        try {
          await uploadRecordScreenshot(created.id, currentShot.file)
          // 동일 파일명 재업로드 방지용 set 갱신
          setUsedNames(prev => new Set(prev).add(currentShot.file.name))
        } catch (uploadErr) {
          // 기록 자체는 이미 등록됨. 스크린샷만 실패한 경우 등록은 성공 처리.
          console.warn('screenshot upload failed', uploadErr)
        }
      }
      setRegistered(n => n + 1)
      advance()
    } catch (e) {
      if (e?.response?.status !== 429) {
        alert('등록에 실패했어요: ' + (e?.response?.data?.detail || e.message))
      }
    }
  }

  const advance = () => {
    setIdx(prev => {
      const nextIdx = prev + 1
      if (nextIdx >= shots.length) {
        setPhase('done')
        return prev
      }
      return nextIdx
    })
  }

  return (
    <div className="modal-backdrop">
      <div className="rr-modal">
        {phase === 'upload' && (
          <UploadView
            shots={shots}
            onAdd={addFiles}
            onRemove={removeShot}
            onStart={start}
            onClose={onClose}
          />
        )}
        {phase === 'register' && shots[idx] && (
          <RegisterView
            key={shots[idx].id}
            shot={shots[idx]}
            idx={idx}
            total={shots.length}
            songs={songs}
            registered={registered}
            onClose={onClose}
            onSubmit={handleSubmitOne}
          />
        )}
        {phase === 'done' && (
          <DoneView registered={registered} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function UploadView({ shots, onAdd, onRemove, onStart, onClose }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const has = shots.length > 0
  const allProcessed = has && shots.every(s => s.status === 'done' || s.status === 'failed')
  const processingCount = shots.filter(s => s.status === 'reading' || s.status === 'waiting').length

  return (
    <>
      <div className="rr-head">
        <h3>내 기록 등록 · 스크린샷 업로드</h3>
        {has && <div className="rr-prog">{shots.length}장 · 최대 {MAX_FILES}장</div>}
        <button className="rr-close" onClick={onClose} aria-label="닫기">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div className="rr-body">
        <div
          className={`rr-drop${dragging ? ' drag' : ''}`}
          onClick={e => {
            if (e.target.closest('.rr-thumb') || e.target.closest('.rm')) return
            inputRef.current?.click()
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); onAdd(e.dataTransfer.files) }}
        >
          <div className="ico">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h4>스크린샷을 여기에 끌어다 놓으세요</h4>
          <p>또는 클릭해서 파일을 선택 · 여러 장 한 번에 업로드 가능 (최대 {MAX_FILES}장)</p>
          <div className="sel-btn">파일 선택</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => onAdd(e.target.files)}
          />
        </div>
        {has && (
          <div className="rr-list-wrap">
            <div className="rr-list-head">
              <span className="lbl">업로드된 스크린샷</span>
              <span className="cnt">{shots.length}장</span>
            </div>
            <div className="rr-thumbs">
              {shots.map((s, i) => (
                <div key={s.id} className={`rr-thumb s-${s.status}`}>
                  {s._url ? <img src={s._url} alt="" /> : <div className="ph">📷</div>}
                  <div className="idx">{String(i + 1).padStart(2, '0')}</div>
                  <button
                    className="rm"
                    onClick={e => { e.stopPropagation(); onRemove(i) }}
                    aria-label="제거"
                  >×</button>
                  <div className="status">
                    <span className="dot" />
                    <span>{statusLabel(s.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="rr-foot">
        <div className="left">
          {!has && `판정%는 자동으로 읽어드려요. 곡명은 직접 검색/선택하시면 됩니다.`}
          {has && !allProcessed && `⋯ 판정% 인식 중 (${processingCount}장 남음). 완료되면 시작할 수 있어요`}
          {has && allProcessed && `💡 "시작"을 누르면 첫 스크린샷부터 순서대로 등록을 진행합니다`}
        </div>
        <div className="right">
          <button className="rr-btn ghost" onClick={onClose}>취소</button>
          <button
            className="rr-btn primary"
            disabled={!allProcessed}
            onClick={onStart}
          >시작 →</button>
        </div>
      </div>
    </>
  )
}

function statusLabel(s) {
  switch (s) {
    case 'waiting': return '대기중'
    case 'reading': return '읽는 중…'
    case 'done':    return '완료'
    case 'failed':  return '실패'
    default:        return s
  }
}

function RegisterView({ shot, idx, total, songs, registered, onClose, onSubmit }) {
  const [score, setScore] = useState(shot.parsedScore || '')
  const [selectedSong, setSelectedSong] = useState(null)
  const [songQuery, setSongQuery] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [memo, setMemo] = useState('')
  const [memoPublic, setMemoPublic] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })   // object-position in px
  const [imgDim, setImgDim] = useState(null)             // { w, h } natural
  const [dragging, setDragging] = useState(false)
  const previewRef = useRef(null)
  const dragStartRef = useRef(null)

  useEffect(() => {
    if (!shot._url) { setImgDim(null); return }
    const i = new Image()
    i.onload = () => {
      const w = i.naturalWidth
      const h = i.naturalHeight
      setImgDim({ w, h })
      if (!previewRef.current) return
      const box = previewRef.current
      const boxW = box.offsetWidth
      const boxH = box.offsetHeight
      let xPct, yPct
      if (w >= 1900)       { xPct = 60;  yPct = 28 }
      else if (w >= 1000)  { xPct = 80;  yPct = 15 }
      else                 { xPct = 100; yPct = 0 }
      setOffset({
        x: (xPct / 100) * (boxW - w),
        y: (yPct / 100) * (boxH - h),
      })
    }
    i.src = shot._url
  }, [shot._url])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragStartRef.current || !imgDim || !previewRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const boxW = previewRef.current.offsetWidth
      const boxH = previewRef.current.offsetHeight
      const newX = dragStartRef.current.ox + dx
      const newY = dragStartRef.current.oy + dy
      const minX = Math.min(0, boxW - imgDim.w)
      const maxX = Math.max(0, boxW - imgDim.w)
      const minY = Math.min(0, boxH - imgDim.h)
      const maxY = Math.max(0, boxH - imgDim.h)
      setOffset({
        x: Math.min(maxX, Math.max(minX, newX)),
        y: Math.min(maxY, Math.max(minY, newY)),
      })
    }
    const onUp = () => { dragStartRef.current = null; setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [imgDim])

  const onMouseDown = (e) => {
    if (!imgDim) return
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
    e.preventDefault()
  }

  useEffect(() => {
    setScore(shot.parsedScore || '')
    setSelectedSong(null)
    setSongQuery('')
    setYoutubeUrl('')
    setMemo('')
    setMemoPublic(false)
  }, [shot.id])  // eslint-disable-line

  // 사용자가 이미 수동 입력했다면 OCR 결과로 덮어쓰지 않음.
  useEffect(() => {
    if (shot.parsedScore && !score) {
      setScore(shot.parsedScore)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.parsedScore])

  const searchResults = useMemo(() => {
    const q = songQuery.trim()
    if (q.length < 1) return []
    const { exact, fuzzy } = filterSongs(songs, {
      search: q, searchMode: 'name',
      levelMin: null, levelMax: null, bpmMin: null, bpmMax: null,
      category: null, quick: 'all', artists: new Set(),
    })
    return [...exact, ...fuzzy].slice(0, 20)
  }, [songQuery, songs])

  const parseOk = shot.status === 'done'
  const isLast = idx === total - 1

  const validateScore = (v) => {
    const n = parseFloat(v)
    if (isNaN(n)) return '숫자를 입력해주세요'
    if (n < 0) return '0 이상이어야 합니다'
    if (n > 99.0) return '판정은 99.000%를 초과할 수 없습니다'
    return null
  }

  const handleSubmit = async () => {
    const trimmed = (score || '').trim()
    const err = validateScore(trimmed)
    if (err) { alert(err); return }
    if (!selectedSong) { alert('곡을 선택해주세요'); return }
    setSubmitting(true)
    await onSubmit({
      score: trimmed,
      selectedSong,
      youtube_url: youtubeUrl.trim() || null,
      memo: memo.trim() || null,
      memo_public: memoPublic,
    })
    setSubmitting(false)
  }

  return (
    <>
      <div className="rr-head">
        <h3>내 기록 등록</h3>
        <div className="rr-prog">{idx + 1} / {total}</div>
        <button className="rr-close" onClick={() => {
          onClose()
        }} aria-label="닫기">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div className="rr-body">
        <div className="rr-reg">
          <div
            className="rr-reg-preview"
            ref={previewRef}
            onMouseDown={onMouseDown}
            style={{ cursor: shot._url ? (dragging ? 'grabbing' : 'grab') : 'default' }}
          >
            <div className="idx-chip">{String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
            {shot._url && imgDim ? (
              <img
                src={shot._url}
                alt=""
                className="rr-preview-img"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'none',
                  objectPosition: `${offset.x}px ${offset.y}px`,
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            ) : !shot._url ? (
              <div className="ph">미리보기 없음</div>
            ) : null}
          </div>
          <div className="rr-reg-form">
            <div className="rr-field">
              <div className="label-row">
                <label>판정</label>
                {parseOk
                  ? <span className="ai-chip">✓ 자동 인식됨</span>
                  : shot.status === 'reading'
                    ? <span className="ai-chip">⋯ 인식 중</span>
                    : <span className="ai-chip failed">⚠ 인식 실패</span>}
              </div>
              <div className="with-unit">
                <input
                  type="text"
                  className="mono big"
                  value={score}
                  placeholder="98.989"
                  inputMode="decimal"
                  onChange={e => setScore(e.target.value)}
                />
                <span className="unit">%</span>
              </div>
              <div className="hint">자동 인식된 값이 부정확하면 직접 수정해주세요 · 최대 99.000%</div>
            </div>

            <SongSearch
              query={songQuery}
              setQuery={setSongQuery}
              results={searchResults}
              selected={selectedSong}
              onSelect={setSelectedSong}
              onClear={() => setSelectedSong(null)}
            />

            <div className="rr-field">
              <label>YouTube <span style={{ color: 'var(--fg-4)', textTransform: 'none', letterSpacing: 0 }}>(선택)</span></label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                placeholder="https://youtu.be/…"
              />
            </div>

            <div className="rr-field">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <label style={{ marginBottom: 0 }}>
                  한마디 <span style={{ color: 'var(--fg-4)', textTransform: 'none', letterSpacing: 0 }}>(선택, 최대 20자)</span>
                </label>
                <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{memo.length}/20</span>
              </div>
              <input
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder="이 판에 대한 짧은 소감"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                <input
                  type="checkbox"
                  checked={memoPublic}
                  onChange={e => setMemoPublic(e.target.checked)}
                  style={{ width: 14, height: 14, margin: 0, padding: 0, flexShrink: 0, accentColor: 'var(--accent)' }}
                />
                <span>한마디 공개 (랭킹에서 닉네임 클릭 시 다른 사람도 볼 수 있음)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="rr-foot">
        <div className="left">
          남은 스크린샷: <b style={{ color: 'var(--fg-2)' }}>{total - idx - 1}</b>장 ·
          등록 <b style={{ color: 'var(--ok)' }}>{registered}</b>건
        </div>
        <div className="right">
          <button className="rr-btn primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '등록 중…' : (isLast ? '등록' : '다음 →')}
          </button>
        </div>
      </div>
    </>
  )
}

function SongSearch({ query, setQuery, results, selected, onSelect, onClear }) {
  const [hiIdx, setHiIdx] = useState(-1)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const [dropStyle, setDropStyle] = useState(null)

  useEffect(() => { setHiIdx(-1) }, [query])

  // 드롭다운을 position:fixed로 렌더링하면 모달 경계를 벗어나 표시 가능.
  // 입력창의 실제 스크린 좌표를 매번 읽어 갱신 (스크롤/리사이즈에도 대응).
  useEffect(() => {
    if (!open) { setDropStyle(null); return }
    const update = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 4
      const bottomRoom = window.innerHeight - r.bottom - 8
      setDropStyle({
        position: 'fixed',
        top: r.bottom + gap,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(160, bottomRoom),  // 브라우저 창 높이까지 유동적
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  if (selected) {
    return (
      <div className="rr-field rr-song-search">
        <label>곡명</label>
        <div className="rr-selected">
          {selected.image ? (
            <img
              className="rr-selected-art"
              src={`${import.meta.env.VITE_API_URL}/static/${selected.image}`}
              alt=""
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="rr-selected-art ph" />
          )}
          <div className="m">
            <b>{selected.name}</b>
            <span>{selected.artist}</span>
          </div>
          <span className="lv-pill">Lv {selected.level.toFixed(1)}</span>
          <button className="clear" onClick={onClear} aria-label="선택 해제">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </div>
    )
  }

  const onKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHiIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && hiIdx >= 0 && results[hiIdx]) { e.preventDefault(); onSelect(results[hiIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const dropdown = open && query.trim() ? (
    <div className="rr-song-dropdown open" style={dropStyle ?? undefined}>
      {results.length === 0 ? (
        <div className="rr-song-empty">'{query}'에 해당하는 곡이 없어요</div>
      ) : (
        results.map((s, i) => (
          <div
            key={s.id}
            className={`rr-song-item${i === hiIdx ? ' highlight' : ''}`}
            onMouseDown={() => onSelect(s)}
          >
            {s.image ? (
              <img
                className="rr-song-art"
                src={`${import.meta.env.VITE_API_URL}/static/${s.image}`}
                alt=""
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="rr-song-art ph" />
            )}
            <div className="t">
              <div className="t-title">{s.name}</div>
              <div className="t-sub">{s.artist} · {s.bpm} BPM</div>
            </div>
            <span className="lv-pill">Lv {s.level.toFixed(1)}</span>
          </div>
        ))
      )}
    </div>
  ) : null

  return (
    <div className="rr-field rr-song-search">
      <label>곡명</label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        placeholder="곡명으로 검색…"
        autoComplete="off"
      />
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  )
}

function DoneView({ registered, onClose }) {
  return (
    <>
      <div className="rr-head">
        <h3>등록 완료</h3>
        <button className="rr-close" onClick={onClose} aria-label="닫기">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div className="rr-body">
        <div className="rr-done">
          <div className="big">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <h3>{registered}건의 기록이 등록됐어요</h3>
          <p>각 곡의 "랭킹" 탭에서 확인할 수 있어요</p>
        </div>
      </div>
      <div className="rr-foot">
        <div className="left"></div>
        <div className="right">
          <button className="rr-btn primary lg" onClick={onClose}>확인</button>
        </div>
      </div>
    </>
  )
}
