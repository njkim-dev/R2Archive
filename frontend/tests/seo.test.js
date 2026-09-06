import test from 'node:test'
import assert from 'node:assert/strict'
import { KR_ORIGIN, PUBLIC_PAGES, getPageSeo } from '../src/utils/seo.js'

test('only the two public Korean catalogs have indexable metadata', () => {
  assert.deepEqual(PUBLIC_PAGES.map(page => page.path), ['/', '/pmang-songs'])
  for (const page of PUBLIC_PAGES) {
    const seo = getPageSeo(page.path)
    assert.equal(seo.canonical, KR_ORIGIN + page.path)
    assert.ok(seo.title.includes('알투비트 음악'))
    assert.ok(seo.description.length > 20)
    assert.equal(new URL(seo.canonical).search, '')
    assert.equal(new URL(seo.canonical).hash, '')
  }
})

test('trailing slashes and the index document use the same canonical', () => {
  assert.equal(getPageSeo('/index.html').canonical, getPageSeo('/').canonical)
  assert.equal(getPageSeo('/pmang-songs/').canonical, getPageSeo('/pmang-songs').canonical)
})

test('admin, personal, unknown and catalog-fragment routes do not enter the sitemap', () => {
  for (const path of ['/analytics', '/removed-songs', '/personal-categories', '/personal-categories/example', '/groups', '/achievements', '/feedback', '/missing', '/#song=1']) {
    assert.equal(getPageSeo(path), null, path)
  }
})
