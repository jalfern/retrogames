// #2111 seed probe: fix the RNG seed, drive the natural flow into 1-3, and report
// per-tick death columns (x-reset in the trace = respawn) — the 40ms poll reports
// the respawn col (3), not the death col, which hid where lives were really lost.
import { opt, requireDevServer, launch, openMario, URL_DEFAULT } from '../lib/harness.mjs'
import fs from 'fs'

const args = process.argv.slice(2)
const seed = opt(args, '--seed', '101')
const url = `${opt(args, '--url', URL_DEFAULT)}?seed=${seed}`
const maxWait = +opt(args, '--max-wait', 240)
await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
await page.evaluate(() => { window.__marioTest.traceReset(); window.__marioTest.autoplay() })

const t0 = Date.now()
let outcome = 'timeout', s = null, inLeg = false
while ((Date.now() - t0) / 1000 < maxWait) {
    await page.waitForTimeout(200)
    s = await page.evaluate(() => window.__marioTest.getState())
    if (!inLeg) { if (s.level === '1-3') inLeg = true; continue }
    if (s.state === 'gameover') { outcome = 'gameover'; break }
    if (s.state === 'flag' || s.level === '1-4') { outcome = 'win'; break }
}
const trace = await page.evaluate(() => window.__marioTest.trace())
fs.writeFileSync(`scripts/.shots/qa2111-seed-${seed}.csv`,
    'tick,level,x,y,vx,vy,onGround,wantJump,brake,jump,pf0,pf1\n' + trace.map(r => r.join(',')).join('\n'))
// deaths: level-1-3 rows where x drops by >80px = respawn
const rows = trace.filter(r => r[1] === '1-3')
let prevX = null, maxCol = 0, deaths = []
for (const r of rows) {
    const col = Math.floor(r[2] / 16)
    if (prevX !== null && r[2] < prevX - 80) deaths.push(Math.floor(prevX / 16))
    if (r[2] > maxCol * 16) maxCol = Math.floor(r[2] / 16)
    prevX = r[2]
}
console.log(`seed=${seed} outcome=${outcome} maxCol=${maxCol} deaths@cols=[${deaths.join(',')}] level=${s && s.level} power=${s && s.power} trace=${trace.length}`)
await browser.close()
