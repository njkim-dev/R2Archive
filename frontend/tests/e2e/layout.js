import { expect } from '@playwright/test'

export async function waitForFrames(page, count = 8) {
  await page.evaluate(count => new Promise(resolve => {
    const tick = () => --count <= 0 ? resolve() : requestAnimationFrame(tick)
    requestAnimationFrame(tick)
  }), count)
}

export async function watchLayout(page, selectors) {
  await page.evaluate(() => document.fonts.ready)
  await waitForFrames(page)
  await page.evaluate(selectors => {
    const rect = selector => {
      const node = document.querySelector(selector)
      if (!node) return null
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x, y, width, height }
    }
    const baseline = Object.fromEntries(selectors.map(selector => [selector, rect(selector)]))
    for (const [selector, bounds] of Object.entries(baseline)) {
      if (!bounds) throw new Error(`Missing layout target: ${selector}`)
    }
    const watch = window.__layoutWatch = { samples: 0, shifts: [] }
    // 클릭 직후의 이동도 검사한다. 최근 입력을 제외하는 CLS만으로는 잡히지 않는다.
    const tick = () => {
      watch.samples++
      for (const [selector, before] of Object.entries(baseline)) {
        const after = rect(selector)
        if (!after) {
          if (watch.shifts.length < 20) watch.shifts.push({ selector, missing: true })
          continue
        }
        for (const key of Object.keys(before)) {
          if (Math.abs(before[key] - after[key]) > 0.5 && watch.shifts.length < 20) {
            watch.shifts.push({ selector, key, before: before[key], after: after[key] })
          }
        }
      }
      watch.frame = requestAnimationFrame(tick)
    }
    watch.frame = requestAnimationFrame(tick)
  }, selectors)
  return {
    async expectStable() {
      await waitForFrames(page)
      const { samples, shifts } = await page.evaluate(() => window.__layoutWatch)
      expect(samples).toBeGreaterThan(0)
      expect(shifts, 'UI geometry changed during the state transition').toEqual([])
    },
    async stop() {
      await page.evaluate(() => cancelAnimationFrame(window.__layoutWatch.frame))
    },
  }
}
