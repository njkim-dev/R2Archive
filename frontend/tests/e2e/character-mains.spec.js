import {expect,test} from '@playwright/test'
import {setup,shirt,femaleShirt,pet} from './shopFixtures.js'
import {coupleFixture} from './coupleFixtures.js'
import {watchLayout} from './layout.js'

test.beforeEach(async({page})=>{if(test.info().project.use.viewport.width<=768)await page.setViewportSize({width:390,height:900})})
const female={id:'1',name:'여성캐릭터',sex:'female',ids:['201','202'],mains:[{sex:'female',slot:'top',item:femaleShirt}]}

test('unsetting a main keeps owned items through pending failure retry reload and further saves',async({page})=>{
  const other={...femaleShirt,id:'202',name:'다른 상의'},newItem={...femaleShirt,id:'203',name:'추가 상의'},requests=await setup(page,{characters:[female],items:[femaleShirt,other,newItem]})
  let release,requested=false,first=true;const gate=new Promise(resolve=>{release=resolve})
  await page.route('**/api/shop/characters/1/mains/201**',async route=>{if(route.request().method()==='DELETE'&&first){first=false;requested=true;await gate;return route.fulfill({status:409,json:{detail:'해제를 다시 시도해주세요.'}})}await route.fallback()})
  await page.goto('/myhome/characters/1');const card=page.locator('[data-item-id="201"]'),choose=card.locator('.shop-card-select');await expect(choose).toHaveAttribute('aria-pressed','true');await choose.scrollIntoViewIfNeeded()
  const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-grid']);await choose.click();await expect.poll(()=>requested).toBe(true);await expect(choose).toHaveAttribute('aria-pressed','true');await watcher.expectStable();release();await expect(page.locator('.shop-feedback [role="alert"]')).toHaveText('해제를 다시 시도해주세요.');await expect(choose).toHaveAttribute('aria-pressed','true');await watcher.expectStable()
  await choose.click();await expect(choose).toHaveAttribute('aria-pressed','false');await expect(card.locator('.shop-main-tag')).toHaveCount(0);await expect(card.locator('.shop-owned-tag')).toBeVisible();await watcher.expectStable();await watcher.stop();expect(requests.characters()[0].ids).toEqual(['201','202']);expect(requests.characters()[0].mains).toEqual([])
  await page.reload();await expect(choose).toHaveAttribute('aria-pressed','false');await page.goto('/shop?sex=female');await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('1');await page.locator('[data-item-id="203"]').getByRole('button',{name:'내 의상으로 저장',exact:true}).click();await expect(page.locator('[data-item-id="203"] .shop-owned-tag')).toBeVisible();expect(requests.characters()[0].mains).toEqual([])
  await page.goto('/myhome/characters/1');await choose.click();await expect(choose).toHaveAttribute('aria-pressed','true');await page.locator('[data-item-id="202"] .shop-card-select').click();await expect(page.locator('[data-item-id="202"] .shop-main-tag')).toBeVisible();expect(requests.characters()[0].ids).toEqual(['201','202','203'])
})

test('choosing a storage character applies its sex and full mains after loading and clears non-main slots',async({page})=>{
  const maleTop={...shirt,id:'203',name:'남성 메인'},custom={...femaleShirt,id:'206',name:'임시 상의'},male={id:'2',name:'남성캐릭터',sex:'male',ids:['203'],mains:[{sex:'male',slot:'top',item:maleTop}]}
  await setup(page,{characters:[female,male,{id:'3',name:'빈 캐릭터',sex:'female',ids:[],mains:[]}],items:[femaleShirt,maleTop,custom,pet]})
  let release,requested=false;const gate=new Promise(resolve=>{release=resolve});await page.route('**/api/shop/characters/2**',async route=>{requested=true;await gate;await route.fallback()})
  await page.goto('/shop?sex=female');await page.getByRole('button',{name:custom.name+' 의상 선택',exact:true}).click();await page.getByRole('button',{name:pet.name+' 의상 선택',exact:true}).click()
  const watcher=await watchLayout(page,['.shop-header','.shop-departments','.shop-gender-row','.shop-grid']);await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('2');await expect.poll(()=>requested).toBe(true);await expect(page.getByRole('button',{name:'여성',exact:true})).toHaveAttribute('aria-pressed','true');await watcher.expectStable();release();await expect(page.getByRole('button',{name:'남성',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:maleTop.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:pet.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','false');await watcher.expectStable();await watcher.stop()
  await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('1');await expect(page.getByRole('button',{name:femaleShirt.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:custom.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','false');await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('3');await expect(page.locator('.shop-card-select[aria-pressed="true"]')).toHaveCount(0)
})

test('myhome item information omits descriptions while shop descriptions remain',async({page})=>{
  await coupleFixture(page,{characters:[{...female,ids:['30120'],mains:[]}]});await page.goto('/myhome/characters/1');await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator('[data-item-id="30120"] .shop-card-select').click()
  const info=page.locator('.shop-detail');await expect(info).toBeVisible();await expect(info.locator('.shop-description')).toHaveCount(0);await expect(info.getByRole('heading',{name:'아이템 설명',exact:true})).toHaveCount(0);await expect(info.getByRole('button',{name:'선택한 커플링 미리보기',exact:true})).toBeVisible();await expect(info.getByRole('button',{name:'이 아이템 URL 복사',exact:true})).toBeVisible()
  await page.goto('/shop?sex=female');await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator('[data-item-id="30120"] .shop-card-select').click();await expect(info.locator('.shop-description')).toBeVisible()
})
