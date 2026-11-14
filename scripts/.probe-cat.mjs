// throwaway #2197 probe: the cat must be SIMULATED and DRAWN on the live page.
import { launch } from './lib/harness.mjs'
const PORT = process.env.DEV_PORT || 5173
let fails = 0
const ok = (c, n, d = '') => { if (c) console.log(`  ok   ${n}${d ? ' — ' + d : ''}`); else { fails++; console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }
const browser = await launch()
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(`http://localhost:${PORT}/retrogames/homebody`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__homebodyTest && window.__homebodyTest.probe().screen !== undefined, { timeout: 25000 })
await page.evaluate(() => window.__homebodyTest.start(3))
await new Promise((r) => setTimeout(r, 200))

const tabby = () => page.evaluate(() => {
    const p = window.__homebodyTest.probe().pet
    if (!p) return -1
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const sx = c.width / 640, sy = c.height / 480
    const x0 = Math.max(0, Math.floor(p.x * sx - 16)), y0 = Math.max(0, Math.floor(p.y * sy - 22))
    const d = g.getImageData(x0, y0, Math.ceil(32 * sx), Math.ceil(26 * sy)).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] > 90 && d[i + 1] < 175 && d[i + 2] < 110) n++
    return n
})

ok((await page.evaluate(() => window.__homebodyTest.probe().pet)) === null, 'no cat on a fresh lot')
ok(await page.evaluate(() => window.__homebodyTest.adopt()) === true, 'the counter sells a cat')
const t0 = await page.evaluate(() => window.__homebodyTest.probe().tick)
await new Promise((r) => setTimeout(r, 900))   // rAF carries the shift; the cat walks on her own
const p = await page.evaluate(() => window.__homebodyTest.probe().pet)
ok(!!p && p.state !== undefined, 'the cat walks on real rAF ticks', JSON.stringify(p))
const orange = await tabby()
ok(orange >= 8, 'the tabby sprite is painted (orange pixels at her position)', `px ${orange}`)
const t1 = await page.evaluate(() => window.__homebodyTest.probe().tick)
const st = await page.evaluate(() => window.__homebodyTest.probe())
ok(t1 > t0 && st.done === null, 'the lot keeps running with her on it', `tick ${t0} -> ${t1}`)
ok(errs.length === 0, 'zero page errors with the cat', errs.slice(0, 2).join(' | '))
console.log(fails ? `\nPROBE FAIL ${fails}` : '\nPROBE GREEN')
await browser.close()
process.exit(fails ? 1 : 0)
