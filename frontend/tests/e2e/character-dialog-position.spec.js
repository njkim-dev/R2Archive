import {expect,test} from '@playwright/test'
import {setup,femaleShirt} from './shopFixtures.js'
import {watchLayout} from './layout.js'

async function centered(page,dialog){
  const box=await dialog.boundingBox(),viewport=page.viewportSize()
  expect(Math.abs(box.x+box.width/2-viewport.width/2)).toBeLessThan(2)
  expect(Math.abs(box.y+box.height/2-viewport.height/2)).toBeLessThan(2)
  expect(box.x).toBeGreaterThanOrEqual(12)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width-12)
  expect(box.y+box.height).toBeLessThanOrEqual(viewport.height)
  expect(box.width).toBeLessThanOrEqual(480)
  return box
}

for(const entry of ['home','shop'])test(`character creation stays centered through gender selection and pending errors from ${entry}`,async({page})=>{
  await page.setViewportSize({width:test.info().project.use.viewport.width<=768?390:1440,height:900})
  await setup(page,{characters:[],items:[femaleShirt]})
  let release,requested=false;const gate=new Promise(resolve=>{release=resolve})
  await page.route('**/api/shop/characters**',async route=>{
    if(route.request().method()!=='POST'||new URL(route.request().url()).pathname!=='/api/shop/characters')return route.fallback()
    requested=true;await gate;return route.fulfill({status:409,json:{detail:'이미 사용 중인 캐릭터 이름입니다.'}})
  })
  await page.goto(entry==='home'?'/myhome':'/shop?sex=female')
  const open=page.getByRole('button',{name:'새 캐릭터 추가',exact:true});await expect(open).toBeEnabled()
  const watcher=await watchLayout(page,['.shop-header',entry==='home'?'.shop-character-cards':'.shop-grid'])
  await open.click();const dialog=page.getByRole('dialog',{name:'새 캐릭터 추가',exact:true});await expect(dialog).toBeVisible();await centered(page,dialog);await watcher.expectStable()
  await dialog.getByRole('button',{name:'여성',exact:true}).click();await dialog.getByLabel('캐릭터 이름').fill('위치확인');await centered(page,dialog)
  const before=await dialog.boundingBox();await dialog.getByRole('button',{name:'캐릭터 만들기',exact:true}).click();await expect.poll(()=>requested).toBe(true);await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeDisabled();expect(await centered(page,dialog)).toEqual(before);await watcher.expectStable()
  release();await expect(dialog.getByRole('alert')).toHaveText('이미 사용 중인 캐릭터 이름입니다.');expect(await centered(page,dialog)).toEqual(before);await watcher.expectStable();await watcher.stop()
  await page.screenshot({path:test.info().outputPath('centered-character-dialog.png')})
  await page.setViewportSize({...page.viewportSize(),height:500});await centered(page,dialog)
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(open).toBeEnabled()
})
