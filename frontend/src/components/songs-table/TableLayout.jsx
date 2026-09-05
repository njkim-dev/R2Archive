export const COL_TEMPLATE = '56px 2fr 1fr 76px 100px 110px 110px 68px 80px 56px'
export const COMPACT_COL_TEMPLATE = 'minmax(0, 1.45fr) minmax(110px, 0.9fr) 76px'
export const CATALOG_FULL_TABLE_MIN_WIDTH = 620
export const LINKED_COMPACT_COL_TEMPLATE = 'minmax(0, 1.25fr) minmax(0, 1fr) minmax(100px, 0.8fr) 76px'
export const XYX_COL_TEMPLATE = '50px minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 0.95fr) 68px 86px 94px 96px 58px 64px 46px'
export const XYX_CATEGORY_COL_TEMPLATE = '50px minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 0.95fr) 68px 86px 94px 96px 58px 64px 46px'

export const DEFAULT_HEADERS = [
  { label: '#',        key: 'file_order', cls: '' },
  { label: '곡명',     key: 'name',      cls: '' },
  { label: '아티스트',  key: 'artist',    cls: '' },
  { label: '난이도',   key: 'level',     cls: 'num' },
  { label: '유저 난이도', key: 'userLevel', cls: 'num' },
  { label: 'BPM',     key: 'bpm',       cls: 'num' },
  { label: '콤보',    key: 'combo',     cls: 'num' },
  { label: '시간',    key: 'time',      cls: 'num' },
  { label: '재생',    key: 'play_count', cls: 'num' },
  { label: '변속',    key: null,        cls: 'center' },
]

export const REAL_BPM_HEADER = { label: '원 BPM', key: 'real_bpm', cls: 'num' }
export const DEFAULT_HEADERS_WITH_REAL_BPM = [
  ...DEFAULT_HEADERS.slice(0, 6),
  REAL_BPM_HEADER,
  ...DEFAULT_HEADERS.slice(6),
]

export const XYX_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel'),
]

export const FAVORITE_COUNT_HEADER = { label: '즐겨찾기', key: 'favorite_count', cls: 'num' }
export const COMPACT_HEADERS = [
  { label: '곡명', key: 'name', cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
]
export const compactLinkedHeaders = (label, key) => [
  { label: '곡명', key: 'name', cls: '' },
  { label, key, cls: '' },
  { label: '아티스트', key: 'artist', cls: '' },
  { label: '난이도', key: 'level', cls: 'num' },
]

export const favoriteCountHeaders = (headers) => headers.map(header =>
  header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
)

export const xyxFavoriteCountHeaders = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel').map(header =>
    header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
  ),
]

export const XYX_CATEGORY_HEADERS = [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  { label: '한국 곡명', key: 'korea_name', cls: '' },
  ...DEFAULT_HEADERS.slice(2).filter(header => header.key !== 'userLevel'),
]

export const KOREA_NAME_HEADER = XYX_HEADERS[2]
export const xyxHeaders = (showOriginalBpmColumn = false) => [
  DEFAULT_HEADERS[0],
  DEFAULT_HEADERS[1],
  KOREA_NAME_HEADER,
  ...DEFAULT_HEADERS.slice(2, 6).filter(header => header.key !== 'userLevel'),
  ...(showOriginalBpmColumn ? [REAL_BPM_HEADER] : []),
  ...DEFAULT_HEADERS.slice(6),
]
export const xyxHeadersWithFavoriteCount = (showOriginalBpmColumn = false) =>
  xyxHeaders(showOriginalBpmColumn).map(header =>
    header.key === 'play_count' ? FAVORITE_COUNT_HEADER : header
  )

export const personalCategoryHeaders = (headers) => headers.map(header =>
  header.key === 'play_count'
    ? { label: '삭제', key: null, cls: 'center' }
    : header
)

export function columnKey(header) {
  return header.key ?? (header.label === '변속' ? 'variant' : 'actions')
}

function minimumColumnWidth(header, width, compact) {
  const key = columnKey(header)
  if (key === 'name') return compact ? 220 : 360
  if (key === 'korea_name') return compact ? Math.min(140, width * 0.3) : 140
  if (key === 'artist') return 120
  if (key === 'game_index') return 72
  if (key === 'level') return 76
  if (key === 'userLevel' || key === 'bpm' || key === 'real_bpm') return 100
  if (key === 'combo') return 110
  if (key === 'time') return 68
  if (key === 'play_count' || key === 'favorite_count') return 80
  return 56
}

export function hideColumnsForWidth(width, headers, compact = false) {
  const hidden = new Set(compact ? ['artist'] : [])
  if (!width) return hidden
  let required = headers.filter(header => !hidden.has(columnKey(header)))
    .reduce((sum, header) => sum + minimumColumnWidth(header, width, compact), 0)
  const priority = [
    'play_count', 'favorite_count', 'userLevel', 'time', 'combo', 'real_bpm', 'artist',
    'file_order', 'game_index', 'variant',
    ...(compact ? ['level'] : []),
  ]
  for (const key of priority) {
    if (required <= width) break
    const header = headers.find(item => columnKey(item) === key)
    if (!header || hidden.has(key)) continue
    hidden.add(key)
    required -= minimumColumnWidth(header, width, compact)
  }
  return hidden
}

export function templateFromHeaders(headers, width = Infinity, compact = false) {
  const otherWidth = headers
    .filter(header => header.key !== 'name')
    .reduce((sum, header) => sum + minimumColumnWidth(header, width, compact), 0)
  return headers.map(header => {
    const minimum = minimumColumnWidth(header, width, compact)
    if (header.key === 'name') return `minmax(${Math.max(0, Math.min(minimum, width - otherWidth))}px, 2fr)`
    if (header.key === 'korea_name') return `minmax(${minimum}px, 1.1fr)`
    if (header.key === 'artist') return `minmax(${minimum}px, 1fr)`
    return `${minimum}px`
  }).join(' ')
}

export function TableHeader({ sort, onSort, headers = DEFAULT_HEADERS, colTemplate = COL_TEMPLATE }) {
  return (
    <div className="tbl-header" style={{ gridTemplateColumns: colTemplate }} role="row">
      {headers.map(({ label, key, cls }) => {
        const content = (
          <>
            {label}
            {key && sort.key === key && (
              <span className="arrow" aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</span>
            )}
            {key && sort.key !== key && (
              <span style={{ color: 'var(--fg-4)', fontSize: 9, opacity: 0.5 }} aria-hidden="true">⇅</span>
            )}
          </>
        )
        if (!key) {
          return <div key={label} className={`th ${cls}`} role="columnheader">{content}</div>
        }
        const direction = sort.key === key ? (sort.dir === 'asc' ? '오름차순' : '내림차순') : '정렬되지 않음'
        return (
          <button
            type="button"
            key={label}
            className={`th ${cls}${sort.key === key ? ' sorted' : ''}`}
            role="columnheader"
            aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            onClick={() => onSort(key)}
            aria-label={`${label} 기준 정렬, 현재 ${direction}`}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
