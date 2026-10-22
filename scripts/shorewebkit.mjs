// shorewebkit — informational probe for #702 slice B: does Playwright's WebKit
// have WebGPU at all, and can it hold frames on SHORE? Jon's stutter is
// Safari/WebKit-only (Safari on the Studio, iOS Chrome); the Chromium-based
// shorecheck never sees it. Headless WebKit ships WITHOUT WebGPU on most
// builds, so this exits 0 either way and just prints the verdict — it is a
// sensor, not a gate (rule 6: no permanently-red check).
//
// Usage: node scripts/shorewebkit.mjs [--file <path>]

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
let webkit
try { ({ webkit } = require('playwright-core')) } catch {
  console.error('playwright-core is not installed. Run `npm install` first.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const file = resolve(ROOT, opt('--file', 'public/demos/shore.html'))
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file + '?diag=1'

const browser = await webkit.launch()
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
const caps = await page.evaluate(() => ({
  ua: navigator.userAgent,
  gpu: !!navigator.gpu,
}))
console.log('ua     :', caps.ua)
console.log('gpu    :', caps.gpu ? 'navigator.gpu present' : 'NO WebGPU in this WebKit build')
if (caps.gpu) {
  try {
    await page.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 })
    await page.waitForTimeout(4000)
    const rep = await page.evaluate(() => JSON.parse(window.__diagReport()))
    console.log('frames :', rep.frames.n, `avg ${rep.frames.avgMs}ms p95 ${rep.frames.p95Ms}ms worst ${rep.frames.worstMs}ms`)
    console.log('hitches:', rep.frames.hitchesGt32, '>32ms ·', rep.frames.hitchesGt100, '>100ms · dropped', rep.frames.droppedSimS, 'sim-s')
    console.log('passes :', rep.passes ? JSON.stringify(rep.passes) : 'timestamp-query unavailable')
  } catch (e) {
    console.log('boot   : failed —', String(e).split('\n')[0])
  }
}
if (errs.length) console.log('errors :', errs.slice(0, 3).join(' | '))
await browser.close()
console.log(caps.gpu ? 'VERDICT: WebKit has WebGPU — reproduce the burst here' : 'VERDICT: WebKit headless lacks WebGPU — real-device ?diag=1 report is the only WebKit sensor')
process.exit(0)
