import { launch, openMario, requireDevServer, URL_DEFAULT } from '../lib/harness.mjs'
await requireDevServer(URL_DEFAULT)
const browser = await launch()
const page = await openMario(browser, { url: URL_DEFAULT })
await page.evaluate(() => {
    window.__marioTest.gotoLevel(1)
    window.__marioTest.autoplay()
    window.__trace = []
    window.__tick = setInterval(() => {
        const s = window.__marioTest.getState()
        window.__trace.push([s.col, s.x, s.y, s.h, s.lives, s.state])
    }, 16)
})
for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000)
    const st = await page.evaluate(() => window.__marioTest.getState().state)
    if (st === 'gameover') break
}
const trace = await page.evaluate(() => { clearInterval(window.__tick); return window.__trace })
const fs = await import('node:fs')
fs.writeFileSync('scripts/.shots/qa2111-trace.csv', trace.map(r => r.join(',')).join('\n'))
// first life only, cols 12..34: x,y per sample with inferred vx
let prev = null
for (const r of trace) {
    if (r[4] < 3) break
    const [col, x, y, h, lives, state] = r
    if (col >= 12 && col <= 34) {
        const vx = prev ? x - prev : 0
        console.log(`col=${col} x=${x} y=${y} dx=${vx} h=${h} ${state}`)
    }
    prev = x
}
await browser.close()
