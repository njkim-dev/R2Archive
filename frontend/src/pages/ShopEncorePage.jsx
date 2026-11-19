import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronRight, Image, Search } from 'lucide-react'
import { getShopItem, getShopMeta } from '../api/shop'
import { ArchivePageLayout } from '../components/ArchiveNavigation'
import ShopOutfitPreview from '../components/shop/ShopOutfitPreview'
import ShopViewer from '../components/shop/ShopViewer'
import ShopViewModes from '../components/shop/ShopViewModes'
import roundUrl from '../data/encore-shop.json?url&no-inline'
import { useMobile } from '../hooks/useMobile'
import { coupleShareUrl, SLOT_LABELS } from '../utils/shopUrl'
import '../styles/shop.css'
import '../styles/shopEncore.css'

const filters = [['all', '전체'], ['outfit', '의상'], ['utility', '기능성']]
const sexes = [['female', '여성'], ['male', '남성']]
const cameraDefault = { angle: 180, zoom: 100, panX: 0, panY: 0 }
const empty = {}
const thumbnail = offer => offer.items.find(item => item.sex === 'female' && item.slot === 'top' && item.thumbnail)
  || offer.items.find(item => item.thumbnail)
const normalize = value => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

function EncoreThumb({ item }) {
  return item?.thumbnail
    ? <img src={item.thumbnail} alt="" width="128" height="128" loading="lazy" decoding="async" />
    : <Image size={22} aria-hidden="true" />
}

function EncorePreview({ offer, version, sex, onSex }) {
  const [partName, setPartName] = useState('')
  const [loaded, setLoaded] = useState(null)
  const [retry, setRetry] = useState(0)
  const [camera, setCamera] = useState(cameraDefault)
  const [mode, setMode] = useState('rotate')
  const items = useMemo(() => offer.items.filter(item => item.sex === sex || item.sex === 'common'), [offer, sex])
  const wearable = useMemo(() => items.filter(item => item.preview), [items])
  const part = items.find(item => item.name === partName)
  const target = part ? (part.preview ? [part] : []) : wearable
  const key = sex + ':' + retry
  const result = loaded?.key === key ? loaded : null
  const pending = target.length > 0 && !result
  const slots = useMemo(() => {
    const models = result?.models || []
    return Object.fromEntries(models.filter(item => !part || item.id === part.id).map(item => [item.slot, item]))
  }, [result, part])
  const ready = !!result?.meta && Object.keys(slots).length > 0
  const missing = part ? 0 : items.length - wearable.length + (result?.missing || 0)
  const motionItem = items.find(item => item.motion)
  const displayed = part || thumbnail(offer) || items[0]

  useEffect(() => {
    if (!wearable.length) return
    const controller = new AbortController()
    Promise.allSettled([
      getShopMeta(version, controller.signal),
      ...wearable.map(item => getShopItem(item.id, version, controller.signal)),
    ]).then(([meta, ...entries]) => {
      if (controller.signal.aborted) return
      const models = entries.flatMap(({ status, value }, index) => status === 'fulfilled'
        && value.id === wearable[index].id && value.slot === wearable[index].slot
        && value.preview_available && value.model ? [value] : [])
      setLoaded({ key, meta: meta.value, models, missing: wearable.length - models.length })
    })
    return () => controller.abort()
  }, [key, version, wearable])

  function chooseSex(next) {
    setPartName('')
    onSex(next)
  }

  return <div className="encore-preview">
    <div className="encore-preview-heading">
      <div><span>{offer.kind === 'outfit' ? '의상 세트' : motionItem ? '커플 아이템' : '기능성 아이템'}</span><h2>{offer.name}</h2></div>
      {offer.kind === 'outfit' && <div className="encore-filter" role="group" aria-label="캐릭터 성별">
        {sexes.filter(([value]) => offer.items.some(item => item.sex === value || item.sex === 'common')).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={sex === value} onClick={() => chooseSex(value)}>{label}</button>)}
      </div>}
    </div>
    <div className="encore-stage">
      {ready ? <ShopViewer meta={result.meta} slots={slots} sex={sex} counterparts={empty} pair={false}
        {...camera} mode={mode} onViewChange={setCamera} disposeContext />
        : <div className="encore-stage-placeholder">
          {pending ? <p role="status">의상을 불러오는 중입니다.</p>
            : <><EncoreThumb item={displayed} />
              {target.length > 0 ? <div role="status"><p>미리보기를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></div>
                : <p>{motionItem ? '커플 모션' : displayed?.thumbnail ? '3D 미리보기 미지원' : '미리보기 이미지 없음'}</p>}</>}
        </div>}
    </div>
    <div className="encore-preview-controls">
      {wearable.length > 0 && <div inert={ready ? undefined : ''} className={ready ? '' : 'encore-controls-pending'}><ShopViewModes mode={mode} onChange={setMode} /></div>}
      {motionItem && <a className="encore-motion-link"
        href={coupleShareUrl({ version, sex, slots: empty, item: motionItem })} target="_blank" rel="noopener noreferrer">
        커플 모션 미리보기 <ArrowUpRight size={15} aria-hidden="true" /></a>}
    </div>
    {offer.kind === 'outfit' && <p className="encore-preview-note" aria-live="polite">
      {missing > 0 ? `미리보기가 지원되지 않는 부위가 ${missing}개 있습니다.` : ''}
    </p>}
    {offer.kind === 'outfit' && <details className="encore-parts">
      <summary>구성 아이템 <span>{items.length}개</span></summary>
      <button type="button" aria-pressed={!part} onClick={() => setPartName('')}>세트 전체 착용</button>
      <ul>
        {items.map(item => <li key={item.name}>
          <button type="button" aria-pressed={part === item} onClick={() => setPartName(item.name)}>
            <EncoreThumb item={item} />
            <span>{item.name}<small>{item.slot ? SLOT_LABELS[item.slot] : '의상'}{!item.preview && ' · 아이콘 보기'}</small></span>
          </button>
        </li>)}
      </ul>
    </details>}
  </div>
}

export default function ShopEncorePage() {
  const mobile = useMobile(801)
  const [round, setRound] = useState(null)
  const [loadingError, setLoadingError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [preferredSex, setPreferredSex] = useState('female')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoadingError(false)
    fetch(roundUrl, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Encore catalog unavailable')
      return response.json()
    }).then(data => setRound(data)).catch(() => {
      if (!controller.signal.aborted) setLoadingError(true)
    })
    return () => controller.abort()
  }, [retry])

  const search = normalize(query)
  const offers = (round?.offers || []).filter(offer => (kind === 'all' || offer.kind === kind)
    && (!search || [offer.name, ...offer.items.map(item => item.name)].some(name => normalize(name).includes(search))))
  const selected = offers.find(offer => offer.id === selectedId) || offers[0]
  const sex = selected?.items.some(item => item.sex === preferredSex || item.sex === 'common')
    ? preferredSex : preferredSex === 'female' ? 'male' : 'female'

  function choose(offer) {
    setSelectedId(offer.id)
    if (mobile) setPreviewOpen(true)
  }

  const preview = selected && <EncorePreview key={selected.id} offer={selected} version={round.catalogVersion}
    sex={sex} onSex={setPreferredSex} />

  return <ArchivePageLayout section="encore" className="shop-app encore-app">
    <main className="shop-main encore-main">
      <h1>앙코르 상점</h1>
      <section className="encore-round" aria-label="판매 회차" aria-busy={!round && !loadingError}>
        <CalendarDays size={22} aria-hidden="true" />
        <strong>{round?.label || '판매 회차'}</strong>
        {round?.sourceUrl && <a href={round.sourceUrl} target="_blank" rel="noopener noreferrer">공식 공지 <ArrowUpRight size={15} aria-hidden="true" /></a>}
      </section>
      <div className="encore-toolbar">
        <div className="encore-filter" role="group" aria-label="판매 아이템 종류">
          {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value}
            onClick={() => setKind(value)}>{label}</button>)}
        </div>
        <label className="encore-search"><Search size={17} aria-hidden="true" />
          <input type="search" aria-label="판매 아이템 이름 검색" placeholder="아이템 이름 검색" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="encore-workspace">
        <section className="encore-list" aria-busy={!round && !loadingError}>
          <div className="encore-list-heading"><h2>판매 목록</h2><span aria-live="polite">{round ? `${offers.length}개` : ''}</span></div>
          {loadingError ? <div className="encore-list-status" role="alert"><p>판매 목록을 불러오지 못했습니다.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></div>
            : !round ? <p className="encore-list-status" role="status">판매 목록을 불러오는 중입니다.</p>
              : offers.length === 0 ? <p className="encore-list-status" role="status">{round.offers.length ? '검색 결과가 없습니다.' : '등록된 판매 목록이 없습니다.'}</p>
                : <ul className="encore-offers">{offers.map(offer => <li key={offer.id}>
                  <button type="button" className="encore-offer" aria-label={offer.name + ' 미리보기'}
                    aria-pressed={offer.id === selected?.id} aria-haspopup={mobile ? 'dialog' : undefined} onClick={() => choose(offer)}>
                    <span className="encore-offer-art"><EncoreThumb item={thumbnail(offer)} /></span>
                    <span className="encore-offer-name"><strong>{offer.name}</strong>
                      <small>{offer.kind === 'outfit'
                        ? `의상 세트 · ${offer.items.filter(item => item.sex === 'female' || item.sex === 'common').length || offer.items.length}부위`
                        : offer.items.some(item => item.motion) ? '커플 아이템' : '기능성 아이템'}</small>
                    </span>
                    <span className="encore-offer-action">미리보기 <ChevronRight size={14} aria-hidden="true" /></span>
                  </button>
                </li>)}</ul>}
        </section>
        {!mobile && <aside className="encore-aside" aria-label="착용 미리보기">{preview}</aside>}
      </div>
      {mobile && previewOpen && preview && <ShopOutfitPreview onClose={() => setPreviewOpen(false)} className="encore-dialog">{preview}</ShopOutfitPreview>}
    </main>
  </ArchivePageLayout>
}
