import {test,expect} from '@playwright/test'
import {coupleFixture,coupleRing,coupleRoot} from './coupleFixtures.js'
import {version,copiedShopUrl,openShopFilters,mesh,root,setup,femaleShirt} from './shopFixtures.js'
import {watchLayout} from './layout.js'

test('recovered clothes stay in the available list and their shared preview loads without moving the viewer', async ({ page }) => {
  const width = test.info().project.use.viewport.width <= 768 ? 390 : 1440
  await page.setViewportSize({ width, height: 1000 })
  const recovered = { ...femaleShirt, id: '80320118', name: '네온 스트리트 상의(여)', model: `${root}/models/${'f'.repeat(64)}.json.gz` }
  const missing = { ...femaleShirt, id: '80320120', model: null, preview_available: false }
  await setup(page, { loggedIn: false, items: [recovered, missing] })
  let releaseModel, modelRequested
  const gate = new Promise(resolve => { releaseModel = resolve })
  const pending = new Promise(resolve => { modelRequested = resolve })
  await page.route(`**${recovered.model}`, async route => {
    modelRequested()
    await gate
    return route.fallback()
  })
  await page.goto(`/shop?v=${version}&sex=female`)
  await expect(page.getByRole('button', { name: `${recovered.name} 의상 선택`, exact: true })).toBeVisible()
  await expect(page.locator(`[data-item-id="${missing.id}"]`)).toHaveCount(0)
  await page.goto(`/shop?v=${version}&view=preview&sex=female&top=${recovered.id}`)
  await pending
  const dialog = page.getByRole('dialog', { name: '의상 미리보기', exact: true })
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const layout = await watchLayout(page, ['.shop-header', '.shop-outfit-dialog .shop-couple-heading', '.shop-outfit-dialog .shop-stage'])
  await layout.expectStable()
  releaseModel()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await layout.expectStable()
  await layout.stop()
  await expect(page.locator('.shop-slots')).toContainText(recovered.name)
})

test('the released ring remains the only exact match when unreleased items are included', async ({page}) => {
  await page.setViewportSize({width:test.info().project.use.viewport.width<=768?390:1440,height:1000})
  const ring = {...coupleRing,id:'30850',name:'부자의 꿈2(공용)'}
  await coupleFixture(page,{loggedIn:false,extraItems:[ring]})
  let release, received
  const pending = new Promise(resolve => {received = resolve})
  const gate = new Promise(resolve => {release = resolve})
  await page.route('**/api/shop/items?*',async route => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('include_unreleased')==='true' && params.get('q')===ring.name) {
      received()
      await gate
    }
    await route.fallback()
  })
  await page.goto(`/shop?v=${version}`)
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click()
  await page.getByRole('button',{name:'커플링',exact:true}).click()
  await page.getByRole('searchbox',{name:'아이템 이름으로 검색'}).fill(ring.name)
  await expect(page.locator('.shop-list-status')).toHaveText('아이템 1개')
  await openShopFilters(page)
  const layout = await watchLayout(page,['.shop-search-tools','.shop-filters','.shop-list-status'])
  await page.getByRole('checkbox',{name:'미출시 아이템 가리기',exact:true}).uncheck()
  await pending
  await layout.expectStable()
  release()
  await expect(page.locator('.shop-list-status')).toHaveText('아이템 1개')
  await expect(page.locator('[data-item-id="30850"]')).toBeVisible()
  await expect(page.locator('[data-item-id="30851"]')).toHaveCount(0)
  await layout.expectStable()
  await layout.stop()
})

test('recovered unreleased ring opens without an unavailable tag and preserves outfits and layout while loading',async({page})=>{
  await page.setViewportSize({width:test.info().project.use.viewport.width<=768?390:1440,height:1000})
  let release
  const gate=new Promise(resolve=>{release=resolve})
  const ring={...coupleRing,id:'30999',name:'복구된 미출시 커플링',is_unreleased:true}
  await coupleFixture(page,{motionGate:gate,extraItems:[ring]})
  await page.goto(`/shop?v=${version}&sex=female&top=201`)
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click()
  await page.getByRole('button',{name:'커플링',exact:true}).click()
  const card=page.locator('[data-item-id="30999"]')
  await expect(card).toHaveCount(0)
  await openShopFilters(page)
  await page.getByRole('checkbox',{name:'미출시 아이템 가리기',exact:true}).uncheck()
  await expect(card.locator('.shop-unreleased-tag')).toHaveText('미출시')
  await expect(card.locator('.shop-preview-unavailable')).toHaveCount(0)
  await page.getByRole('button',{name:ring.name+' 자세히 보기',exact:true}).click()
  const open=page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true})
  await open.scrollIntoViewIfNeeded()
  await open.click()
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true})
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const layout=await watchLayout(page,['.shop-couple-heading','.shop-couple-dialog .shop-stage','.shop-couple-note','.shop-couple-purchase-note'])
  await layout.expectStable()
  release()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(dialog.locator('canvas')).toHaveAttribute('data-motion-frame',/\d+/)
  await dialog.getByRole('button',{name:'URL 복사',exact:true}).click()
  const shared=await copiedShopUrl(page)
  expect(Object.fromEntries(shared.searchParams)).toMatchObject({view:'couple',item:'30999',sex:'female',top:'201',partnerSex:'male',partner_top:'200'})
  await layout.expectStable()
  await layout.stop()
  await dialog.getByRole('button',{name:'커플 모션 미리보기 닫기',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  expect(new URL(page.url()).searchParams.get('top')).toBe('201')
})

test('recovered couple action opens from its item and restores from its shared URL', async ({page}) => {
  const action = {...coupleRing,id:'30497',name:'커플액션-사르르댄스',category:'504',group:'emote'}
  await coupleFixture(page, {loggedIn:false,extraItems:[action]})
  await page.goto(`/shop?v=${version}&item=${action.id}`)
  await page.getByRole('button',{name:'커플액션 미리보기',exact:true}).click()
  const dialog = page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true})
  await expect(dialog.locator('canvas')).toHaveAttribute('data-motion-frame',/\d+/)
  await dialog.getByRole('button',{name:'URL 복사',exact:true}).click()
  const shared = await copiedShopUrl(page)
  expect(Object.fromEntries(shared.searchParams)).toMatchObject({view:'couple',item:action.id})
  await page.goto(shared.pathname+shared.search)
  await dialog.getByRole('button',{name:'커플 모션 시작',exact:true}).click()
  await expect(dialog.locator('canvas')).toHaveAttribute('data-motion-frame',/\d+/)
  await expect(dialog.getByText(action.name,{exact:true})).toBeVisible()
})

for(const sex of ['male','female'])test(`an old same-sex link only plays the mixed motion and hides the composition controls (${sex})`, async ({page}) => {
  let release
  const gate = new Promise(resolve => {release = resolve})
  await coupleFixture(page,{sameSex:true,loggedIn:false,motionGate:gate})
  const motionRequests = []
  page.on('request',request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith(coupleRoot)) motionRequests.push(path)
  })
  await page.goto(`/shop?v=${version}&view=couple&item=30854&sex=${sex}&partnerSex=${sex}`)
  const dialog = page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true})
  const primary = sex==='female'?'여성':'남성', partner = sex==='female'?'남성':'여성'
  await expect(dialog.locator('[data-actor="primary"]')).toContainText(primary)
  await expect(dialog.locator('[data-actor="partner"]')).toContainText(partner)
  await expect(dialog.getByRole('group',{name:'커플 조합'})).toHaveCount(0)
  const layout = await watchLayout(page,['.shop-couple-heading','.shop-couple-viewport','.shop-couple-note'])
  await dialog.getByRole('button',{name:'커플 모션 시작',exact:true}).click()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  await layout.expectStable()
  release()
  await expect(dialog.locator('canvas')).toHaveAttribute('data-motion-frame',/\d+/)
  expect(motionRequests.sort()).toEqual(['1','2'].map(digit=>coupleRoot+digit.repeat(64)+'.json.gz'))
  await layout.expectStable()
  await layout.stop()
})

test('a standalone friend effect opens without audio and its loading state keeps the layout stable', async ({page}) => {
  let release
  const gate = new Promise(resolve => {release = resolve})
  const effect = {model:root+'/models/'+'e'.repeat(64)+'.json.gz',animation:coupleRoot+'f'.repeat(64)+'.json.gz',duration:1}
  const ring = {...coupleRing,id:'1200091',name:'에메랄드',category:'508',group:'friend',couple_preview:null,effect_preview:effect}
  await coupleFixture(page,{loggedIn:false,extraItems:[ring]})
  const matrices = Array.from({length:2},() => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]).flat()
  await page.route('**'+effect.model,route => route.fulfill({json:{...mesh,texture_revision:version}}))
  await page.route('**'+effect.animation,async route => {
    await gate
    return route.fulfill({json:{schema:'shop-couple-effect-v1',frame_count:2,bounds:[[-20,20,0],[20,280,0]],meshes:[{name:'Waist',frames:matrices}]}})
  })
  await page.goto(`/shop?v=${version}&item=${ring.id}`)
  await expect(page.locator('.shop-detail .shop-preview-unavailable')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'장식 미리보기',exact:true}).click()
  const dialog = page.getByRole('dialog',{name:'장식 미리보기',exact:true})
  await expect(dialog.getByRole('img',{name:'장식 효과 3D 미리보기'})).toBeVisible()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.')
  const layout = await watchLayout(page,['.shop-effect-dialog .shop-couple-heading','.shop-effect-dialog .shop-stage','.shop-effect-controls'])
  await layout.expectStable()
  release()
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await layout.expectStable()
  await layout.stop()
  await dialog.getByRole('button',{name:'일시정지',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'재생',exact:true})).toBeVisible()
  expect(await page.evaluate(() => window.__coupleAudio.length)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})
