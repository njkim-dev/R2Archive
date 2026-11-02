import { expect, test } from '@playwright/test'
import { setup, shirt, version, root, hash, png } from './shopFixtures.js'
import { watchLayout } from './layout.js'
const id = '11111111-1111-4111-8111-111111111111'
const candidate = { ...shirt, thumbnail: `${root}/thumbnails/${hash}.webp` }
const correct = { ...candidate, id: '999', name: '후보 밖 정답 상의' }
const region = { bbox_xyxy: [100, 200, 900, 600], polygon_xy: [[100, 200], [900, 200], [900, 600], [100, 600]] }
const record = { id, user_id: 1, created_at: '2026-11-03T00:00:00Z', status: 'completed', sex: 'male', slot: 'top', catalog_revision: version, model: 'test-model', pipeline_version: 'v1', image_width: 300, image_height: 600, image_bytes: 1000, original_filename: 'sample.png', review_status: 'pending', review_version: 0, review_labels: {}, review_notes: '', likes: 0, dislikes: 1, image_url: `/api/shop/image-search/admin/history/${id}/image`, result: { groups: [{ slot: 'top', items: [candidate] }] }, votes: [{ slot: 'top', item_id: '200', value: -1 }], diagnostics: { localization: { top: region } }, actions: [], reviews: [] }
const listing = { items: [record], stats: { total: 1, pending: 1, approved: 0, examples: 0, image_bytes: 1000 }, has_more: false }
for (const loggedIn of [false, true]) test(`admin history is not requested by ${loggedIn ? 'members' : 'guests'}`, async ({ page }) => {
  const requests = await setup(page, { loggedIn, admin: false })
  await page.goto('/shop/admin')
  await expect(page.getByText('관리자만 이용할 수 있습니다.')).toBeVisible()
  expect(requests.filter(path => path.startsWith('/api/shop/image-search/admin'))).toEqual([])
})
for (const width of [1440, 390]) test(`admin correction outside shortlist, approval, exclusion and deletion at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await setup(page, { admin: true, items: [candidate, correct] })
  let releaseList, releaseDetail, firstList = true, firstDetail = true, reviews = [], deleted = false
  await page.route('**/api/shop/image-search/admin/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/image')) return route.fulfill({ body: png, contentType: 'image/png' })
    if (path.endsWith('/history')) {
      if (firstList) { firstList = false; await new Promise(resolve => { releaseList = resolve }) }
      return route.fulfill({ json: { ...listing, items: deleted ? [] : [record] } })
    }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(); reviews.push(body)
      return route.fulfill({ json: { status: body.decision, review_version: body.expected_version + 1, examples: body.decision === 'approved' ? 1 : 0, generation: reviews.length } })
    }
    if (route.request().method() === 'DELETE') { deleted = true; return route.fulfill({ json: { deleted: true } }) }
    if (firstDetail) { firstDetail = false; await new Promise(resolve => { releaseDetail = resolve }) }
    return route.fulfill({ json: record })
  })
  await page.goto('/shop/admin')
  await expect.poll(() => !!releaseList).toBe(true)
  const watch = await watchLayout(page, ['.shop-admin-filters', '.shop-admin-list-status', '.shop-admin-layout', '.shop-admin-history-list', '.shop-admin-detail'])
  await watch.expectStable(); releaseList()
  const row = page.locator('.shop-admin-history-row').first()
  await expect(row).toBeVisible(); await watch.expectStable()
  await row.click(); await expect.poll(() => !!releaseDetail).toBe(true); await watch.expectStable()
  releaseDetail(); await expect(page.getByRole('button', { name: '승인', exact: true })).toBeDisabled(); await watch.expectStable(); await watch.stop()
  await expect(page.getByText('사용자 싫어요', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '상의 정답 아이템 검색', exact: true }).fill(correct.name)
  await page.getByRole('button', { name: `${correct.name} · #${correct.id}`, exact: true }).click()
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '승인', exact: true }).click()
  await expect(page.getByText('승인했습니다. 1개 부위가 검색 자료에 반영됐습니다.')).toBeVisible()
  expect(reviews[0]).toMatchObject({ decision: 'approved', expected_version: 0, labels: { top: { item_id: '999', region } } })
  await page.getByRole('button', { name: '학습 제외', exact: true }).click()
  await expect(page.getByText('검색 자료에서 제외했습니다.')).toBeVisible()
  expect(reviews[1]).toMatchObject({ decision: 'excluded', expected_version: 1 })
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '기록과 원본 삭제', exact: true }).click()
  await expect(page.getByText('표시할 검색 기록이 없습니다.')).toBeVisible()
})
