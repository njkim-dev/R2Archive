import { Link } from 'react-router-dom'
import '../styles/game-repair.css'

export default function ArchiveHomePage() {
  return <main className="repair-page archive-home">
    <span className="archive-home-brand">R2Archive</span>
    <h1>알투비트를 위한 도구</h1>
    <p>게임 설치 파일을 확인하거나 음악 아카이브를 둘러보세요.</p>
    <div className="archive-home-links">
      <Link to="/game-repair" className="archive-home-card"><h2>게임 복구 시스템 →</h2><p>버전과 누락·크기가 다른 파일을 검사하고 복구합니다.</p></Link>
      <a href="https://music.r2archive.com" className="archive-home-card"><h2>음악 아카이브 →</h2><p>곡 정보, 체감 난이도와 업데이트 내역을 확인합니다.</p></a>
    </div>
  </main>
}
