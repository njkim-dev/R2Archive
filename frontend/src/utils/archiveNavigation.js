import { ARCHIVE_BASE, isXyxMode } from './serverMode.js'

export function archiveSection(pathname) {
  if (pathname.startsWith('/shop/admin')) return 'admin'
  if (pathname.startsWith('/shop')) return 'shop'
  if (pathname.startsWith('/myhome')) return 'home'
  if (pathname.startsWith('/game-repair')) return 'repair'
  if (pathname.startsWith('/feedback')) return 'feedback'
  return 'music'
}

export function navigationTarget(section, { base = ARCHIVE_BASE, host = globalThis.location?.hostname || '', xyx = isXyxMode() } = {}) {
  if (section === 'music') return base || !['r2archive.com', 'xyx.r2archive.com'].includes(host) ? { to: '/' } : { href: xyx ? '/xyx/' : '/music/' }
  const path = { shop: '/shop', home: '/myhome', repair: '/game-repair', feedback: '/feedback', admin: '/shop/admin' }[section]
  return base || host === 'xyx.r2archive.com' ? { href: `https://r2archive.com${path}` } : { to: path }
}
