import { useCallback } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import useStore from '../../store/useStore'
import { artworkBg, fmtBpm } from '../../utils/helpers'

function fmtJp(jp) { return jp == null ? '—' : jp.toFixed(3) }

function deltaInfo(my, top) {
  if (my == null || top == null) return null
  const d = my - top
  if (Math.abs(d) < 0.0005) return { txt: '±0', cls: 'same' }
  if (d > 0) return { txt: `+${d.toFixed(3)}`, cls: 'up' }
  return { txt: `-${Math.abs(d).toFixed(3)}`, cls: 'down' }
}

function judgeColor(jp) {
  if (jp == null) return 'empty'
  if (jp >= 99) return 'gold'
  if (jp >= 95) return 'high'
  return 'mid'
}

function MobileRankingCard({ row, style, onClick }) {
  const { song, top, mine, totalRecords } = row
  const cat = song.level >= 7 ? 'sun' : song.level >= 4 ? 'moon' : 'star'
  const delta = top && mine ? deltaInfo(mine.judgment_percent, top.judgment_percent) : null
  const additional = top && totalRecords > 1 ? `+${totalRecords - 1}` : ''

  return (
    <div className="mob-rk-card" style={style} onClick={() => onClick(song)}>
      <div className="mob-rk-top">
        <div className="mob-art" style={{ background: artworkBg(song.id) }}>
          {song.image
            ? <img
                src={`${import.meta.env.VITE_API_URL}/static/${song.image}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            : null
          }
        </div>
        <div className="mob-rk-main">
          <div className="mob-card-title">
            {song.is_new && <span className="mob-new-dot" />}
            <span className="mob-card-name">{song.name}</span>
          </div>
          <div className="mob-card-artist">{song.artist}</div>
          <div className="mob-card-inline">
            <span className="mob-lv" data-cat={cat}>Lv {song.level.toFixed(1)}</span>
            <span className="mob-sep">·</span>
            <span>{fmtBpm(song.bpm)} BPM</span>
          </div>
        </div>
      </div>

      <div className="mob-rk-rows">
        {top ? (
          <div className="mob-rk-line">
            <span className="mob-rk-icon">🥇</span>
            <span className="mob-rk-nick">{top.nickname}{top.is_mine && <em className="mob-rk-me">나</em>}</span>
            <span className={`mob-rk-jp judge ${judgeColor(top.judgment_percent)} mono`}>{fmtJp(top.judgment_percent)}%</span>
            {additional && <span className="mob-rk-add mono">{additional}</span>}
          </div>
        ) : (
          <div className="mob-rk-line empty">
            <span className="mob-rk-icon">·</span>
            <span className="mob-rk-nick" style={{ color: 'var(--fg-4)' }}>아직 등록된 기록 없음</span>
          </div>
        )}
        {mine && (
          <div className="mob-rk-line">
            <span className="mob-rk-icon">★</span>
            <span className="mob-rk-nick">내 기록</span>
            <span className={`mob-rk-jp judge ${judgeColor(mine.judgment_percent)} mono`}>{fmtJp(mine.judgment_percent)}%</span>
            {delta && (
              <span className={`mob-rk-delta mono ${delta.cls}`}>{delta.txt}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RankingsMobileList({ rows }) {
  const { openModal } = useStore()

  const Row = useCallback(({ index, style }) => (
    <MobileRankingCard row={rows[index]} style={style} onClick={openModal} />
  ), [rows, openModal])

  if (rows.length === 0) {
    return (
      <div className="mob-empty">
        <div className="mob-empty-icon">🎮</div>
        조건에 맞는 곡이 없어요
      </div>
    )
  }

  return (
    <div style={{ flex: 1 }}>
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList
            height={height}
            width={width}
            itemCount={rows.length}
            itemSize={132}
          >
            {Row}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  )
}
