import { Link,useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import wideBackground from '../assets/archive-home/r2beat-aquarium-wide.png'
import portraitBackground from '../assets/archive-home/r2beat-aquarium-portrait.png'
import logoImage from '../assets/archive-home/r2beat-logo-transparent.png'
import '../styles/archive-home.css'

export default function ArchiveHomePage() {
  const {user,authLoaded}=useStore(),navigate=useNavigate()
  return <main className="archive-portal">
    <picture className="artwork" aria-hidden="true"><source media="(max-aspect-ratio: 4/3)" srcSet={portraitBackground} /><img src={wideBackground} alt="" width="1672" height="941" /></picture>
    <svg className="game-logo" viewBox="40 55 2120 595" role="img" aria-label="R2Beat" xmlns="http://www.w3.org/2000/svg"><image href={logoImage} width="2172" height="724"/></svg>
    <header className="masthead">
      <Link className="brand" to="/" aria-label="R2 Archive 처음으로"><span className="brand-name"><b>R<span>2</span></b> ARCHIVE</span><span className="brand-caption">알투비트 팬 아카이브</span></Link>
      <nav aria-label="공식 홈페이지"><a href="https://vfunkr.valofe.com/library/r2beat-ko" target="_blank" rel="noopener noreferrer">공식 홈페이지 ↗</a></nav>
    </header>
    <section className="content" aria-labelledby="hero-title">
      <div className="intro">
        <p className="eyebrow">MUSIC, MEMORIES & PLAY</p>
        <h1 id="hero-title">함께 즐기는,<br /><span>알투비트의 모든 순간.</span></h1>
        <p className="lead">좋아하는 음악을 들으며 추억을 쌓아요.</p>
      </div>
      <div className="services">

        <a className="service music" href="/music/" aria-label="음악 아카이브 둘러보기">
          <span className="service-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M25 43V17l27-6v27M25 24l27-6" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><ellipse cx="17" cy="46" rx="10" ry="8" fill="currentColor"/><ellipse cx="44" cy="40" rx="10" ry="8" fill="currentColor"/></svg><i></i></span>
          <span className="service-kicker">MUSIC ARCHIVE</span>
          <h2>음악 아카이브</h2>
          <p>예전 서비스 음악부터 새로운 음악까지,<br />알투비트 곡들을 만나보세요.</p>
          <span className="service-cta">아카이브 둘러보기 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></span>
        </a>
        <Link className="service repair" to="/game-repair" aria-label="게임 복구 파일 검사 시작">
          <span className="service-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M39 10a16 16 0 0 0-19 20L7 44a8 8 0 0 0 12 11l14-15A16 16 0 0 0 53 21l-10 10-10-10 10-10Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="14" cy="48" r="2" fill="currentColor"/></svg><i></i></span>
          <span className="service-kicker">GAME REPAIR</span>
          <h2>게임 복구</h2>
          <p>게임이 튕기시나요?<br />게임 파일을 검사하고 복구하세요.</p>
          <span className="service-cta">파일 검사 시작 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></span>
        </Link>
        <Link className="service shop-service" to="/shop" aria-label="아이템 상점 둘러보기"><span className="service-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M16 23h32l4 32H12l4-32ZM23 24V16a9 9 0 0 1 18 0v8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><i /></span><span className="service-kicker">ITEM SHOP</span><h2>아이템 상점</h2><p>아이템을 찾아보고,<br />나만의 의상을 미리 확인해보세요.</p><span className="service-cta">상점 둘러보기 →</span></Link>
        <button className="service myhome-service" disabled={!authLoaded||!user} onClick={()=>navigate('/myhome')} aria-label="마이홈 둘러보기"><span className="service-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M10 30 32 10l22 20v25H10V30ZM25 55V36h14v19" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/></svg></span><span className="service-kicker">MY HOME</span><h2>마이홈</h2><p>내 의상을 저장해서 언제든지 불러오고 친구에게 공유할 수 있어요</p><span className="service-cta">마이홈 둘러보기 →</span></button>
      </div>
      <p className="small-note"><span aria-hidden="true">♫</span> 음악을 찾고, 다시 신나게 달려보세요.</p>
    </section>
    <footer><span>R2 Archive <span className="footer-caption">· 알투비트를 함께 즐기는 공간</span></span><span>r2archive.com</span></footer>
  </main>
}
