import { useCallback, useMemo, useRef } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import useRankingsStore from '../../store/useRankingsStore'
import useStore from '../../store/useStore'
import { levelBarColor, artworkBg, fmt, fmtBpm, staticUrl } from '../../utils/helpers'

const COL_TEMPLATE_NORMAL = '60px 2fr 1.2fr 76px 80px 80px 135px 135px 115px'
const HEADERS_NORMAL = [
  { label: '#', key: 'idx', cls: '' },
  { label: '곡명', key: 'name', cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
  { label: 'BPM', key: 'bpm', cls: 'num' },
  { label: '콤보', key: 'combo', cls: 'num' },
  { label: '성과 판정', key: 'rankScore', cls: 'num' },
  { label: '그룹 판정', key: 'groupScore', cls: 'num' },
  { label: '내 판정', key: 'myScore', cls: 'num' },
]

const COL_TEMPLATE_EDIT = '60px 1.6fr 1fr 76px 115px 1.4fr'
const HEADERS_EDIT = [
  { label: '#', key: 'idx', cls: '' },
  { label: '곡명', key: 'name', cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
  { label: '내 판정', key: 'myScore', cls: 'num' },
  { label: 'YouTube URL', key: null, cls: '' },
]

// YouTube URL 형식 검증 (정규식만, 실제 영상 존재는 백엔드 oEmbed가 검증)
const YOUTUBE_URL_RE = /^https:\/\/(www\.|m\.)?(youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}|youtu\.be\/[A-Za-z0-9_-]{11})/

function judgeColor(jp) {
  if (jp == null) return 'empty'
  if (jp >= 99) return 'gold'
  if (jp >= 95) return 'high'
  return 'mid'
}

function fmtJp(jp) {
  if (jp == null) return null
  return jp.toFixed(3)
}

function fmtDelta(my, top) {
  if (my == null || top == null) return null
  const d = my - top
  const abs = Math.abs(d).toFixed(3)
  if (Math.abs(d) < 0.0005) return { txt: '±0', cls: 'same' }
  if (d > 0) return { txt: `+${abs}`, cls: 'up' }
  return { txt: `-${abs}`, cls: 'down' }
}

function TableHeader({ sort, onSort, editMode }) {
  const headers = editMode ? HEADERS_EDIT : HEADERS_NORMAL
  const colTemplate = editMode ? COL_TEMPLATE_EDIT : COL_TEMPLATE_NORMAL
  return (
    <div className="tbl-header" style={{ gridTemplateColumns: colTemplate }}>
      {headers.map(({ label, key, cls }) => (
        <div
          key={label}
          className={`th ${cls}${sort.key === key ? ' sorted' : ''}`}
          onClick={() => key && onSort(key)}
          style={{ cursor: key ? 'pointer' : 'default' }}
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

// Excel-like 키보드 이동: Enter → 같은 컬럼 아래 행, Shift+Enter → 같은 컬럼 위 행
function moveCellOnEnter(e, colName) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const cur = e.currentTarget
  const row = cur.closest('.tbl-row')
  const target = e.shiftKey ? row?.previousElementSibling : row?.nextElementSibling
  const nextInput = target?.querySelector(`input[data-edit-col="${colName}"]`)
  if (nextInput) {
    nextInput.focus()
    nextInput.select()
  } else {
    cur.blur()
  }
}

function RankingRow({ row, style, onRowClick, onRankerClick, currentUserId, pinnedUser, editMode, dirtyValue, onDirtyChange, hasGroups }) {
  const { song, top, totalRecords, mine, groupTop } = row
  const lvInt = Math.floor(song.level)
  const lvDec = song.level % 1 === 0 ? '.0' : '.5'

  const topJp = top?.judgment_percent ?? null
  const myJp = mine?.judgment_percent ?? null
  const groupJp = groupTop?.judgment_percent ?? null
  const delta = fmtDelta(myJp, topJp)

  const myCls = judgeColor(myJp)
  const topCls = judgeColor(topJp)
  const groupCls = judgeColor(groupJp)
  const isMyTop = top?.is_mine
  const isMineManual = !!mine?.is_manual

  const rankerLabel = pinnedUser ? `${pinnedUser.nickname}의 성과` : '내 성과'
  const additional = top && totalRecords > 1 ? `+${totalRecords - 1}` : ''

  const editJudgment = editMode ? (dirtyValue?.judgment ?? '') : ''
  const editUrl = editMode ? (dirtyValue?.url ?? '') : ''

  const colTemplate = editMode ? COL_TEMPLATE_EDIT : COL_TEMPLATE_NORMAL

  return (
    <div
      className="tbl-row"
      style={{ ...style, gridTemplateColumns: colTemplate }}
      onClick={editMode ? undefined : () => onRowClick(song)}
    >
      <div className="td">
        <div className="idx-cell">
          {song.is_new && <span className="new-tag">NEW</span>}
        </div>
      </div>

      <div className="td">
        <div className="title-cell">
          <div className="title-thumb" style={{ background: artworkBg(song.id) }}>
            {song.image
              ? <img
                  src={staticUrl(song.image)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              : null}
          </div>
          <span className="title-main">{song.name}</span>
        </div>
      </div>

      <div className="td" style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {song.artist}
      </div>

      <div className="td num level-cell" style={{ '--lv-bar': levelBarColor(song.level) }}>
        <span className="level-val">
          <span className="int">{lvInt}</span>
          <span className="dec">{lvDec}</span>
        </span>
      </div>

      {!editMode && (
        <>
          <div className="td num" style={{ color: 'var(--fg-2)' }}>{fmtBpm(song.bpm)}</div>
          <div className="td num" style={{ color: 'var(--fg-2)' }}>{fmt(song.combo)}</div>

          <div className="td num">
            {top ? (
              <div className="rank-judge-cell">
                <span className={`judge ${topCls}`}>{fmtJp(topJp)}<span className="pct">%</span></span>
                <span
                  className="ranker"
                  onClick={e => {
                    e.stopPropagation()
                    if ((top.visibility === 'public' || top.visibility === 'group') && !top.is_mine) onRankerClick(top, song.id)
                  }}
                  title={(top.visibility === 'public' || top.visibility === 'group') && !top.is_mine ? `${top.nickname}의 성과 보기` : undefined}
                  style={{ cursor: (top.visibility === 'public' || top.visibility === 'group') && !top.is_mine ? 'pointer' : 'default' }}
                >
                  <span className="ranker-medal">🥇</span>
                  <span className="ranker-name">{top.nickname}</span>
                  {top.is_mine && <span className="ranker-me">나</span>}
                  {additional && <span className="ranker-add">{additional}</span>}
                </span>
              </div>
            ) : (
              <span className="judge empty">—</span>
            )}
          </div>

          <div className="td num">
            {!hasGroups ? (
              <span className="judge empty">—</span>
            ) : groupTop ? (
              <div className="rank-judge-cell">
                <span className={`judge ${groupCls}`}>{fmtJp(groupJp)}<span className="pct">%</span></span>
                <span
                  className="ranker"
                  onClick={e => {
                    e.stopPropagation()
                    if ((groupTop.visibility === 'public' || groupTop.visibility === 'group') && !groupTop.is_mine) onRankerClick(groupTop, song.id)
                  }}
                  title={(groupTop.visibility === 'public' || groupTop.visibility === 'group') && !groupTop.is_mine ? `${groupTop.nickname}의 성과 보기` : undefined}
                  style={{ cursor: (groupTop.visibility === 'public' || groupTop.visibility === 'group') && !groupTop.is_mine ? 'pointer' : 'default' }}
                >
                  <span className="ranker-medal">🏅</span>
                  <span className="ranker-name">{groupTop.nickname}</span>
                  {groupTop.is_mine && <span className="ranker-me">나</span>}
                </span>
              </div>
            ) : (
              <span className="judge empty">—</span>
            )}
          </div>
        </>
      )}

      <div className="td num" onClick={editMode ? (e => e.stopPropagation()) : undefined}>
        {editMode ? (
          <input
            type="text"
            inputMode="decimal"
            data-edit-col="judgment"
            className="edit-cell-input mono"
            placeholder="—"
            value={editJudgment}
            onChange={e => onDirtyChange(song.id, 'judgment', e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => moveCellOnEnter(e, 'judgment')}
          />
        ) : myJp != null ? (
          <div className="rank-judge-cell">
            <span className={`judge ${myCls}`}>
              {fmtJp(myJp)}<span className="pct">%</span>
              {isMineManual && <span className="manual-mark" title="본인 직접 입력">M</span>}
            </span>
            {delta && !isMyTop && (
              <span className={`delta mono ${delta.cls}`}>{delta.txt}</span>
            )}
            {isMyTop && <span className="delta mono same">1위</span>}
          </div>
        ) : (
          <span className="judge empty">{pinnedUser ? '—' : (currentUserId ? '—' : '로그인')}</span>
        )}
      </div>

      {editMode && (
        <div className="td" onClick={e => e.stopPropagation()}>
          <input
            type="text"
            data-edit-col="url"
            className="edit-cell-input mono"
            placeholder="https://youtu.be/..."
            value={editUrl}
            onChange={e => onDirtyChange(song.id, 'url', e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => moveCellOnEnter(e, 'url')}
            onBlur={e => {
              // 형식만 빠르게 검증 — 실제 영상 존재는 저장 시 백엔드 oEmbed로 확인
              const url = e.currentTarget.value.trim()
              if (url && !YOUTUBE_URL_RE.test(url)) {
                e.currentTarget.classList.add('invalid')
              } else {
                e.currentTarget.classList.remove('invalid')
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

// 모듈 스코프의 안정적인 row 함수.
// react-window는 children 함수의 reference가 바뀌면 새 컴포넌트 타입으로 보고
// 모든 가상 행을 unmount/remount → input focus가 유실됨. 외부 정의로 reference 고정.
function VirtualRow({ index, style, data }) {
  const {
    rows, onRowClick, onRankerClick, currentUserId, pinnedUser,
    editMode, getDirtyValue, onDirtyChange, hasGroups,
  } = data
  const row = rows[index]
  return (
    <RankingRow
      row={row}
      style={style}
      onRowClick={onRowClick}
      onRankerClick={onRankerClick}
      currentUserId={currentUserId}
      pinnedUser={pinnedUser}
      editMode={editMode && !pinnedUser}
      dirtyValue={editMode ? getDirtyValue(row.song.id) : null}
      onDirtyChange={onDirtyChange}
      hasGroups={hasGroups}
    />
  )
}

export default function RankingsTable({ rows, hasGroups }) {
  const { sort, setSort, pinUser, pinnedUser, editMode, dirty, myManualBySong, setDirtyValue } = useRankingsStore()
  const { user, openModal } = useStore()
  const listRef = useRef(null)

  const handleRowClick = useCallback((song) => {
    if (editMode) return
    openModal(song)
  }, [openModal, editMode])
  const handleRankerClick = useCallback(async (top, songId) => {
    try {
      await pinUser({
        user_id: top.user_id ?? null,
        nickname: top.nickname,
        record_count: 0,
      })
    } catch (e) {
      const status = e?.response?.status
      if (status === 403 || status === 404) {
        alert(`${top.nickname}님의 성과는 비공개되어 있어요`)
      } else {
        alert('사용자 성과를 가져오지 못했어요')
      }
    }
  }, [pinUser])

  // 편집 셀의 input value: dirty 우선, 없으면 기존 manual 값. { judgment, url } 객체 형태.
  const getDirtyValue = useCallback((songId) => {
    const fromDirty = dirty.get(songId) || {}
    const fromManual = myManualBySong.get(songId)
    return {
      judgment: fromDirty.judgment !== undefined
        ? fromDirty.judgment
        : (fromManual ? fromManual.judgment_percent.toFixed(3) : ''),
      url: fromDirty.url !== undefined
        ? fromDirty.url
        : (fromManual?.youtube_url || ''),
    }
  }, [dirty, myManualBySong])

  // FixedSizeList의 itemData로 모든 가변 의존성을 모음. children(VirtualRow) 자체는
  // 모듈 스코프 고정 reference이므로, dirty 변화가 가상 행 unmount를 유발하지 않음.
  const itemData = useMemo(() => ({
    rows,
    onRowClick: handleRowClick,
    onRankerClick: handleRankerClick,
    currentUserId: user?.id,
    pinnedUser,
    editMode,
    getDirtyValue,
    onDirtyChange: setDirtyValue,
    hasGroups,
  }), [rows, handleRowClick, handleRankerClick, user, pinnedUser, editMode, getDirtyValue, setDirtyValue, hasGroups])

  return (
    <div className="table-wrap">
      <TableHeader sort={sort} onSort={setSort} editMode={editMode && !pinnedUser} />
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="tbl-body" style={{ flex: 1, overflow: 'hidden' }}>
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                ref={listRef}
                height={height}
                width={width}
                itemCount={rows.length}
                itemSize={56}
                itemData={itemData}
                style={{ overflowX: 'hidden' }}
              >
                {VirtualRow}
              </FixedSizeList>
            )}
          </AutoSizer>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  const { quick, flagRanked, search } = useRankingsStore()
  const { user } = useStore()
  let icon = '🔍'
  let title = '결과가 없어요'
  let sub = '필터나 검색어를 다시 확인해주세요'
  if (search.trim()) {
    icon = '🔍'; title = '검색 결과가 없어요'; sub = '다른 검색어로 시도해보세요'
  } else if (quick === 'mine') {
    icon = '🎮'; title = '등록한 성과가 없어요'; sub = user ? '곡 상세 화면에서 첫 성과를 등록해보세요' : '로그인 후 이용 가능해요'
  } else if (quick === 'ranked' || flagRanked) {
    icon = '🏆'; title = '성과 데이터가 있는 곡이 없어요'; sub = ''
  }
  return (
    <div className="rk-empty">
      <div className="rk-empty-icon">{icon}</div>
      <div className="rk-empty-title">{title}</div>
      {sub && <div className="rk-empty-sub">{sub}</div>}
    </div>
  )
}
