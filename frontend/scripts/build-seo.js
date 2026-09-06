import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parse, parseFragment, serialize } from 'parse5'
import { KR_ORIGIN, PUBLIC_PAGES, getPageSeo } from '../src/utils/seo.js'

const output = new URL('../dist/seo/kr/', import.meta.url)
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
await mkdir(output, { recursive: true })

// 같은 본문과 JS/CSS를 사용하고 공개 페이지의 head만 교체한다.
for (const page of PUBLIC_PAGES) {
  const seo = getPageSeo(page.path)
  const document = parse(html)
  const head = document.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head')
  head.childNodes = head.childNodes.filter(node => node.tagName !== 'title')
  const fragment = parseFragment(`
    <title>${escape(seo.title)}</title>
    <meta name="google-site-verification" content="DXgPBP38iWVZ-p_7pOaEbltAqpG-r4G4Ss0mdyZVJBY">
    <meta data-page-seo name="description" content="${escape(seo.description)}">
    <meta data-page-seo name="robots" content="index, follow">
    <link data-page-seo rel="canonical" href="${escape(seo.canonical)}">
  `)
  for (const node of fragment.childNodes) {
    node.parentNode = head
    head.childNodes.push(node)
  }
  await writeFile(new URL(page.file, output), serialize(document))
}

await writeFile(new URL('robots.txt', output), `User-agent: *\nAllow: /\nSitemap: ${KR_ORIGIN}/sitemap.xml\n`)
await writeFile(new URL('sitemap.xml', output), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PAGES.map(page => `  <url><loc>${escape(KR_ORIGIN + page.path)}</loc></url>`).join('\n')}
</urlset>
`)
