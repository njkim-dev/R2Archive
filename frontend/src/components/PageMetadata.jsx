import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isXyxMode } from '../utils/serverMode'
import { DEFAULT_TITLE, getPageSeo } from '../utils/seo'

export default function PageMetadata() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (isXyxMode()) return
    const seo = getPageSeo(pathname)
    document.title = seo?.title ?? DEFAULT_TITLE
    document.head.querySelectorAll('[data-page-seo]').forEach(node => node.remove())

    const tags = [
      ['meta', { name: 'robots', content: seo ? 'index, follow' : 'noindex, follow' }],
      ...(seo ? [
        ['meta', { name: 'description', content: seo.description }],
        ['link', { rel: 'canonical', href: seo.canonical }],
      ] : []),
    ]
    for (const [tag, attributes] of tags) {
      const node = document.createElement(tag)
      node.setAttribute('data-page-seo', '')
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
      document.head.appendChild(node)
    }
  }, [pathname])

  return null
}
