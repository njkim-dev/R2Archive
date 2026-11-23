import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, House, Music2, Shirt, Wrench } from 'lucide-react'
import useStore from '../store/useStore'
import { staticUrl } from '../utils/helpers'
import { outfitShareUrl } from '../utils/shopUrl'
import encore from '../data/encore-shop.json'
import lobby from '../assets/archive-home/lobby.webp'
import blackDress from '../assets/archive-home/black-dress.webp'
import '../styles/archive-home.css'

const actions = [
  [Music2, '음악 둘러보기', '한국 · 중국 · 과거 피망곡', '/music/'],
  [Shirt, '의상 입어보기', '아이템과 앙코르 의상', '/shop'],
  [House, '내 옷장 열기', '내가 담아 둔 의상', '/myhome'],
  [Wrench, '게임 복구하기', '실행 오류와 곡 튕김', '/game-repair'],
]

function RecentSongs() {
  const [songs, setSongs] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/songs/recent', { signal: controller.signal }).then(response => {
      if (!response.ok) throw Error()
      return response.json()
    }).then(data => setSongs(Array.isArray(data) ? data : [])).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => controller.abort()
  }, [])
  return <section>
    <div className="portal-section-heading"><h2>최근 추가된 곡</h2><a href="/music/">음악 전체 <ChevronRight size={15} /></a></div>
    <div className="portal-albums" aria-busy={songs === null && !failed}>
      {failed || songs?.length === 0 ? <p>{failed ? '곡 목록을 불러오지 못했습니다.' : '아직 등록된 곡이 없습니다.'} <a href="/music/">전체 곡 목록 열기</a></p>
        : (songs ?? [null, null, null]).map((song, index) => song ? <a className="portal-album" key={song.id} href={'/music/#song=' + song.id}>
          <span>{song.image ? <img src={staticUrl(song.image)} alt="" /> : <Music2 aria-hidden="true" />}</span>
          <strong>{song.name}</strong><small>{song.artist}</small>
        </a> : <div className="portal-album" key={index} aria-hidden="true"><span /><strong> </strong><small> </small></div>)}
    </div>
  </section>
}

function EncoreFeature() {
  const outfit = encore.offers.find(offer => offer.id === 'black-formal')
  const slots = Object.fromEntries((outfit?.items || []).filter(item => item.sex === 'female' && item.preview).map(item => [item.slot, item.id]))
  const target = outfit ? new URL(outfitShareUrl({ version: encore.catalogVersion, sex: 'female', slots, angle: 180, zoom: 100 })) : null
  return <section>
    <div className="portal-section-heading"><h2>앙코르 상점</h2><Link to="/shop/encore">판매 목록 <ChevronRight size={15} /></Link></div>
    {target ? <Link className="portal-feature" to={target.pathname + target.search}>
      <img src={blackDress} alt="" /><div><small>{encore.label}</small><strong>블랙 드레스</strong><span>착용 모습 보기 <ArrowUpRight size={15} /></span></div>
    </Link> : <Link to="/shop/encore">이번 회차 의상 보기</Link>}
  </section>
}

export default function ArchiveHomePage({ onOpenSecurityNotice }) {
  const { user, authLoaded, openLogin } = useStore()
  const navigate = useNavigate()
  return <main className="archive-portal"><div className="portal-wrap">
    <header className="masthead"><img src={lobby} alt="" fetchPriority="high" /><h1>알투비트<br /><span>아카이브</span></h1></header>
    <nav className="services" aria-label="아카이브 바로가기">{actions.map(([Icon, title, note, path]) => {
      const content = <><i><Icon size={20} aria-hidden="true" /></i><span><strong>{title}</strong><small>{note}</small></span><ChevronRight size={15} aria-hidden="true" /></>
      if (path === '/myhome') return <button key={path} className="myhome-service" disabled={!authLoaded} onClick={() => user ? navigate(path) : openLogin(path)}>{content}</button>
      return path === '/music/' ? <a key={path} href={path}>{content}</a> : <Link key={path} to={path}>{content}</Link>
    })}</nav>
    <div className="portal-discover"><RecentSongs /><EncoreFeature /></div>
    <footer><span>R2 ARCHIVE</span><a href="https://vfunkr.valofe.com/library/r2beat-ko" target="_blank" rel="noopener noreferrer">공식 홈페이지 ↗</a><button type="button" onClick={onOpenSecurityNotice}>보안 안내</button></footer>
  </div></main>
}
