import { launch, openMario, requireDevServer, URL_DEFAULT } from '../lib/harness.mjs'
await requireDevServer(URL_DEFAULT)
const browser = await launch()
const page = await openMario(browser, { url: URL_DEFAULT })
await page.evaluate(() => {
    window.__marioTest.autoplay()          // natural flow: starts a fresh 1-1 run
    window.__trace = []
    window.__tick = setInterval(() => {
        const s = window.__marioTest.getState()
        window.__trace.push([s.level, s.col, s.x, s.y, s.h, s.power, s.lives, s.state])
    }, 16)
})
for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(1000)
    const st = await page.evaluate(() => window.__marioTest.getState().state)
    if (st === 'gameover') break
}
const trace = await page.evaluate(() => { clearInterval(window.__tick); return window.__trace })
const fs = await import('node:fs')
fs.writeFileSync('scripts/.shots/qa2111-natural.csv', trace.map(r => r.join(',')).join('\n'))
let pl = null, ps = null
trace.forEach((r, i) => {
    const [lvl, col, x, y, h, pw, lv, st] = r
    if (lvl !== pl || st !== ps) { console.log(`L${i} ${lvl} col=${col} x=${x} p=${pw} lives=${lv} ${st}`); pl = lvl; ps = st }
})
console.log('final', JSON.stringify(trace[trace.length - 1]))
await browser.close()
