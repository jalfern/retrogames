// #2111 rule-8 instrumentation: per-tick sim trace through 1-3 (brake verdicts,
// vy, landings) — the 40ms poll could not resolve the col-35 death.
import { opt, requireDevServer, launch, openMario, URL_DEFAULT } from '../lib/harness.mjs'
import fs from 'fs'

const url = opt(process.argv.slice(2), '--url', URL_DEFAULT)
const maxWait = +opt(process.argv.slice(2), '--max-wait', 260)
await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
await page.evaluate(() => { window.__marioTest.traceReset(); window.__marioTest.autoplay() })

const t0 = Date.now()
let lives = 3, deaths = 0, outcome = 'timeout', inLeg = false
let trace = []
while ((Date.now() - t0) / 1000 < maxWait) {
    await page.waitForTimeout(250)
    const s = await page.evaluate(() => window.__marioTest.getState())
    if (!inLeg) { if (s.level === '1-3') { inLeg = true; lives = s.lives } ; continue }
    if (s.lives < lives) { deaths += lives - s.lives; lives = s.lives; console.log(`death at col ${s.col} (level ${s.level})`) }
    if (s.state === 'gameover') { outcome = 'gameover'; break }
    if (s.state === 'flag' || s.level === '1-4') { outcome = 'win'; break }
}
trace = await page.evaluate(() => window.__marioTest.trace())
const header = 'tick,level,x,y,vx,vy,onGround,wantJump,brake,jump,pf0,pf1\n'
fs.writeFileSync('scripts/.shots/qa2111-ticktrace.csv', header + trace.map(r => r.join(',')).join('\n'))
console.log(`outcome=${outcome} deaths=${deaths} trace=${trace.length} rows -> scripts/.shots/qa2111-ticktrace.csv`)
await browser.close()
