import { expect, test } from '@playwright/test'

const user = { id: 7, nickname: 'Tester', provider: 'google', onboarded: true }
const categoryBase = {
  is_public: true,
  owner_id: 8,
  owner_nickname: 'Owner',
  song_count: 1,
  is_owner: false,
  is_subscribed: false,
  my_role: 'guest',
  can_edit: false,
  can_manage: false,
  can_add_songs: false,
  can_delete_songs: false,
  allow_contributions: false,
  allow_edits: false,
}

const publicCategory = { ...categoryBase, id: 2, name: '공개 목록', category_code: 'ABCD-EFGH', created_at: '2026-09-02T00:00:00Z' }
const myCategory = { ...categoryBase, id: 1, name: '내 목록', category_code: 'JKLM-NPQR', created_at: '2026-09-03T00:00:00Z', is_public: false, owner_id: 7, is_owner: true, my_role: 'owner', can_edit: true, can_manage: true, can_add_songs: true, can_delete_songs: true }
const subscribedCategory = { ...categoryBase, id: 3, name: '구독 목록', category_code: 'STUV-WXYZ', created_at: '2026-09-01T00:00:00Z', is_public: false, is_subscribed: true, my_role: 'viewer' }

async function mockCategoryApi(page, onCreate = () => {}) {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let data = []

    if (path === '/api/auth/me') data = { user }
    else if (path === '/api/auth/admin-status') data = { is_admin: false }
    else if (path === '/api/songs') data = []
    else if (path === '/api/meta') data = { total_count: 0, level_min: 0.5, level_max: 12, bpm_min: 40, bpm_max: 300, top_artists: [] }
    else if (path === '/api/users/me/flags') data = { favorites: [], played: [], played_all: [] }
    else if (path === '/api/personal-categories/filters') data = []
    else if (path === '/api/personal-categories/public') data = [publicCategory]
    else if (path === '/api/me/personal-categories') data = [myCategory]
    else if (path === '/api/me/personal-category-subscriptions') data = [publicCategory, subscribedCategory]
    else if (path === '/api/me/personal-categories/editable') data = [myCategory]
    else if (path === '/api/personal-categories/by-code/ABCD-EFGH') {
      data = {
        category: publicCategory,
        songs: [
          { id: 11, name: 'Save Me', artist: 'Artist A', level: 8, bpm: 150, combo: 500, time: '2:00', aliases: ['세이브미'], artist_aliases: [], file_order: 2 },
          { id: 12, name: 'Other Song', artist: 'Artist B', level: 8, bpm: 160, combo: 600, time: '2:10', aliases: [], artist_aliases: [], file_order: 1 },
        ],
        members: [],
      }
    } else if (path === '/api/personal-categories' && request.method() === 'POST') {
      onCreate(request.postDataJSON())
      data = { ...myCategory, id: 9, name: '공동 목록', category_code: 'CDEF-GHJK', allow_contributions: true, allow_edits: true }
    } else if (path === '/api/analytics/pageview') data = { ok: true }

    await route.fulfill({ json: data })
  })
}

test('all categories is the default and removes duplicates across accessible tabs', async ({ page }) => {
  await mockCategoryApi(page)
  await page.goto('/personal-categories')

  await expect(page.locator('.pcat-tab.on')).toContainText('전체 카테고리')
  await expect(page.locator('.grp-card')).toHaveCount(3)
  await expect(page.getByText('공개 목록', { exact: true })).toHaveCount(1)

  await page.getByRole('button', { name: /공개 카테고리/ }).click()
  await expect(page.locator('.grp-card')).toHaveCount(1)
  await expect(page.getByText('공개 목록', { exact: true })).toBeVisible()
})

test('category songs support alias search and show difficulty icons', async ({ page }) => {
  await mockCategoryApi(page)
  await page.goto('/personal-categories/ABCD-EFGH')

  await expect(page.locator('.cat-btn svg')).toHaveCount(3)
  await page.getByRole('searchbox', { name: '카테고리 음악 검색' }).fill('세이브미')
  await expect(page.locator('.tbl-row')).toHaveCount(1)
  await expect(page.locator('.tbl-row')).toContainText('Save Me')
  await expect(page.locator('.tbl-row')).not.toContainText('Other Song')
})

test('edit permission automatically enables contribution permission on create', async ({ page }) => {
  let createBody = null
  await mockCategoryApi(page, body => { createBody = body })
  await page.goto('/personal-categories')
  await page.locator('.side').getByRole('button', { name: '카테고리 만들기' }).click()

  const modal = page.locator('.grp-modal')
  await modal.locator('input[type="text"]').fill('공동 목록')
  const contributions = modal.getByRole('switch', { name: /음악 추가를 허용합니다/ })
  const edits = modal.getByRole('switch', { name: /카테고리 편집을 허용합니다/ })
  await edits.click()
  await expect(edits).toHaveAttribute('aria-checked', 'true')
  await expect(contributions).toHaveAttribute('aria-checked', 'true')
  await expect(contributions).toBeDisabled()

  page.once('dialog', dialog => dialog.accept())
  await modal.getByRole('button', { name: '카테고리 만들기' }).click()
  await expect.poll(() => createBody).toMatchObject({
    allow_contributions: true,
    allow_edits: true,
  })
})

test('mobile category directory and song search expose the same controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCategoryApi(page)
  await page.goto('/personal-categories')

  await expect(page.locator('.pcat-tab.on')).toContainText('전체 카테고리')
  await expect(page.locator('.grp-mob-card')).toHaveCount(3)

  await page.goto('/personal-categories/ABCD-EFGH')
  await expect(page.locator('.pcat-category-icon svg')).toHaveCount(3)
  await page.getByRole('searchbox', { name: '카테고리 음악 검색' }).fill('세이브미')
  await expect(page.locator('.mob-card')).toHaveCount(1)
  await expect(page.locator('.mob-card')).toContainText('Save Me')
})
