import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMobile } from '../hooks/useMobile'
import useStore from '../store/useStore'
import useRankingsStore from '../store/useRankingsStore'
import useGroupsStore from '../store/useGroupsStore'
import { lookupRankingUser } from '../api/client'
import { matchSong } from '../utils/helpers'
import RankingsSidebar from '../components/rankings/RankingsSidebar'
import RankingsTopBar from '../components/rankings/RankingsTopBar'
import RankingsTable from '../components/rankings/RankingsTable'
import RankingsMobileHeader from '../components/rankings/RankingsMobileHeader'
import RankingsMobileList from '../components/rankings/RankingsMobileList'
import RankingsFilterSheet from '../components/rankings/RankingsFilterSheet'

function compareRows(a, b, key, dir) {
  const d = dir === 'asc' ? 1 : -1
  let va, vb
  if (key === 'idx') { va = a.song.file_order ?? 0; vb = b.song.file_order ?? 0 }
  else if (key === 'name' || key === 'artist') { va = (a.song[key] || '').toLowerCase(); vb = (b.song[key] || '').toLowerCase() }
  else if (key === 'level' || key === 'bpm' || key === 'combo') { va = a.song[key] ?? 0; vb = b.song[key] ?? 0 }
  else if (key === 'rankScore') {
    va = a.top?.judgment_percent ?? null
    vb = b.top?.judgment_percent ?? null
  } else if (key === 'myScore') {
    va = a.mine?.judgment_percent ?? null
    vb = b.mine?.judgment_percent ?? null
  } else { va = 0; vb = 0 }
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  if (va < vb) return -1 * d
  if (va > vb) return 1 * d
  return 0
}

export default function RankingsPage() {
  const isMobile = useMobile()
  const { songs, user } = useStore()
  const {
    rankings, rankingsBySong, groupTopBySong, myRecordsBySong, pinnedUser, pinnedRecordsBySong,
    search, searchMode, quick, flagRanked, levelMin, levelMax, category, sort,
    fetchRankings, fetchMyRecords, loaded, activeGroupId, setActiveGroup,
    setSearch, setSearchMode, pinUser,
    editMode, dirty, disableEditMode,
    invalidUrlsModal, closeInvalidUrlsModal, saveDirty,
  } = useRankingsStore()
  const { myGroups, fetchMyGroups } = useGroupsStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { nickname: nickParam } = useParams()

  // 딥링크 /rankings/<닉네임>: lookup으로 user_id를 받아 핀하고, 권한 없거나 없는 사용자는 /rankings로 정리.
  useEffect(() => {
    if (!nickParam) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await lookupRankingUser(nickParam)
        if (cancelled) return
        setSearchMode('user')
        setSearch(data.nickname)
        pinUser({ user_id: data.user_id, nickname: data.nickname, record_count: 0 })
      } catch (e) {
        if (cancelled) return
        const status = e?.response?.status
        if (status === 404) {
          alert(`'${nickParam}' 사용자를 찾을 수 없거나 검색 권한이 없어요`)
        } else {
          alert('사용자 조회에 실패했어요')
        }
        navigate('/rankings', { replace: true })
      }
    })()
    return () => { cancelled = true }
  }, [nickParam, setSearch, setSearchMode, pinUser, navigate])

  // 그룹 페이지에서 넘어올 때 ?pinUser=<id>&pinNick=<nick>&group=<gid> 쿼리 처리.
  // 핀 적용 후 URL은 정리해서 새로고침/뒤로가기로 다시 적용되지 않게 함.
  useEffect(() => {
    if (!location.search) return
    const p = new URLSearchParams(location.search)
    const pinId = p.get('pinUser')
    const pinNick = p.get('pinNick') || ''
    const gParam = p.get('group')
    let consumed = false
    if (pinId) {
      const idNum = Number(pinId)
      if (Number.isFinite(idNum)) {
        setSearchMode('user')
        if (pinNick) setSearch(pinNick)
        pinUser({ user_id: idNum, nickname: pinNick, record_count: 0 })
          .catch(e => {
            const status = e?.response?.status
            if (status === 403 || status === 404) {
              alert(`${pinNick || '해당 사용자'}님의 성과는 비공개되어 있어요`)
            }
          })
        consumed = true
      }
    }
    if (gParam) {
      const gid = Number(gParam)
      if (Number.isFinite(gid)) { setActiveGroup(gid); consumed = true }
    }
    if (consumed) navigate('/rankings', { replace: true })
  }, [location.search, navigate, setSearch, setSearchMode, pinUser, setActiveGroup])

  useEffect(() => { fetchRankings() }, [fetchRankings])
  useEffect(() => {
    if (user) { fetchMyRecords(); fetchMyGroups() }
    else {
      useRankingsStore.setState({ myRecordsBySong: new Map(), myManualBySong: new Map(), groupTopBySong: new Map(), activeGroupId: null })
      useGroupsStore.setState({ myGroups: [], loaded: false })
    }
  }, [user, fetchMyRecords, fetchMyGroups])

  // 미저장 변경분이 있을 때 브라우저 새로고침/탭 닫기/Alt+F4 차단.
  useEffect(() => {
    if (!editMode || dirty.size === 0) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editMode, dirty])

  // 라우트 이탈 차단: 페이지 내부 nav 링크 클릭 등.
  // react-router v6에서는 useBlocker 미공식이라 클릭 캡처로 처리.
  useEffect(() => {
    if (!editMode || dirty.size === 0) return
    const handler = (e) => {
      const a = e.target.closest && e.target.closest('a[href]')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http')) return
      const ok = window.confirm('저장하지 않은 변경분이 있어요. 페이지를 떠나시겠어요?')
      if (!ok) { e.preventDefault(); e.stopPropagation(); return }
      disableEditMode()
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [editMode, dirty, disableEditMode])

  const rows = useMemo(() => {
    if (!songs.length) return []
    const cmpRecords = pinnedUser ? pinnedRecordsBySong : myRecordsBySong
    let out = songs
      .filter(s => s.level >= levelMin && s.level <= levelMax)
      .filter(s => {
        if (category === 'star') return s.level >= 1.5 && s.level <= 3.5
        if (category === 'moon') return s.level >= 4 && s.level <= 6.5
        if (category === 'sun') return s.level >= 7
        return true
      })
      .map(song => {
        const r = rankingsBySong.get(song.id)
        return {
          song,
          top: r?.top ?? null,
          totalRecords: r?.total_records ?? 0,
          mine: cmpRecords.get(song.id) ?? null,
          groupTop: groupTopBySong.get(song.id) ?? null,
        }
      })

    if (quick === 'mine') out = out.filter(r => r.mine != null)
    else if (typeof quick === 'string' && quick.startsWith('group:')) {
      out = out.filter(r => r.groupTop != null)
    }
    // '성과있음'은 모바일 칩에서 다른 필터와 동시에 적용된다.
    // quick==='ranked'는 PC 사이드바 레거시 경로.
    if (flagRanked || quick === 'ranked') out = out.filter(r => r.top != null)

    if (searchMode === 'song' && search.trim()) {
      out = out.filter(r => matchSong(r.song, search))
    }

    out.sort((a, b) => compareRows(a, b, sort.key, sort.dir))
    return out
  }, [songs, rankingsBySong, groupTopBySong, myRecordsBySong, pinnedRecordsBySong, pinnedUser, search, searchMode, quick, flagRanked, levelMin, levelMax, category, sort])

  const rankedSongCount = useMemo(() => rankings.length, [rankings])
  const mineSongCount = useMemo(() => {
    const map = pinnedUser ? pinnedRecordsBySong : myRecordsBySong
    return map.size
  }, [pinnedUser, pinnedRecordsBySong, myRecordsBySong])

  if (isMobile) {
    return (
      <div className="app-mobile" data-cat={category || undefined}>
        <RankingsMobileHeader
          totalFiltered={rows.length}
          onFilterClick={() => setSheetOpen(true)}
        />
        <div className="mob-list-wrap">
          <div className="mob-meta">
            <span><b>{rows.length.toLocaleString()}</b> 곡</span>
          </div>
          {!loaded ? (
            <div className="mob-empty"><div className="mob-empty-icon">⏳</div>불러오는 중…</div>
          ) : (
            <RankingsMobileList rows={rows} />
          )}
        </div>
        <RankingsFilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    )
  }

  const hasGroups = !!user && myGroups.length > 0

  return (
    <div className="app" data-cat={category || undefined}>
      <RankingsSidebar
        rankedSongCount={rankedSongCount}
        mineSongCount={mineSongCount}
        myGroups={myGroups}
        activeGroupId={activeGroupId}
        onActiveGroupChange={setActiveGroup}
      />
      <main className="main">
        <RankingsTopBar filteredCount={rows.length} totalCount={songs.length} />
        {!loaded ? (
          <div className="rk-empty"><div className="rk-empty-icon">⏳</div><div className="rk-empty-title">불러오는 중…</div></div>
        ) : (
          <RankingsTable rows={rows} hasGroups={hasGroups} />
        )}
      </main>

      {invalidUrlsModal && (
        <InvalidUrlsModal
          invalid={invalidUrlsModal.invalid}
          onClose={closeInvalidUrlsModal}
          onProceed={async () => {
            const skipIds = invalidUrlsModal.invalid.map(x => x.song_id)
            closeInvalidUrlsModal()
            try {
              const r = await saveDirty(skipIds)
              if (r.ok && r.sent > 0) {
                alert(`${r.sent}곡 저장했어요`)
              }
            } catch {
              alert('저장에 실패했어요. 잠시 후 다시 시도해주세요')
            }
          }}
        />
      )}
    </div>
  )
}

function InvalidUrlsModal({ invalid, onClose, onProceed }) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }} onClick={onClose}>
      <div className="invalid-urls-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
          확인이 필요해요
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55 }}>
          아래 영상은 비공개 상태이거나 잘못된 URL인 것 같습니다.
        </p>
        <ul className="invalid-urls-list">
          {invalid.map((x, i) => (
            <li key={`${x.song_id}-${i}`}>
              <b>{x.song_title || `곡 #${x.song_id}`}</b>
              {x.artist && <span style={{ color: 'var(--fg-3)' }}> — {x.artist}</span>}
            </li>
          ))}
        </ul>
        <p style={{
          margin: '14px 0 18px', fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.55,
          fontStyle: 'italic',
        }}>
          URL 없이 점수만 저장하면 해당 곡들은 전체 성과에는 반영되지 않고 본인 성과로만 남습니다.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg)' }}>
          어떻게 하시겠습니까?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="fb-btn ghost" onClick={onClose}>다시 확인</button>
          <button className="fb-btn primary" onClick={onProceed}>잘못된 URL 제거 후 저장</button>
        </div>
      </div>
    </div>
  )
}
