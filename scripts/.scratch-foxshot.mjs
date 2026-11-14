// scratch visual probe — capture fox.html at set phases
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch } from './lib/harness.mjs'
const shots = resolve('scripts/.shots/fox')
mkdirSync(shots, { recursive: true })
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 780 }, deviceScaleFactor: 1 })
let errs = 0
page.on('pageerror', e => { errs++; console.log('[pageerror]', e.message) })
await page.goto(BASE + 'fox.html', { waitUntil: 'load' })
await page.waitForFunction(() => window.__foxTest && window.__foxTest.ready, null, { timeout: 15000 })
await page.waitForTimeout(800)
for (const p of [0.02, 0.28, 0.5, 0.62, 0.9]) {
  await page.evaluate(pp => window.__foxTest.setPhase(pp), p)
  await page.screenshot({ path: `${shots}/p${String(p).replace('.', '')}.png` })
}
await page.evaluate(() => window.__foxTest.resume())
await page.waitForTimeout(1500)
await page.screenshot({ path: `${shots}/live.png` })
console.log('errors:', errs)
const c = await page.evaluate(() => ({ lit: window.__foxTest.countPixels((r, g, b) => r + g + b > 240, 3), center: window.__foxTest.foxCenterScreen() }))
console.log('lit px:', c.lit, 'center:', c.center)
await browser.close()
