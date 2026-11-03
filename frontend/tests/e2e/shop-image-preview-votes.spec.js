import { expect, test } from '@playwright/test'
import { setup, shirt, femaleShirt, version } from './shopFixtures.js'
import { watchLayout } from './layout.js'

const id = '11111111-1111-4111-8111-111111111111'
const hair = { ...femaleShirt, id: '221', slot: 'hair', name: '선택한 미출시 머리', is_unreleased: true }
const top = { ...femaleShirt, id: '222', name: '선택한 여성 상의' }
const missing = { ...femaleShirt, id: '223', slot: 'shoes', name: '모델 없는 신발', model: null, preview_available: false }
const items = [hair, top, missing]

async function search(page) {
  await page.goto('/shop?sex=male')
  await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '이미지로 아이템 찾기' })
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 600
    c.getContext('2d').fillRect(0, 0, 300, 600)
    return c.toDataURL().split(',')[1]
  })
  await dialog.getByLabel('검색 이미지', { exact: true }).setInputFiles({ name: 'vote.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await dialog.getByRole('button', { name: '전체 이미지 사용', exact: true }).click()
  await dialog.getByLabel('검색할 캐릭터 성별', { exact: true }).selectOption('female')
  await dialog.getByRole('button', { name: '비슷한 아이템 찾기', exact: true }).click()
  for (const item of items) await dialog.getByRole('button', { name: item.name + ' 선택', exact: true }).click()
  return dialog
}

for (const width of [1440, 390]) {
  test(`preview feedback saves the visible combination and survives close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const requests = await setup(page, { admin: false, items: [shirt, ...items] })
    await page.route('**/api/shop/image-search', route => route.fulfill({ json: { search_id: id, version, sex: 'female', items, groups: items.map(item => ({ slot: item.slot, items: [item] })) } }))
    let release, calls = 0, bodies = []
    await page.route(`**/image-search/history/${id}/preview-votes`, async route => {
      calls++; const body = route.request().postDataJSON(); bodies.push(body)
      if (calls <= 2) await new Promise(resolve => { release = resolve })
      return route.fulfill(calls === 1 ? { status: 503, json: { detail: '미리보기 평가 저장 실패' } } : { json: body })
    })
    const dialog = await search(page)
    await expect(dialog.getByRole('button', { name: '선택한 의상 즐겨찾기', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: '선택한 의상 미리보기', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '의상 미리보기', exact: true })
    await expect(preview.getByText('해당 의상이 맞나요?', { exact: true })).toBeVisible()
    await expect(preview.locator('.shop-stage-status')).toBeEmpty()
    const yes = preview.getByRole('button', { name: '맞아요', exact: true }), no = preview.getByRole('button', { name: '아니에요', exact: true })
    await yes.scrollIntoViewIfNeeded()
    const watch = await watchLayout(page, ['.shop-image-preview-feedback', '.shop-image-preview-feedback-status', '.shop-image-preview-items'])
    await yes.click(); await expect.poll(() => calls).toBe(1)
    await expect(yes).toBeDisabled(); await expect(no).toBeDisabled(); await watch.expectStable()
    release(); await expect(preview.getByRole('alert')).toHaveText('미리보기 평가 저장 실패'); await expect(yes).toHaveAttribute('aria-pressed', 'false'); await watch.expectStable()
    await yes.click(); await expect.poll(() => calls).toBe(2); release()
    await expect(yes).toHaveAttribute('aria-pressed', 'true'); await expect(preview.locator('.shop-image-preview-feedback-status')).toHaveText('평가를 저장했습니다.'); await watch.expectStable(); await watch.stop()
    expect(bodies[1]).toEqual({ item_ids: [hair.id, top.id], value: 1 })
    await preview.getByRole('button', { name: '의상 미리보기 닫기', exact: true }).click()
    await dialog.getByRole('button', { name: '선택한 의상 미리보기', exact: true }).click()
    await expect(yes).toHaveAttribute('aria-pressed', 'true')
    await no.click(); await expect(no).toHaveAttribute('aria-pressed', 'true')
    await no.click(); await expect(no).toHaveAttribute('aria-pressed', 'false')
    expect(bodies.map(body => body.value)).toEqual([1, 1, -1, 0])
    expect(requests.filter(path => path.endsWith('/votes'))).toEqual([])
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: '이미지 검색 닫기', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    if (width < 800) await page.getByRole('button', { name: '아이템 현황', exact: true }).click()
    await expect(page.locator('.shop-slots').getByText(hair.name, { exact: true })).toBeVisible()
    await expect(page.locator('.shop-slots').getByText(top.name, { exact: true })).toBeVisible()
    await expect(page.locator('.shop-slots').getByText(missing.name, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '상의 착용 해제', exact: true })).toBeVisible()
  })

  test(`closing unselected results preserves the existing outfit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, { admin: false })
    await page.goto('/shop?sex=male')
    await page.getByRole('button', { name: shirt.name + ' 의상 선택', exact: true }).click()
    await page.getByRole('button', { name: '이미지로 찾기', exact: true }).click()
    await page.getByRole('button', { name: '이미지 검색 닫기', exact: true }).click()
    if (width < 800) await page.getByRole('button', { name: '아이템 현황', exact: true }).click()
    await expect(page.locator('.shop-slots').getByText(shirt.name, { exact: true })).toBeVisible()
  })
}
