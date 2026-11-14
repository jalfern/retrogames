import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch } from './lib/harness.mjs'
const shots = resolve('scripts/.shots/fox/strip'); mkdirSync(shots, { recursive: true })
const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
await page.goto(BASE + 'fox.html', { waitUntil: 'load' })
await page.waitForFunction(() => window.__foxTest && window.__foxTest.ready)
for (let i = 0; i < 8; i++) {
  await page.evaluate(pp => window.__foxTest.setPhase(pp), i / 8)
  await page.screenshot({ path: `${shots}/s${i}.png` })
}
await browser.close()
console.log('strip done')
