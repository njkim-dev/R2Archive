import { ARCHIVE_BASE, isXyxMode, SERVER_LINKS } from './serverMode.js'

export function archiveSection(pathname) {
  if (pathname.startsWith('/shop/admin')) return 'admin'
  if (pathname.startsWith('/shop')) return 'shop'
  if (pathname.startsWith('/myhome')) return 'home'
  if (pathname.startsWith('/game-repair')) return 'repair'
  if (pathname.startsWith('/feedback')) return 'feedback'
  return 'music'
}

export function navigationTarget(section, { base = ARCHIVE_BASE, host = globalThis.location?.hostname || '', xyx = isXyxMode() } = {}) {
  if (section === 'kr' || section === 'xyx') {
    const ownBase = section === 'kr' ? '/music' : '/xyx'
    const local = !base && !['r2archive.com', 'xyx.r2archive.com'].includes(host)
    if (base === ownBase || local && section === (xyx ? 'xyx' : 'kr') || !base && host === 'xyx.r2archive.com' && section === 'xyx') return { to: '/' }
    return { href: SERVER_LINKS[section] }
  }
  if (section === 'music') return base || !['r2archive.com', 'xyx.r2archive.com'].includes(host) ? { to: '/' } : { href: xyx ? '/xyx/' : '/music/' }
  if (section === 'feedback' && ['r2archive.com', 'xyx.r2archive.com'].includes(host)) return base === '/music' ? { to: '/feedback' } : { href: 'https://r2archive.com/music/feedback' }
  const path = { shop: '/shop', home: '/myhome', repair: '/game-repair', feedback: '/feedback', admin: '/shop/admin' }[section]
  return base || host === 'xyx.r2archive.com' ? { href: `https://r2archive.com${path}` } : { to: path }
}
