import { expect, test } from '@playwright/test'
import { setup, shirt, version } from './shopFixtures.js'
import { watchLayout } from './layout.js'
const id='11111111-1111-4111-8111-111111111111', token='1'.repeat(80), url='https://r2archive.com/short/abcd'
const result={search_id:id,version,sex:'male',slot:'top',groups:[{slot:'top',items:[shirt]}],items:[shirt]}
const shared={...result,search_id:null,shared:true,url,image_url:`/api/shop/image-search/shared/${token}/image`,selected_ids:[shirt.id],votes:[]}
async function picture(page) {
  return page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,600,400);x.fillStyle='green';x.fillRect(150,100,300,200);return c.toDataURL().split(',')[1]})
}
async function openUpload(page) {
  await page.goto('/shop?sex=male'); await page.getByRole('button',{name:'이미지로 찾기',exact:true}).click()
  const bytes=await picture(page)
  await page.getByLabel('검색 이미지',{exact:true}).setInputFiles({name:'large-background.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')})
  await expect(page.getByAltText('검색할 캐릭터 원본 이미지')).toBeVisible()
  await page.getByLabel('검색할 캐릭터 성별',{exact:true}).selectOption('male')
  return page.getByRole('dialog',{name:'이미지로 아이템 찾기'})
}
for(const width of [1440,390]) {
  test(`only the selected image region is uploaded and shared at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});await setup(page,{admin:false})
    let posted,release,published
    await page.route('**/api/shop/image-search',async route=>{const raw=route.request().postDataBuffer(),start=raw.indexOf('\r\n\r\n',raw.indexOf('name="image"'))+4,end=raw.indexOf('\r\n--',start);posted=raw.subarray(start,end);await new Promise(resolve=>{release=resolve});return route.fulfill({json:result})})
    await page.route(`**/image-search/history/${id}/share`,async route=>{published=route.request().postDataJSON();return route.fulfill({json:{url}})})
    const dialog=await openUpload(page),search=dialog.getByRole('button',{name:'비슷한 아이템 찾기',exact:true})
    await expect(search).toBeDisabled();await expect(dialog.getByText('검색에 사용할 부분을 지정해주세요',{exact:true})).toBeVisible()
    const svg=dialog.getByLabel('검색 영역 지정',{exact:true}),bounds=await svg.boundingBox()
    await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height*.25);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.75,bounds.y+bounds.height*.75,{steps:4});await page.mouse.up()
    await expect(search).toBeEnabled()
    // Use exact keyboard-accessible coordinates after checking pointer selection.
    for(const [label,value] of [['왼쪽',250],['위쪽',250],['너비',500],['높이',500]]) await dialog.getByRole('slider',{name:`검색 영역 ${label}`,exact:true}).evaluate((node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}))},value)
    await search.scrollIntoViewIfNeeded()
    const watch=await watchLayout(page,['.shop-image-search-workspace','.shop-image-search-submit','.shop-image-search-status','.shop-image-search-actions','.shop-image-search-results'])
    await search.click();await expect.poll(()=>!!posted).toBe(true);await watch.expectStable()
    expect(posted.readUInt32BE(16)).toBe(300);expect(posted.readUInt32BE(20)).toBe(200)
    const pixel=await page.evaluate(async encoded=>{const image=new Image(),link=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),x=>x.charCodeAt(0))],{type:'image/png'}));image.src=link;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const sample=Array.from(x.getImageData(0,0,1,1).data);URL.revokeObjectURL(link);return sample},posted.toString('base64'))
    expect(pixel).toEqual([0,128,0,255])
    await watch.stop();release();await expect(dialog.getByRole('button',{name:`${shirt.name} 선택`,exact:true})).toBeVisible()
    await dialog.getByRole('button',{name:`${shirt.name} 선택`,exact:true}).click()
    await dialog.getByRole('button',{name:'이 결과 URL 저장',exact:true}).click()
    await expect(dialog.getByRole('textbox',{name:'공유 결과 URL',exact:true})).toHaveValue(url)
    expect(published).toEqual({selected_ids:[shirt.id]})
    expect(await page.evaluate(()=>window.__copiedShopUrl)).toBe(url)
  })
  for(const loggedIn of [false,true]) test(`shared result restores without inference for ${loggedIn?'member':'guest'} at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});const requests=await setup(page,{admin:false,loggedIn})
    let release;await page.route(`**/image-search/shared/${token}`,async route=>{await new Promise(resolve=>{release=resolve});return route.fulfill({json:shared})})
    const buffer=Buffer.from(await picture(page),'base64');await page.route(`**/image-search/shared/${token}/image`,route=>route.fulfill({body:buffer,contentType:'image/png'}))
    await page.goto(`/shop?imageResult=${token}&v=${version}&sex=male`)
    const dialog=page.getByRole('dialog',{name:'이미지로 아이템 찾기'});await expect(dialog).toBeVisible();await expect.poll(()=>!!release).toBe(true)
    await dialog.getByRole('button',{name:'다시 찾기',exact:true}).scrollIntoViewIfNeeded()
    const watch=await watchLayout(page,['.shop-image-search-workspace','.shop-image-search-submit','.shop-image-search-status','.shop-image-search-actions','.shop-image-search-results'])
    await watch.expectStable();await watch.stop();release();await expect(dialog.getByRole('button',{name:`${shirt.name} 선택`,exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(dialog.getByRole('button',{name:'다시 찾기',exact:true}))[loggedIn?'toBeEnabled':'toBeDisabled']()
    await expect(dialog.getByRole('button',{name:'해당 의상 즐겨찾기 등록',exact:true}))[loggedIn?'toBeEnabled':'toBeDisabled']()
    await expect(dialog.getByRole('button',{name:`${shirt.name} 좋아요`,exact:true})).toBeDisabled()
    expect(requests.filter(path=>path==='/api/shop/image-search')).toHaveLength(0)
    if(loggedIn){await dialog.getByRole('button',{name:'해당 의상 즐겨찾기 등록',exact:true}).click();await expect(dialog.getByText('선택한 의상을 즐겨찾기에 등록했습니다.')).toBeVisible();await dialog.getByRole('button',{name:'다시 찾기',exact:true}).click();await expect(page).not.toHaveURL(/imageResult=/);await expect(dialog).toBeVisible();await expect(dialog.getByLabel('검색할 캐릭터 성별',{exact:true})).toHaveValue('')}
    else {await dialog.getByRole('button',{name:'해당 의상 입어보기',exact:true}).click();await expect(page.getByRole('dialog',{name:'의상 미리보기',exact:true})).toBeVisible();await page.getByRole('button',{name:/이미지 검색 다시 열기/}).click();await expect(dialog.getByRole('button',{name:'다시 찾기',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'이미지 검색 최소화',exact:true}).click();await page.getByRole('button',{name:'로그인',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('r2_shop_return')).url)).toContain('imageResult='+token)}
  })
}
test('deleted shared result shows a recoverable error',async({page})=>{
 await setup(page,{admin:false});await page.route(`**/image-search/shared/${token}`,route=>route.fulfill({status:404,json:{detail:'존재하지 않거나 삭제된 공유 결과입니다.'}}))
 await page.goto(`/shop?imageResult=${token}`);await expect(page.getByRole('alert')).toHaveText('존재하지 않거나 삭제된 공유 결과입니다.');await page.getByRole('button',{name:'다시 찾기',exact:true}).click();await expect(page.getByRole('dialog',{name:'이미지로 아이템 찾기'})).toBeVisible()
})
