import {expect,test} from '@playwright/test'
import {setup,shirt,femaleShirt,pet,version,copiedShopUrl} from './shopFixtures.js'
import {coupleFixture,coupleRing} from './coupleFixtures.js'
import {watchLayout,waitForFrames} from './layout.js'
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}})
test.beforeEach(async({page})=>{if(test.info().project.use.viewport.width<=768)await page.setViewportSize({width:390,height:900})})
const own={id:'1',name:'내캐릭터',sex:'female',ids:['201','300'],mains:[{sex:'female',slot:'top',item:femaleShirt}]}
const relation=(incoming=false,status='pending')=>({id:'41',status,incoming,requester_name:'요청사용자',character:{id:'1',name:'내캐릭터',sex:'female'},partner:{id:'80',name:'커플캐릭터',sex:'male'},url:'/myhome/partners/1'})
const peer={character:{id:'80',name:'커플캐릭터',sex:'male'},ids:['200'],mains:[{sex:'male',slot:'top',item:shirt}],thumbnail_key:'f'.repeat(24)}
async function connections(page,{initial=[],gate,homeGate,partner=peer,requested=()=>[relation()]}={}){
  let rows=initial;const calls=[]
  await page.route('**/api/shop/couples**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();calls.push({path,method,body:request.postData()?request.postDataJSON():null,relationship_id:new URL(request.url()).searchParams.get('relationship_id'),expected_status:new URL(request.url()).searchParams.get('expected_status')})
    if(method!=='GET'&&gate)await gate
    if(path.endsWith('/home')){if(homeGate)await homeGate;return route.fulfill({json:typeof partner==='function'?partner(path.split('/').at(-2)):partner})}
    if(method==='GET')return route.fulfill({json:{relationships:rows}})
    if(method==='DELETE'){rows=[];return route.fulfill({status:204})}
    if(path.endsWith('/accept')){rows=rows.map(row=>({...row,status:'accepted'}));return route.fulfill({json:{ok:true}})}
    rows=requested();return route.fulfill({status:201,json:{ok:true,status:rows[0].status}})
  })
  return{calls,getRows:()=>rows}
}
async function home(page){await page.goto('/myhome/characters/1');await expect(page.locator('[data-item-id="201"]')).toBeVisible()}

test('right aligned request controls keep geometry and URL disclosure is anchored near its button',async({page})=>{
  await setup(page,{characters:[own]});let release;const gate=new Promise(resolve=>{release=resolve});const api=await connections(page,{gate});await home(page)
  const button=page.getByRole('button',{name:'커플 등록',exact:true});await expect(button).toBeEnabled()
  const boxes=await page.locator('.shop-home-share').evaluate(node=>{const a=node.getBoundingClientRect(),b=node.querySelector('.shop-couple-controls').getBoundingClientRect();return{right:a.right,control:b.right}});expect(Math.abs(boxes.right-boxes.control)).toBeLessThan(2)
  await page.getByRole('button',{name:'내 마이홈 URL 복사',exact:true}).click();const copyDialog=page.getByRole('dialog',{name:'내 마이홈 복사',exact:true});await expect(copyDialog).toContainText('공개하고 싶지 않은 아이템은 비공개하세요.')
  const anchored=await copyDialog.boundingBox(),anchor=await page.getByRole('button',{name:'내 마이홈 URL 복사',exact:true}).boundingBox();expect(Math.abs(anchored.x-anchor.x)).toBeLessThan(30);expect(anchored.y).toBeGreaterThan(30)
  await copyDialog.getByRole('button',{name:'닫기',exact:true}).click();await button.click();const dialog=page.getByRole('dialog',{name:'커플 등록',exact:true})
  for(const node of [dialog.getByRole('heading',{name:'커플 등록',exact:true}),dialog.locator('label'),dialog.locator('.r2-couple-status')])await expect(node).toHaveCSS('text-align','left')
  await expect(dialog.locator('form>div')).toHaveCSS('justify-content','flex-end')
  await page.screenshot({path:test.info().outputPath('couple-registration-alignment.png')})
  const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-departments','.shop-grid'])
  await expect(dialog.locator('.shop-couple-url-field>span')).toHaveText('https://r2archive.com/myhome/');await expect(dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL')).toHaveValue('');await dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL').fill('https://r2archive.com/myhome/friend');await expect(dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL')).toHaveValue('friend');await dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL').fill('unused');await dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL').evaluate(node=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain','https://r2archive.com/myhome/friend');node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData}))});await expect(dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL')).toHaveValue('friend');await dialog.getByRole('button',{name:'커플 요청 보내기',exact:true}).click();await waitForFrames(page);await watcher.expectStable();release()
  await expect(page.getByRole('button',{name:'커플 요청 취소',exact:true})).toBeVisible();await watcher.expectStable();await watcher.stop()
  await page.getByRole('button',{name:'커플 요청 취소',exact:true}).click();await expect(button).toBeVisible();expect(api.getRows()).toHaveLength(0);expect(api.calls.find(call=>call.method==='POST').body.url).toBe('https://r2archive.com/myhome/friend')
})

test('incoming global request can be dismissed then accepted in myhome and broken unilaterally',async({page})=>{
  await setup(page,{characters:[own]});let release;const gate=new Promise(resolve=>{release=resolve});const api=await connections(page,{initial:[relation(true)],gate})
  await page.goto('/myhome');const dialog=page.getByRole('dialog',{name:'커플 등록 요청',exact:true});await expect(dialog).toContainText('요청사용자 사용자가 커플 등록을 요청했습니다. 수락하시겠습니까?')
  await dialog.getByRole('button',{name:'나중에',exact:true}).click();await page.waitForTimeout(1100);await expect(dialog).toHaveCount(0)
  await page.getByRole('button',{name:'내캐릭터 캐릭터 선택',exact:true}).click();await page.getByRole('button',{name:'커플 수락',exact:true}).click();await expect(dialog).toBeVisible()
  const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-grid']);await dialog.getByRole('button',{name:'수락',exact:true}).click();await waitForFrames(page);await watcher.expectStable();release()
  await expect(page.getByRole('link',{name:'커플 마이홈으로 이동',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'커플 마이홈',exact:true,includeHidden:true}).first()).toHaveAttribute('href','/myhome/partners/1');await watcher.expectStable();await watcher.stop()
  page.once('dialog',async prompt=>{expect(prompt.message()).toContain('커플을 파기');await prompt.dismiss()});await page.getByRole('button',{name:'커플 파기',exact:true}).click();await expect(page.getByRole('link',{name:'커플 마이홈으로 이동',exact:true})).toBeVisible()
  page.once('dialog',prompt=>prompt.accept());await page.getByRole('button',{name:'커플 파기',exact:true}).click();await expect(page.getByRole('button',{name:'커플 등록',exact:true})).toBeVisible();expect(api.calls.filter(call=>call.method==='DELETE'||call.path.endsWith('/accept')).every(call=>call.relationship_id==='41')).toBe(true);expect(api.calls.filter(call=>call.method==='DELETE').every(call=>call.expected_status==='accepted')).toBe(true)
})

test('same account characters register immediately from a bare ID without a consent prompt',async({page})=>{
  const other={id:'2',name:'내다른캐릭터',sex:'male',ids:['200'],mains:[{sex:'male',slot:'top',item:shirt}]},row={...relation(false,'accepted'),partner:{id:'2',name:other.name,sex:other.sex}},mirror={...row,character:row.partner,partner:row.character,url:'/myhome/partners/2',incoming:true}
  await setup(page,{characters:[own,other],items:[shirt,femaleShirt]});let release;const gate=new Promise(resolve=>{release=resolve});const api=await connections(page,{gate,requested:()=>[row,mirror]});await home(page)
  await page.getByRole('button',{name:'커플 등록',exact:true}).click();const dialog=page.getByRole('dialog',{name:'커플 등록',exact:true});await dialog.getByLabel('커플로 등록할 캐릭터의 마이홈 URL').fill('내다른캐릭터');const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-grid']);await dialog.getByRole('button',{name:'커플 요청 보내기',exact:true}).click();await waitForFrames(page);await watcher.expectStable();release()
  await expect(dialog).toHaveCount(0);await expect(page.getByRole('link',{name:'커플 마이홈으로 이동',exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'커플 등록 요청',exact:true})).toHaveCount(0);await watcher.expectStable();await watcher.stop();expect(api.calls.find(call=>call.method==='POST').body.url).toBe('https://r2archive.com/myhome/'+encodeURIComponent('내다른캐릭터'))
  await page.goto('/myhome/characters/2');await expect(page.getByRole('link',{name:'커플 마이홈으로 이동',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'커플 수락',exact:true})).toHaveCount(0)
})

test('incoming request rejection releases the character',async({page})=>{
  await setup(page,{characters:[own]});const api=await connections(page,{initial:[relation(true)]});await page.goto('/myhome');await page.getByRole('dialog',{name:'커플 등록 요청',exact:true}).getByRole('button',{name:'거절',exact:true}).click();await expect(page.getByRole('dialog',{name:'커플 등록 요청',exact:true})).toHaveCount(0);await home(page);await expect(page.getByRole('button',{name:'커플 등록',exact:true})).toBeEnabled();expect(api.getRows()).toHaveLength(0);expect(api.calls.find(call=>call.method==='DELETE').expected_status).toBe('pending')
})

test('private items and mains remain owned but disappear publicly and all three card actions never wrap',async({page})=>{
  if(test.info().project.use.viewport.width>768)await page.setViewportSize({width:1176,height:900})
  const requests=await setup(page,{characters:[own],items:[femaleShirt,pet]});await connections(page);await home(page)
  const card=page.locator('[data-item-id="201"]'),privacy=card.getByRole('button',{name:'비공개 처리',exact:true});await privacy.scrollIntoViewIfNeeded();const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-grid','.shop-card-actions'])
  if(test.info().project.use.viewport.width>768)expect((await card.boundingBox()).width).toBeGreaterThanOrEqual(240)
  await privacy.click();await expect(card.locator('.shop-private-tag')).toHaveText('비공개');await expect(card.getByRole('button',{name:'공개 처리',exact:true})).toBeVisible();await watcher.expectStable();await watcher.stop()
  expect(requests.characters()[0].private_ids).toEqual(['201']);expect(requests.characters()[0].mains[0].item.id).toBe('201')
  const positions=await card.locator('.shop-card-actions button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{y:r.y,scroll:node.scrollWidth,client:node.clientWidth}}));expect(positions).toHaveLength(3);expect(Math.max(...positions.map(p=>p.y))-Math.min(...positions.map(p=>p.y))).toBeLessThan(2);for(const p of positions)expect(p.scroll).toBeLessThanOrEqual(p.client+1)
  await page.evaluate(()=>fetch('/api/share/myhome',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'public',character_id:1})}));await page.goto('/myhome/public');await expect(page.getByRole('heading',{name:'내캐릭터의 마이홈',exact:true})).toBeVisible();await expect(page.locator('[data-item-id="201"]')).toHaveCount(0)
  const publicState=await page.evaluate(()=>fetch('/api/share/homes/public').then(r=>r.json()));expect(publicState.ids).not.toContain('201');expect(publicState.mains).toEqual([]);expect(publicState.private_ids).toBeUndefined()
  await home(page);await card.getByRole('button',{name:'공개 처리',exact:true}).click();await expect(card.locator('.shop-private-tag')).toHaveCount(0)
  if(test.info().project.use.viewport.width<=768){await page.setViewportSize({width:320,height:900});await card.scrollIntoViewIfNeeded();const bounds=await card.locator('.shop-card-actions button').evaluateAll(nodes=>nodes.map(node=>({y:node.getBoundingClientRect().y,scroll:node.scrollWidth,client:node.clientWidth})));expect(Math.max(...bounds.map(p=>p.y))-Math.min(...bounds.map(p=>p.y))).toBeLessThan(2);for(const p of bounds)expect(p.scroll).toBeLessThanOrEqual(p.client+1)}
  await page.screenshot({path:test.info().outputPath('private-item-actions.png'),fullPage:true})
})

test('aggregate privacy chooses an owner and changes only that inventory',async({page})=>{
  const requests=await setup(page,{items:[pet],characters:[{id:'1',name:'하나',sex:'female',ids:['300']},{id:'2',name:'둘',sex:'male',ids:['300']}]});await connections(page);await page.goto('/myhome/characters/all');await page.getByRole('button',{name:'여성',exact:true}).click()
  await page.getByRole('button',{name:'비공개 처리',exact:true}).click();const dialog=page.getByRole('dialog',{name:'공개 상태를 변경할 캐릭터 선택',exact:true});await expect(dialog).toContainText('현재 공개');await dialog.getByRole('button',{name:'하나 캐릭터 선택',exact:true}).click();await expect(dialog).toHaveCount(0);expect(requests.characters()[0].private_ids).toEqual(['300']);expect(requests.characters()[1].private_ids).toEqual([])
})

test('accepted partner home has live readonly inventory and its own major navigation tab',async({page})=>{
  await setup(page,{characters:[own],items:[shirt,femaleShirt]});await connections(page,{initial:[relation(false,'accepted')]});await page.route('**/api/shop/items?**',route=>new URL(route.request().url()).searchParams.has('partner_of')?route.fulfill({json:{version,items:[shirt],total:1,has_more:false,next_cursor:null}}):route.fallback());await home(page)
  if(page.viewportSize().width<=800)await page.getByRole('button',{name:'전체 메뉴 열기',exact:true}).click();await page.getByRole('link',{name:'커플 마이홈',exact:true}).click();await expect(page.getByRole('heading',{name:'커플캐릭터의 마이홈',exact:true})).toBeVisible();await expect(page.locator('[data-item-id="200"]')).toBeVisible();await expect(page.getByRole('button',{name:'내 의상에서 제거',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'비공개 처리',exact:true})).toHaveCount(0);if(page.viewportSize().width<=800)await page.getByRole('button',{name:'전체 메뉴 열기',exact:true}).click();await expect(page.getByRole('link',{name:'커플 마이홈',exact:true})).toHaveAttribute('aria-current','page');await page.getByRole('link', { name: '내 마이홈',exact:true}).click();await expect(page.getByRole('heading',{name:'내캐릭터의 마이홈',exact:true})).toBeVisible()
})

for(const sameSex of [false,true])test(`registered partner automatically loads public mains and shared snapshot stays fixed sameSex=${sameSex}`,async({page})=>{
  const alerts=[];page.on('dialog',async prompt=>{alerts.push(prompt.message());await prompt.accept()})
  const item={...(sameSex?femaleShirt:shirt),id:'202',name:'커플 메인 상의'},partner={...peer,character:{...peer.character,sex:item.sex},mains:[{sex:item.sex,slot:'top',item}]};await coupleFixture(page,{sameSex,characters:[own],extraItems:[item]});const api=await connections(page,{initial:[relation(false,'accepted')],partner});await page.goto('/shop?sex=female');await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('1');await page.getByRole('button',{name:femaleShirt.name+' 의상 선택',exact:true}).click();await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator(`[data-item-id="${sameSex?'30854':'30120'}"] .shop-card-select`).click();await page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true});await expect(dialog.locator('.shop-stage-status')).toHaveText('');await expect(dialog.getByRole('button',{name:'내 커플 의상 불러오기',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'URL 복사',exact:true}).click();const url=await copiedShopUrl(page);expect(url.searchParams.get('partner_top')).toBe('202');expect(url.searchParams.get('partnerSex')).toBe(item.sex);expect(api.calls.filter(call=>call.path.endsWith('/home'))).toHaveLength(1)
  partner.mains=[];await page.goto(url.pathname+url.search);await expect(page.getByRole('button',{name:'내 캐릭터 의상 불러오기',exact:true})).toBeVisible();await page.getByRole('button',{name:'커플 모션 시작',exact:true}).click();await expect(page.locator('.shop-stage-status')).toHaveText('');await page.getByRole('button',{name:'URL 복사',exact:true}).click();expect((await copiedShopUrl(page)).searchParams.get('partner_top')).toBe('202');expect(api.calls.filter(call=>call.path.endsWith('/home'))).toHaveLength(1)
  expect(alerts).toEqual([])
})

test('delayed incoming request appears without moving the loaded myhome controls',async({page})=>{
  await setup(page,{characters:[own]});await connections(page,{initial:[relation(true)]});let release;const gate=new Promise(resolve=>{release=resolve});await page.route('**/api/shop/couples',async route=>{await gate;await route.fallback()});await home(page)
  await expect(page.getByRole('button',{name:'커플 등록',exact:true})).toBeDisabled();const watcher=await watchLayout(page,['.shop-header','.shop-home-share','.shop-grid']);release();await expect(page.getByRole('dialog',{name:'커플 등록 요청',exact:true})).toBeVisible();await watcher.expectStable();await watcher.stop()
})

for(const selectedSex of ['female','male'])test(`multiple characters use current shop clothes and the selected character partner without changing browsed clothes sex=${selectedSex}`,async({page})=>{
  const secondTop={...(selectedSex==='female'?femaleShirt:shirt),id:'203',name:'두 번째 캐릭터 메인'},firstPartner={...shirt,id:'202',name:'첫 커플 메인'},secondPartner={...(selectedSex==='female'?shirt:femaleShirt),id:'205',name:'두 번째 커플 메인'},browsed={...(selectedSex==='female'?femaleShirt:shirt),id:'206',name:'상점에서 고른 상의'}
  const second={id:'2',name:'두번째캐릭터',sex:selectedSex,ids:['203'],mains:[{sex:selectedSex,slot:'top',item:secondTop}]},partners={'1':{...peer,mains:[{sex:'male',slot:'top',item:firstPartner}]},'2':{...peer,character:{id:'81',name:'두번째커플',sex:secondPartner.sex},mains:[{sex:secondPartner.sex,slot:'top',item:secondPartner}]}}
  await coupleFixture(page,{characters:[own,second],extraItems:[secondTop,firstPartner,secondPartner,browsed]})
  const api=await connections(page,{initial:[relation(false,'accepted'),{...relation(false,'accepted'),id:'42',character:{id:'2',name:second.name,sex:selectedSex},partner:partners['2'].character}],partner:id=>partners[id]})
  let hold=false,requested=false,release;const gate=new Promise(resolve=>{release=resolve})
  await page.route('**/api/shop/couples/2/home**',async route=>{if(hold&&new URL(route.request().url()).pathname==='/api/shop/couples/2/home'){requested=true;await gate}await route.fallback()})
  await page.goto('/shop?sex=female');await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('2');await expect(page.getByRole('button',{name:secondTop.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'상의',exact:true}).click();await page.getByRole('button',{name:browsed.name+' 의상 선택',exact:true}).click()
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator('[data-item-id="30120"] .shop-card-select').click();hold=true;await page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true});await expect.poll(()=>requested).toBe(true);await expect(dialog.locator('.shop-stage-status')).toHaveText('선택한 의상을 준비 중입니다.');const watcher=await watchLayout(page,['.shop-couple-heading','.shop-couple-viewport','.shop-couple-note']);await watcher.expectStable();release();await expect(dialog.locator('.shop-stage-status')).toHaveText('');await watcher.expectStable();await watcher.stop()
  async function copy(){await page.evaluate(()=>{window.__copiedShopUrl=''});await dialog.getByRole('button',{name:'URL 복사',exact:true}).click();return copiedShopUrl(page)}
  await expect(dialog.locator('[data-actor="primary"]')).toContainText(selectedSex==='female'?'여성':'남성');await expect(dialog.locator('[data-actor="partner"]')).toContainText(secondPartner.sex==='female'?'여성':'남성')
  const snapshot=await copy();expect(snapshot.searchParams.get('sex')).toBe(selectedSex);expect(snapshot.searchParams.get('top')).toBe('206');expect(snapshot.searchParams.get('partnerSex')).toBe(secondPartner.sex);expect(snapshot.searchParams.get('partner_top')).toBe('205')
  await dialog.getByRole('button',{name:'커플 모션 미리보기 닫기',exact:true}).click();await expect(dialog).toHaveCount(0);const panelClose=page.getByRole('button',{name:'아이템 현황 닫기',exact:true});if(await panelClose.isVisible())await panelClose.click();await page.getByRole('tab',{name:'꾸미기ㆍ펫',exact:true}).click();await page.getByRole('button',{name:'상의',exact:true}).click();await expect(page.getByRole('button',{name:browsed.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('1');await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator('[data-item-id="30120"] .shop-card-select').click();await page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click();await expect(dialog.locator('.shop-stage-status')).toHaveText('');const first=await copy();expect(first.searchParams.get('top')).toBe('201');expect(first.searchParams.get('partner_top')).toBe('202');await dialog.getByRole('button',{name:'커플 모션 미리보기 닫기',exact:true}).click()
  await page.goto(snapshot.pathname+snapshot.search);await dialog.getByRole('button',{name:'커플 모션 시작',exact:true}).click();await expect(dialog.locator('.shop-stage-status')).toHaveText('');const restored=await copy();expect(restored.searchParams.get('sex')).toBe(selectedSex);expect(restored.searchParams.get('top')).toBe('206');expect(restored.searchParams.get('partner_top')).toBe('205');expect(api.calls.filter(call=>call.path.endsWith('/home')).map(call=>call.path)).toEqual(['/api/shop/couples/2/home','/api/shop/couples/1/home'])
})

test('myhome functional panel only shows item information with top navigation and previews fresh character mains',async({page})=>{
  await page.setViewportSize({width:test.info().project.use.viewport.width<=768?390:1440,height:700});await page.emulateMedia({reducedMotion:'reduce'})
  const latest={...femaleShirt,id:'207',name:'마이홈의 최신 메인'},character={...own,ids:[...own.ids,'207',coupleRing.id]},requests=await coupleFixture(page,{characters:[character],extraItems:[latest]});await connections(page);await home(page)
  await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();const card=page.locator(`[data-item-id="${coupleRing.id}"]`);await card.scrollIntoViewIfNeeded();await card.locator('.shop-card-select').click();const panel=page.locator('.shop-panel');await expect(panel).toBeVisible();await expect(panel.getByRole('heading',{name:'아이템 정보',exact:true})).toHaveCount(1);await expect(panel.locator('.shop-slots')).toHaveCount(0);await expect(panel.locator('.shop-panel-tabs')).toHaveCount(0);await expect(panel.getByRole('button',{name:'페이지 맨 위로 이동',exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'이 아이템 URL 복사',exact:true})).toBeVisible()
  await page.route('**/api/shop/characters/1**',route=>new URL(route.request().url()).pathname==='/api/shop/characters/1'&&route.request().method()==='GET'?route.fulfill({json:{...requests.characters()[0],mains:[{sex:'female',slot:'top',item:latest}]}}):route.fallback());await panel.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true});await expect(dialog.locator('.shop-stage-status')).toHaveText('');await dialog.getByRole('button',{name:'URL 복사',exact:true}).click();expect((await copiedShopUrl(page)).searchParams.get('top')).toBe('207');await dialog.getByRole('button',{name:'커플 모션 미리보기 닫기',exact:true}).click()
  if(!await panel.isVisible())await page.getByRole('button',{name:'아이템 현황',exact:true}).click();await expect(panel.locator('.shop-slots')).toHaveCount(0);await panel.getByRole('button',{name:'페이지 맨 위로 이동',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0)
})

for(const sex of ['female','male'])test(`unsupported same sex registered partner shows a temporary dismissible notice and opposite sex counterparts sex=${sex}`,async({page})=>{
  const chosen=sex==='female'?{...femaleShirt,counterpart_id:shirt.id}:shirt,opposite=sex==='female'?shirt:femaleShirt,character={...own,sex,ids:[chosen.id],mains:[{sex,slot:'top',item:chosen}]},partner={...peer,character:{...peer.character,sex},mains:[{sex,slot:'top',item:chosen}]}
  let release,releaseMotion;const gate=new Promise(resolve=>{release=resolve}),motionGate=new Promise(resolve=>{releaseMotion=resolve}),alerts=[];page.on('dialog',async prompt=>{alerts.push(prompt.message());await prompt.accept()})
  await coupleFixture(page,{characters:[character],motionGate});const relationship={...relation(false,'accepted'),character:{...relation().character,sex},partner:{...relation().partner,sex}};const api=await connections(page,{initial:[relationship],partner,homeGate:gate});await page.goto('/shop?sex='+sex);await page.getByLabel('저장할 캐릭터',{exact:true}).selectOption('1');await expect(page.getByRole('button',{name:chosen.name+' 의상 선택',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('tab',{name:'기능성ㆍ소모품',exact:true}).click();await page.locator('[data-item-id="30120"] .shop-card-select').click();await page.getByRole('button',{name:'선택한 커플링 미리보기',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true});await expect(dialog).toBeVisible();await expect(dialog.locator('.shop-stage-status')).toHaveText('선택한 의상을 준비 중입니다.');const watcher=await watchLayout(page,['.shop-couple-heading','.shop-couple-viewport','.shop-couple-note','.shop-header','.shop-search']);await watcher.expectStable();release()
  const notice=dialog.locator('.shop-couple-fallback-notice');await expect(dialog.locator('.shop-stage-status')).toHaveText('3D 모델을 준비 중입니다.');await expect(notice).toHaveCount(0);releaseMotion();await expect(dialog.locator('.shop-stage-status')).toHaveText('');await expect(notice).toHaveText('동성 커플은 이성 커플 정보를 볼 수 없어, 동일한 이성 의상으로 대체합니다.');await expect(notice).toBeVisible();const bounds=await notice.boundingBox(),viewport=await dialog.locator('.shop-couple-viewport').boundingBox();expect(bounds.y).toBeLessThan(viewport.y+viewport.height/4);expect(bounds.x).toBeGreaterThanOrEqual(viewport.x);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.x+viewport.width);await watcher.expectStable()
  if(sex==='female'){await page.waitForTimeout(2300);await expect(notice).toBeVisible();await expect(notice).toBeHidden({timeout:4500})}else{await notice.getByRole('button',{name:'의상 대체 안내 닫기',exact:true}).click();await expect(notice).toHaveCount(0)}
  await watcher.expectStable();await expect(dialog.locator('[data-actor="partner"]')).toContainText(sex==='female'?'남성':'여성');await dialog.getByRole('button',{name:'URL 복사',exact:true}).click();const url=await copiedShopUrl(page);expect(url.searchParams.get('partnerSex')).toBe(opposite.sex);expect(url.searchParams.get('partner_top')).toBe(opposite.id);expect(url.searchParams.get('top')).toBe(chosen.id);await watcher.expectStable();await watcher.stop();expect(alerts).toEqual([])
  await page.goto(url.pathname+url.search);await page.getByRole('button',{name:'커플 모션 시작',exact:true}).click();await expect(page.locator('.shop-stage-status')).toHaveText('');await expect(notice).toHaveCount(0);expect(alerts).toHaveLength(0);expect(api.calls.filter(call=>call.path.endsWith('/home'))).toHaveLength(1)
})
