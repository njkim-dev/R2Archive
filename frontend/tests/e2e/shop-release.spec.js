import {readFileSync} from 'node:fs'
import {expect,test} from '@playwright/test'
import {setup,shirt,version,copiedShopUrl} from './shopFixtures.js'
import {watchLayout} from './layout.js'

const release=JSON.parse(readFileSync(new URL('../fixtures/shop-release-2026-11-12.json',import.meta.url),'utf8'))
const items=release.map(row=>({...row,id:String(row.id),version,model:row.preview_available?shirt.model:null,thumbnail:null,description:'',counterpart_id:row.counterpart_id?String(row.counterpart_id):null}))
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}})

for(const sex of ['male','female'])test(`November release keeps NEW prices paired filtering selection and sharing stable sex=${sex}`,async({page})=>{
  const mobile=test.info().project.use.viewport.width<=768;if(mobile)await page.setViewportSize({width:390,height:900})
  await setup(page,{items,loggedIn:false});let releaseSearch,requested=false;const gate=new Promise(resolve=>{releaseSearch=resolve})
  await page.route('**/api/shop/items?**',async route=>{if(new URL(route.request().url()).searchParams.get('q')==='흑요황궁'){requested=true;await gate}await route.fallback()})
  await page.goto('/shop?sex='+sex);await expect(page.locator('.shop-card').first()).toBeVisible();const watcher=await watchLayout(page,['.shop-header','.shop-search','.shop-departments'])
  await page.getByRole('searchbox',{name:'아이템 이름으로 검색',exact:true}).fill('흑요황궁');await expect.poll(()=>requested).toBe(true);await watcher.expectStable();releaseSearch()
  await expect(page.locator('.shop-card')).toHaveCount(4);await watcher.expectStable();await watcher.stop();await page.getByRole('checkbox',{name:'남녀 모두 존재하는 의상만',exact:true}).check();await expect(page.locator('.shop-card')).toHaveCount(4)
  const selected=items.filter(row=>row.sex===sex&&row.name.startsWith('흑요황궁'));for(const row of selected){const card=page.locator(`[data-item-id="${row.id}"]`);await expect(card.locator('.shop-new-tag')).toHaveText('NEW');await expect(card.locator('.shop-card-price')).toContainText('9,600')}
  const hair=selected.find(row=>row.slot==='hair'),top=selected.find(row=>row.slot==='top');await page.locator(`[data-item-id="${hair.id}"] .shop-card-select`).click();await page.locator(`[data-item-id="${top.id}"] .shop-card-select`).click();if(mobile)await page.getByRole('button',{name:'아이템 현황',exact:true}).click();await page.locator('.shop-panel').getByRole('button',{name:'선택한 아이템으로 미리보기',exact:true}).click()
  const preview=page.locator('.shop-outfit-dialog');await expect(preview).toBeVisible();await expect(preview.locator('.shop-stage-status')).toHaveText('');await preview.getByRole('button',{name:'의상 URL 복사',exact:true}).click();const url=await copiedShopUrl(page);expect(url.searchParams.get('sex')).toBe(sex);expect(url.searchParams.get('hair')).toBe(hair.id);expect(url.searchParams.get('top')).toBe(top.id)
})
