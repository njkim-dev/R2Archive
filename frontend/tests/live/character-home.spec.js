import {test,expect} from '@playwright/test'
test.beforeEach(async({page})=>{
  await page.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.fulfill({json:{ok:true}}))
  await page.addInitScript(()=>{
    window.__liveAudio={starts:0,stops:0}
    const Audio=window.AudioContext||window.webkitAudioContext
    if(Audio){const create=Audio.prototype.createBufferSource;Audio.prototype.createBufferSource=function(...args){const source=create.apply(this,args),start=source.start.bind(source),stop=source.stop.bind(source);source.start=(...args)=>{window.__liveAudio.starts++;return start(...args)};source.stop=(...args)=>{window.__liveAudio.stops++;return stop(...args)};return source}}
  })
})

test('live portal preserves service order and disables guest myhome',async({page})=>{
  await page.goto('/')
  await expect(page.locator('.service h2')).toHaveText(['음악 아카이브','게임 복구','아이템 상점','마이홈'])
  await expect(page.getByRole('button',{name:'마이홈 둘러보기',exact:true})).toBeDisabled()
  await expect(page.getByRole('link',{name:'음악 아카이브 둘러보기',exact:true})).toHaveAttribute('href','/music/')
  await expect(page.locator('.myhome-service')).toContainText('내 의상을 저장해서 언제든지 불러오고 친구에게 공유할 수 있어요')
})

test('live short snapshot keeps both outfits after profile main changes',async({page})=>{
  const code=process.env.LIVE_SHORT_CODE
  test.skip(!code,'A temporary live QA snapshot is supplied by the deployment audit')
  expect(code).toMatch(/^[a-z0-9]{4}$/)
  await page.goto('/short/'+code)
  await expect(page).toHaveURL(/\/shop\?/)
  const query=new URL(page.url()).searchParams
  expect(Object.fromEntries(query)).toMatchObject({sex:'female',partnerSex:'male',top:'30320871',partner_top:'30310765',item:'30854',angle:'237.12345',zoom:'119',panX:'12.345',panY:'-8.765'})
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true})
  await expect(dialog.locator('.shop-stage-status')).toHaveText('',{timeout:60000})
  await dialog.getByRole('button',{name:'커플 모션 시작',exact:true}).click()
  await expect(dialog.locator('canvas')).toHaveAttribute('data-envelope-builds','1',{timeout:60000})
  await expect(dialog.locator('canvas')).toHaveAttribute('data-view-pan-x','12.345')
})

for(const archive of ['music','xyx'])test(`live ${archive} legacy redirect preserves fragments and uses the new archive path`,async({page})=>{
  const calls=[];page.on('request',request=>{if(request.url().includes('/api/'))calls.push(new URL(request.url()).pathname)})
  await page.goto(`https://${archive}.r2archive.com/#song=102939`)
  await expect(page).toHaveURL(new RegExp(`^https://r2archive.com/${archive}/`))
  if(archive==='music')await expect(page).toHaveURL(/#song=102939$/)
  await expect(page.locator('.archive-backdrop')).toHaveCount(1)
  await expect.poll(()=>calls.includes(archive==='music'?'/api/songs':'/api/xyx/songs')).toBe(true)
  await expect(page.locator('body')).not.toContainText('Application error')
})

for(const id of ['30855','30854','30846'])for(const sex of ['female','male'])test(`live ${id} ${sex} native same-sex motion audio and camera`,async({page,request})=>{
  const meta=await (await request.get('/api/shop/meta')).json()
  const detail=await (await request.get(`/api/shop/items/${id}?version=${meta.revision}`)).json()
  expect(detail.couple_preview.same_sex_motions[sex]).toBeTruthy()
  const url=`/shop?view=couple&item=${id}&v=${meta.revision}&sex=${sex}&partnerSex=${sex}&angle=180&zoom=100&panX=3&panY=-2`
  await page.goto(url)
  const dialog=page.getByRole('dialog',{name:'커플 모션 미리보기',exact:true}),canvas=dialog.locator('canvas')
  await expect(dialog.locator('.shop-stage-status')).toHaveText('',{timeout:60000})
  const importer=dialog.getByRole('button',{name:'내 캐릭터 의상 불러오기',exact:true})
  await expect(importer).toBeDisabled();await expect(importer).toHaveAttribute('title','로그인이 필요합니다.')
  await dialog.getByRole('button',{name:'커플 모션 시작',exact:true}).click()
  await expect(canvas).toHaveAttribute('data-envelope-builds','1',{timeout:60000})
  await expect(dialog.locator('.shop-stage-status')).toHaveText('')
  await expect(dialog.locator('.shop-character-labels [data-actor="primary"]')).toHaveText(`${sex==='female'?'여성':'남성'} ㆍ 선택한 의상`)
  await expect(dialog.locator('.shop-character-labels [data-actor="partner"]')).toHaveText(`${sex==='female'?'여성':'남성'} ㆍ 대응 의상`)
  await expect.poll(()=>page.evaluate(()=>window.__liveAudio.starts)).toBeGreaterThan(0)
  const box=await canvas.boundingBox(),angle=Number(await canvas.getAttribute('data-view-angle'))
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2);await page.mouse.up()
  await expect.poll(async()=>Number(await canvas.getAttribute('data-view-angle'))).not.toBe(angle)
  await page.mouse.wheel(0,-100);await expect.poll(async()=>Number(await canvas.getAttribute('data-view-zoom'))).toBeGreaterThan(100)
  await dialog.getByRole('button',{name:'이동 모드',exact:true}).click()
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2);await page.mouse.up()
  await expect.poll(async()=>Number(await canvas.getAttribute('data-view-pan-x'))).not.toBe(3)
  await expect(dialog.getByRole('button',{name:'URL 복사',exact:true})).toBeEnabled()
  await page.screenshot({path:test.info().outputPath('native-couple.png')})
  await dialog.getByRole('button',{name:'커플 모션 미리보기 닫기',exact:true}).click();await expect(dialog).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.__liveAudio.stops)).toBeGreaterThan(0)
})
