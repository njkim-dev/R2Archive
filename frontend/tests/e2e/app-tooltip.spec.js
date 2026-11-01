import {expect,test} from '@playwright/test'
import {setup} from './shopFixtures.js'
import {watchLayout} from './layout.js'

test.beforeEach(async({page},info)=>{if(info.project.use.viewport.width<=768)await page.setViewportSize({width:390,height:900});await setup(page,{loggedIn:false});await page.goto('/shop')})

test('logged out myhome uses a custom tooltip over the disabled tab without shifting content',async({page})=>{
  const button=page.getByRole('tab',{name:'마이홈',exact:true});await expect(button).toBeDisabled();await expect(button).not.toHaveAttribute('title',/.+/)
  const watcher=await watchLayout(page,['.shop-header','.shop-spaces','.shop-grid']);await button.hover();await expect(page.getByRole('tooltip')).toHaveText('로그인하세요');await watcher.expectStable();await page.mouse.move(1,1);await expect(page.getByRole('tooltip')).toHaveCount(0);await watcher.expectStable();await watcher.stop()
})

test('long tooltip escapes transformed clipped dialogs and remains scrollable within the viewport',async({page})=>{
  const text=Array.from({length:150},(_,i)=>`캐릭터 ${i+1} - ${'이름'.repeat(20)}`).join('\n')
  await page.evaluate(text=>{const dialog=document.createElement('dialog');dialog.id='tooltip-clip-test';dialog.style.cssText='position:fixed;inset:0 0 auto auto;margin:0;width:44px;height:44px;padding:0;overflow:hidden;transform:translateZ(0)';const button=document.createElement('button');button.textContent='?';button.setAttribute('aria-label','가장자리 툴팁');button.dataset.tooltip=text;button.style.cssText='width:40px;height:40px';dialog.append(button);document.body.append(dialog);dialog.showModal()},text)
  const watcher=await watchLayout(page,['.shop-header','.shop-grid']);await page.getByRole('button',{name:'가장자리 툴팁'}).hover();const tooltip=page.getByRole('tooltip');await expect(tooltip).toHaveText(text)
  const box=await tooltip.boundingBox(),viewport=page.viewportSize();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height)
  expect(await tooltip.evaluate(node=>node.matches(':popover-open')&&node.scrollHeight>node.clientHeight&&document.elementFromPoint(node.getBoundingClientRect().x+10,node.getBoundingClientRect().y+20)===node)).toBe(true)
  await tooltip.hover();await tooltip.evaluate(node=>{node.scrollTop=node.scrollHeight});expect(await tooltip.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);await watcher.expectStable();await page.screenshot({path:test.info().outputPath('long-tooltip.png')});await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);await expect(page.locator('#tooltip-clip-test')).toBeHidden();await watcher.expectStable();await watcher.stop()
})
