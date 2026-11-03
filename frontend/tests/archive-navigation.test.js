import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveSection, navigationTarget } from '../src/utils/archiveNavigation.js'

test('service navigation escapes music router basenames and preserves server identity', () => {
  for (const section of ['kr', 'xyx']) {
    const base = section === 'kr' ? '/music' : '/xyx'
    assert.deepEqual(navigationTarget(section, { base, host: 'r2archive.com' }), { to: '/' })
    assert.deepEqual(navigationTarget(section, { base: '', host: 'r2archive.com' }), { href: `https://r2archive.com${base}/` })
  }
  assert.deepEqual(navigationTarget('kr', { base: '/xyx', host: 'r2archive.com' }), { href: 'https://r2archive.com/music/' })
  assert.deepEqual(navigationTarget('xyx', { base: '/music', host: 'r2archive.com' }), { href: 'https://r2archive.com/xyx/' })
  assert.deepEqual(navigationTarget('kr', { base: '', host: 'localhost', xyx: false }), { to: '/' })
  assert.deepEqual(navigationTarget('xyx', { base: '', host: 'xyx.r2archive.com', xyx: true }), { to: '/' })
  for (const base of ['/music', '/xyx']) {
    assert.deepEqual(navigationTarget('shop', { base, host: 'r2archive.com' }), { href: 'https://r2archive.com/shop' })
    assert.deepEqual(navigationTarget('home', { base, host: 'r2archive.com' }), { href: 'https://r2archive.com/myhome' })
    assert.deepEqual(navigationTarget('music', { base, host: 'r2archive.com' }), { to: '/' })
  }
  assert.deepEqual(navigationTarget('music', { base: '', host: 'r2archive.com', xyx: false }), { href: '/music/' })
  assert.deepEqual(navigationTarget('music', { base: '', host: 'xyx.r2archive.com', xyx: true }), { href: '/xyx/' })
  assert.deepEqual(navigationTarget('shop', { base: '', host: 'localhost' }), { to: '/shop' })
  assert.deepEqual(navigationTarget('feedback', { base: '/music', host: 'r2archive.com' }), { to: '/feedback' })
  for (const base of ['', '/xyx']) assert.deepEqual(navigationTarget('feedback', { base, host: 'r2archive.com' }), { href: 'https://r2archive.com/music/feedback' })
})

test('active service covers nested character and administration routes', () => {
  for (const [path, section] of [['/shop', 'shop'], ['/shop/admin', 'admin'], ['/myhome/characters/1', 'home'], ['/myhome/friend', 'home'], ['/game-repair/admin', 'repair'], ['/feedback', 'feedback'], ['/groups', 'music']]) assert.equal(archiveSection(path), section)
})
