import { expect, test } from '@playwright/test'
import { setup, shirt, version } from './shopFixtures.js'
import { watchLayout } from './layout.js'

export const searchId = '11111111-1111-4111-8111-111111111111'
export async function imageBytes(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 600
    const context = canvas.getContext('2d'); context.fillStyle = 'pink'; context.fillRect(0, 0, 300, 600)
    return canvas.toDataURL('image/png').split(',')[1]
  })
}
async function upload(page, method = 'upload') {
  const encoded = await imageBytes(page)
  if (method === 'upload') await page.getByLabel('검색 이미지', { exact: true }).setInputFiles({ name: 'character.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') })
  else if (method === 'paste') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(async encoded => {
      delete navigator.clipboard
      const blob = new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: 'image/png' })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    }, encoded)
    await page.keyboard.press('Control+V')
  } else {
    const data = await page.evaluateHandle(encoded => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], 'desktop.png', { type: 'image/png' }))
      return transfer
    }, encoded)
    await page.locator('.shop-image-search-workspace').dispatchEvent('drop', { dataTransfer: data })
  }
  await expect(page.getByAltText('검색할 캐릭터 원본 이미지')).toBeVisible()
  await expect(page.getByText('검색에 사용할 부분을 지정해주세요', {exact:true})).toBeVisible()
  await page.getByRole('button', {name:'전체 이미지 사용',exact:true}).click()
}
const candidate = { ...shirt, version, name: '토끼 민트 상의(남)', is_unreleased: true }
const hair = { ...shirt, id: '220', name: '테스트 머리(남)', slot: 'hair', version }
const result = { search_id: searchId, items: [hair, candidate], version, groups: ['hair', 'top', 'bottom', 'shoes'].map(slot => ({ slot, items: slot === 'hair' ? [hair] : slot === 'top' ? [candidate] : [], exact_match_supported: true })) }

for (const width of [1440, 390]) {
  test(`image search requires login and exposes a custom tooltip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, { loggedIn: false, admin: false })
    await page.goto('/shop?sex=male')
    const button = page.getByRole('button', { name: '이미지로 찾기', exact: true })
    await expect(button).toBeDisabled()
    await page.locator('.shop-image-search-open-anchor').hover()
    await expect(page.getByRole('tooltip')).toContainText('이미지로 찾기 기능은 로그인이 필요합니다.')
    await expect(page.getByRole('link', { name: '관리자 도구', exact: true })).not.toBeVisible()
  })
  test(`member search preserves layout through failure and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, { admin: false, items: [candidate, hair] })
    let release, calls = 0
    await page.route('**/api/shop/image-search', async route => {
      calls++
      const body = route.request().postDataBuffer().toString('latin1')
      for (const value of ['name="image"', '\r\nterra\r\n', '\r\nmale\r\n', 'name="include_unreleased"\r\n\r\ntrue']) expect(body).toContain(value)
      await new Promise(resolve => { release = resolve })
      return calls === 1 ? route.fulfill({ status: 429, json: { detail: '검색 요청이 많습니다' } }) : route.fulfill({ json: result })
    })
    await page.goto('/shop?sex=male')
    await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
    await upload(page, 'paste')
    const search = modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true })
    await expect(search).toBeDisabled()
    await modal.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('male')
    await expect(modal.getByLabel('미출시 아이템 포함')).toHaveCount(0)
    await search.scrollIntoViewIfNeeded()
    const watch = await watchLayout(page, ['.shop-image-search-workspace', '.shop-image-search-controls', '.shop-image-search-submit', '.shop-image-search-status', '.shop-image-search-actions', '.shop-image-search-results'])
    await search.click(); await expect.poll(() => calls).toBe(1); await watch.expectStable()
    release(); await expect(modal.getByRole('alert')).toContainText('검색 요청이 많습니다'); await watch.expectStable()
    await search.click(); await expect.poll(() => calls).toBe(2); await watch.expectStable()
    release(); await expect(modal.getByRole('button', { name: '다시 찾기', exact: true })).toBeVisible(); await watch.expectStable(); await watch.stop()
    await expect(modal.getByRole('heading', { level: 3 })).toHaveCount(4)
    await expect(modal.getByText('AI 검색 결과는 정확하지 않을 수 있습니다.', { exact: false })).toBeVisible()
    await expect(modal.getByRole('button', { name: '해당 의상 입어보기', exact: true })).toBeDisabled()
    await modal.getByRole('button', { name: `${candidate.name} 선택`, exact: true }).click()
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('button', { name: '해당 의상 입어보기', exact: true })).toBeEnabled()
    await modal.getByRole('button', { name: `${candidate.name} 선택`, exact: true }).click()
    await expect(modal.getByRole('button', { name: '해당 의상 즐겨찾기 등록', exact: true })).toBeDisabled()
    await modal.getByRole('button', { name: '다시 찾기', exact: true }).click()
    await expect(modal.getByAltText('검색할 캐릭터 원본 이미지')).toHaveCount(0)
    await expect(modal.getByLabel('검색할 캐릭터 성별', { exact: true })).toHaveValue('')
    await expect(modal.getByText('검색할 이미지를 끌어오세요. Ctrl + V로 붙여넣을 수도 있습니다.')).toBeVisible()
  })
  test(`drop upload, optional votes, favorites and minimized preview persist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const requests = await setup(page, { admin: false, items: [candidate, hair] })
    await page.route('**/api/shop/image-search', route => route.fulfill({ json: result }))
    let voting = 0
    await page.route(`**/image-search/history/${searchId}/votes`, route => {
      voting++
      return route.fulfill(voting === 1 ? { status: 503, json: { detail: '평가 저장 실패' } } : { json: route.request().postDataJSON() })
    })
    await page.goto('/shop?sex=male')
    await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
    await upload(page, 'drop'); await modal.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('male')
    await modal.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
    const like = modal.getByRole('button', { name: `${candidate.name} 좋아요`, exact: true })
    await like.click(); await expect(modal.getByRole('alert')).toContainText('평가 저장 실패'); await expect(like).toHaveAttribute('aria-pressed', 'false')
    await like.click(); await expect(like).toHaveAttribute('aria-pressed', 'true'); await expect(like).toBeEnabled()
    await modal.getByRole('button', { name: `${candidate.name} 싫어요`, exact: true }).click()
    await expect(like).toHaveAttribute('aria-pressed', 'false')
    for (const item of [hair, candidate]) await modal.getByRole('button', { name: `${item.name} 선택`, exact: true }).click()
    await modal.getByRole('button', { name: '해당 의상 즐겨찾기 등록', exact: true }).click()
    await expect(modal.getByText('선택한 의상을 즐겨찾기에 등록했습니다.')).toBeVisible()
    await modal.getByRole('button', { name: '해당 의상 즐겨찾기 등록', exact: true }).click()
    await expect(modal.getByRole('button', { name: '해당 의상 즐겨찾기 등록', exact: true })).toBeEnabled()
    expect(requests.filter(path => path === '/api/shop/favorites/200')).toHaveLength(1)
    expect(requests.filter(path => path === '/api/shop/favorites/220')).toHaveLength(1)
    await modal.getByRole('button', { name: '해당 의상 입어보기', exact: true }).click()
    await expect(modal).not.toBeVisible()
    const restore = page.getByRole('button', { name: /이미지 검색 다시 열기/ })
    await expect(restore).toBeVisible()
    await expect(page.getByRole('dialog', { name: '의상 미리보기', exact: true })).toBeVisible()
    await expect(page.locator('.shop-selected-outfit, .shop-panel').getByText(candidate.name, { exact: true }).first()).toHaveCount(1)
    await restore.click()
    for (const item of [hair, candidate]) await expect(modal.getByRole('button', { name: `${item.name} 선택`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(modal.getByRole('button', { name: `${candidate.name} 싫어요`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await modal.getByRole('button', { name: '이미지 검색 닫기', exact: true }).click()
    await expect(restore).toHaveCount(0)
  })
}
test('search continues while minimized and restores completed results', async ({ page }) => {
  await setup(page, { admin: false })
  let release
  await page.route('**/api/shop/image-search', async route => { await new Promise(resolve => { release = resolve }); return route.fulfill({ json: result }) })
  await page.goto('/shop?sex=male'); await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
  await upload(page); await page.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('male')
  await page.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click(); await expect.poll(() => !!release).toBe(true)
  await page.getByRole('button', { name: '이미지 검색 최소화', exact: true }).click()
  await expect(page.getByRole('button', { name: /이미지 검색 다시 열기.*검색 중/ })).toBeVisible()
  release(); await page.getByRole('button', { name: /이미지 검색 다시 열기.*결과 보기/ }).click()
  await expect(page.getByRole('button', { name: `${candidate.name} 선택`, exact: true })).toBeVisible()
})
