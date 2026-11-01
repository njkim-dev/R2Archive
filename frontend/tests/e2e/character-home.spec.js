import { expect,test } from '@playwright/test'
import { watchLayout } from './layout.js'
import { setup,shirt,femaleShirt,pet,hero,version,copiedShopUrl } from './shopFixtures.js'
import { coupleFixture } from './coupleFixtures.js'

test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}})
async function viewport(page){await page.setViewportSize({width:test.info().project.use.viewport.width<=768?390:1440,height:1000})}

test('character cards keep three columns creation order limit17 delete confirmation and static thumbnail layout',async({page})=>{
  await viewport(page)
  const entries=Array.from({length:17},(_,i)=>({id:String(i+1),name:'캐릭터'+(i+1),sex:i%2?'female':'male'})),requests=await setup(page,{characters:entries})
  let release;const gate=new Promise(resolve=>{release=resolve})
  await page.route('**/api/shop/characters?**',async route=>{await gate;return route.fallback()})
  await page.goto('/myhome');await expect(page.getByRole('button',{name:'모든 캐릭터 표시',exact:true})).toBeVisible()
  const watcher=await watchLayout(page,['.shop-header','.shop-character-home h1','.shop-character-special:first-child'])
  release();await expect(page.locator('.shop-character-card')).toHaveCount(17);await watcher.expectStable();await watcher.stop()
  await expect(page.getByRole('button',{name:'새 캐릭터 추가',exact:true})).toHaveCount(0)
  const boxes=await page.locator('.shop-character-cards>*').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width}}))
  expect(boxes).toHaveLength(18);expect(boxes[0].y).toBe(boxes[2].y);expect(boxes[3].y).toBeGreaterThan(boxes[0].y)
  await page.screenshot({path:test.info().outputPath('character-cards.png'),fullPage:true})
  const remove=page.getByRole('button',{name:'캐릭터1 캐릭터 삭제',exact:true})
  page.once('dialog',async dialog=>{expect(dialog.message()).toBe('해당 캐릭터의 모든 데이터가 삭제되며 복구가 불가능합니다. 정말 삭제하시겠습니까?');await dialog.dismiss()})
  await remove.click();expect(requests.characters()).toHaveLength(17)
  page.once('dialog',dialog=>dialog.accept());await remove.click();await expect(page.locator('.shop-character-card')).toHaveCount(16)
  await page.getByRole('button',{name:'새 캐릭터 추가',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'새 캐릭터 추가',exact:true});await expect(dialog.getByLabel('캐릭터 이름')).toHaveCount(0)
  await dialog.getByRole('button',{name:'여성',exact:true}).click();await dialog.getByLabel('캐릭터 이름').fill('새캐릭터');await dialog.getByRole('button',{name:'캐릭터 만들기',exact:true}).click()
  await expect(page.getByRole('heading',{name:'새캐릭터의 마이홈',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'여성',exact:true})).toBeDisabled()
  await page.getByRole('link',{name:'← 캐릭터 목록',exact:true}).click();await expect(page.locator('.shop-character-card')).toHaveCount(17)
  const image=page.getByRole('button',{name:'새캐릭터 캐릭터 선택',exact:true}).locator('img')
  await expect(image).toBeVisible({timeout:20000})
  await image.scrollIntoViewIfNeeded()
  await expect.poll(()=>image.evaluate(node=>node.naturalWidth)).toBeGreaterThanOrEqual(256)
  expect(await image.evaluate(node=>{const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;const context=canvas.getContext('2d');context.drawImage(node,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;return new Set(Array.from({length:pixels.length/4},(_,i)=>pixels.slice(i*4,i*4+4).join(','))).size})).toBeGreaterThan(1)
  await expect(page.locator('.shop-thumbnail-renderer canvas')).toHaveCount(0)
})

test('saving without a character opens creation and stores the first item as that characters main',async({page})=>{
  await viewport(page);const requests=await setup(page,{characters:[],items:[femaleShirt]});await page.goto('/shop?sex=female')
  await page.getByRole('button',{name:'내 의상으로 저장',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'새 캐릭터 추가',exact:true});await dialog.getByRole('button',{name:'여성',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'남성',exact:true})).toBeDisabled()
  await dialog.getByLabel('캐릭터 이름').fill('내캐릭터');await dialog.getByRole('button',{name:'캐릭터 만들기',exact:true}).click()
  await expect(dialog).toHaveCount(0);await expect(page.locator('.shop-owned-tag')).toHaveText('내 아이템')
  expect(requests.characters()[0].mains[0].item.id).toBe('201')
  await page.goto('/myhome/characters/1');await expect(page.getByRole('button',{name:'남성',exact:true})).toBeDisabled();await expect(page.locator('.shop-slots')).toContainText(femaleShirt.name)
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await expect(page.getByRole('button',{name:'커플링',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'단짝링',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'버프아이템',exact:true})).toHaveCount(0)
})

test('all characters deduplicates shared items and reports every owning character without a public home copy',async({page})=>{
  const names=['하나','둘',...Array.from({length:15},(_,i)=>'Owner'+String(i+3).padStart(15,'0'))],alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept()})
  await viewport(page);await setup(page,{items:[pet],characters:names.map((name,i)=>({id:String(i+1),name,sex:i%2?'male':'female',ids:['300']}))})
  await page.goto('/myhome/characters/all');await page.getByRole('button',{name:'여성',exact:true}).click();const card=page.locator('[data-item-id="300"]');await expect(card).toBeVisible()
  await expect(page.locator('.shop-card')).toHaveCount(1);await card.hover();await expect(card.getByRole('note')).toHaveCount(0);await expect(card).not.toHaveAttribute('title',/.+/);await expect(card).not.toContainText('하나')
  const info=card.locator('.shop-owner-info');await expect(info).toHaveAttribute('title',names.join('ㆍ'));await info.hover();await info.focus();await expect(info).toBeFocused();await info.click();expect(alerts).toEqual([]);await expect(card.locator('.shop-card-select')).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button',{name:'내 마이홈 URL 복사',exact:true})).toHaveCount(0)
  await card.getByRole('button',{name:'내 의상에서 제거',exact:true}).click();await page.getByRole('button',{name:'하나 캐릭터 선택',exact:true}).click()
  await expect(card).toBeVisible();await expect(info).toHaveAttribute('title',names.slice(1).join('ㆍ'));await expect(card.getByRole('note')).toHaveCount(0)
})

test('public ID all remains available without colliding with the private aggregate route',async({page})=>{
  await setup(page,{characters:[{id:'1',name:'공개캐릭터',sex:'female',ids:['201'],mains:[{sex:'female',slot:'top',item:femaleShirt}]}]})
  await page.goto('/myhome')
  await page.evaluate(()=>fetch('/api/share/myhome',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'all',character_id:1})}))
  await page.goto('/myhome/all')
  await expect(page.getByRole('heading',{name:'공개캐릭터님의 마이홈',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'여성',exact:true})).toBeDisabled()
  await expect(page.locator('[data-item-id="201"]')).toBeVisible()
})

test('unreleased couple and best friend rings use the default hide filter and can be saved without mains',async({page})=>{
  await viewport(page);const ring={...hero,id:'30890',category:'507',group:'couple',name:'미출시 커플링',is_unreleased:true,is_new:true},friend={...ring,id:'1200088',category:'508',group:'friend',name:'미출시 단짝링'}
  const requests=await setup(page,{items:[ring,friend]});await page.goto('/shop?sex=female');await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click()
  await expect(page.getByRole('checkbox',{name:'미출시 아이템 가리기',exact:true})).toBeChecked();await expect(page.locator('.shop-card')).toHaveCount(0)
  await page.getByRole('checkbox',{name:'미출시 아이템 가리기',exact:true}).uncheck();await expect(page.locator('.shop-card')).toHaveCount(2)
  await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('2');const card=page.locator('[data-item-id="30890"]');await expect(card.locator('.shop-unreleased-tag')).toHaveText('미출시');await expect(card.locator('.shop-card-price')).toHaveText('');await expect(card.locator('.shop-new-tag')).toHaveCount(0)
  await card.getByRole('button',{name:'내 의상으로 저장',exact:true}).click();await expect(card.locator('.shop-owned-tag')).toBeVisible()
  expect(requests.characters().find(entry=>entry.character.id==='2').mains).toEqual([])
})

async function openNormalCouple(page,sex,id){
  await page.goto('/shop?sex='+sex);await page.getByRole('button',{name:(sex==='female'?femaleShirt:shirt).name+' 의상 선택',exact:true}).click()
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator(`[data-item-id="${id}"] .shop-card-select`).click();await page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true}).locator('.shop-stage-status')).toHaveText('')
}
for(const sex of ['male','female'])test(`same-sex ${sex} couple imports native roles and snapshots both outfits independently from later mains`,async({page})=>{
  await viewport(page);const original=sex==='female'?femaleShirt:shirt,other={...original,id:'202',name:'친구 의상'},entry={id:'1',name:'친구캐릭터',sex,ids:[original.id,'202'],mains:[{sex,slot:'top',item:other}]}
  await coupleFixture(page,{sameSex:true,characters:[entry],extraItems:[other]});await openNormalCouple(page,sex,'30854')
  await page.evaluate(()=>fetch('/api/share/myhome',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'friend',character_id:1})}))
  await page.getByRole('button',{name:'내 커플 의상 불러오기',exact:true}).click();const importer=page.getByRole('dialog',{name:'내 커플 의상 불러오기',exact:true})
  await importer.getByLabel('친구 캐릭터의 마이홈 URL').fill('https://r2archive.com/myhome/friend');await importer.getByRole('button',{name:'의상 불러오기',exact:true}).click();await expect(importer).toHaveCount(0)
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true});await expect(dialog.locator('.shop-stage-status')).toHaveText('');await expect(dialog.locator('.shop-character-labels span')).toHaveCount(2)
  await expect(dialog.locator('.shop-character-labels span').nth(1)).toContainText(sex==='female'?'여성':'남성');await expect.poll(()=>dialog.locator('canvas').getAttribute('data-motion-frame')).not.toBeNull()
  await dialog.getByRole('button',{name:'URL 복사',exact:true}).click();const url=await copiedShopUrl(page);expect(url.searchParams.get('partnerSex')).toBe(sex);expect(url.searchParams.get('partner_top')).toBe('202')
  await page.evaluate(id=>fetch('/api/shop/characters/1/mains/'+id,{method:'PUT'}),original.id)
  await page.goto(url.pathname+url.search);await expect(page.getByRole('button',{name:'내 캐릭터 의상 불러오기',exact:true})).toBeVisible();await page.getByRole('button',{name:'커플 모션 시작',exact:true}).click()
  await expect(page.locator('.shop-stage-status')).toHaveText('');await page.getByRole('button',{name:'URL 복사',exact:true}).click();expect((await copiedShopUrl(page)).searchParams.get('partner_top')).toBe('202')
  await page.getByRole('button',{name:'내 캐릭터 의상 불러오기',exact:true}).click();await page.getByRole('button',{name:'친구캐릭터 캐릭터 선택',exact:true}).click();await expect(page.getByRole('dialog',{name:'내 캐릭터 의상 불러오기',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'URL 복사',exact:true}).click();expect((await copiedShopUrl(page)).searchParams.get('partner_top')).toBe(original.id)
})

test('unsupported same-sex import alerts without changing the partner and shared guests cannot import owned characters',async({page})=>{
  await viewport(page);await coupleFixture(page,{characters:[{id:'1',name:'친구',sex:'female',ids:['201'],mains:[{sex:'female',slot:'top',item:femaleShirt}]}]});await openNormalCouple(page,'female','30120')
  await page.evaluate(()=>fetch('/api/share/myhome',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'friend',character_id:1})}))
  await page.getByRole('button',{name:'내 커플 의상 불러오기',exact:true}).click();const importer=page.getByRole('dialog',{name:'내 커플 의상 불러오기',exact:true});await importer.getByLabel('친구 캐릭터의 마이홈 URL').fill('https://r2archive.com/myhome/friend')
  page.once('dialog',async alert=>{expect(alert.message()).toBe('동성 커플이 불가능한 반지입니다.');await alert.accept()});await importer.getByRole('button',{name:'의상 불러오기',exact:true}).click();await importer.getByRole('button',{name:'닫기',exact:true}).click()
  await expect(page.locator('.shop-character-labels [data-actor="partner"]')).toContainText('남성')
  await page.getByRole('button',{name:'URL 복사',exact:true}).click();const url=await copiedShopUrl(page)
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user:null}}));await page.goto(url.pathname+url.search)
  const button=page.getByRole('button',{name:'내 캐릭터 의상 불러오기',exact:true});await expect(button).toBeDisabled();await expect(button).toHaveAttribute('title','로그인이 필요합니다.')
})
