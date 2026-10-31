import {test,expect} from '@playwright/test'
import {coupleFixture,coupleRing} from './coupleFixtures.js'
import {version,copiedShopUrl} from './shopFixtures.js'
import {watchLayout} from './layout.js'

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
