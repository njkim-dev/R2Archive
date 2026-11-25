import { ARCHIVE_HOME_URL } from '../utils/archiveNavigation'

export default function ArchiveBrand({ className = 'archive-brand', children }) {
  return (
    <a className={className} href={ARCHIVE_HOME_URL} aria-label="R2 Archive 메인 홈페이지">
      {children ?? <>
        <span className="archive-brand-mark">R2</span>
        <span>ARCHIVE<small>알투비트 아카이브</small></span>
      </>}
    </a>
  )
}
