export const DEFAULT_TITLE = '알투비트 아카이브 — Music'
export const KR_ORIGIN = 'https://music.r2archive.com'

export const PUBLIC_PAGES = [
  {
    path: '/',
    file: 'home.html',
    title: '알투비트 음악 검색 | R2Archive',
    description: '알투비트 음악과 아티스트를 검색하고 난이도, BPM, 콤보 정보와 음악 듣기 링크를 확인하세요.',
  },
  {
    path: '/pmang-songs',
    file: 'pmang.html',
    title: '과거 피망 알투비트 음악 목록 | R2Archive',
    description: '과거 피망 알투비트의 음악과 아티스트를 찾아보고 난이도, BPM, 콤보 정보와 음악 듣기 링크를 확인하세요.',
  },
]

export function getPageSeo(pathname) {
  const path = pathname === '/index.html' ? '/' : pathname.replace(/\/$/, '') || '/'
  const page = PUBLIC_PAGES.find(page => page.path === path)
  return page ? { ...page, canonical: KR_ORIGIN + page.path } : null
}
