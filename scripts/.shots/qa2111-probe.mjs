// QA #2111 repro: drive the autopilot on 1-3 directly and trace the pit deaths.
import { launch, openMario, requireDevServer, URL_DEFAULT } from '../lib/harness.mjs'

await requireDevServer(URL_DEFAULT)
const browser = await launch()
const page = await openMario(browser, { url: URL_DEFAULT })
await page.evaluate(() => {
    window.__marioTest.gotoLevel(1)      // 1-3
    window.__marioTest.autoplay()
    window.__trace = []
    window.__tick = setInterval(() => {
        const T = window.__marioTest, s = T.getState()
        window.__trace.push([s.col, s.x, s.y, s.h, s.lives, s.state, s.mode])
    }, 16)
})
let last = null
for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000)
    const s = await page.evaluate(() => {
        const T = window.__marioTest, st = T.getState()
        return { state: st.state, col: st.col, lives: st.lives }
    })
    last = s
    if (s.state === 'gameover') break
}
clearIntervalOn(page)
async function clearIntervalOn(p) { await p.evaluate(() => clearInterval(window.__tick)).catch(() => {}) }
const trace = await page.evaluate(() => window.__trace)
// print every sample from col>=25 to just after each death, one per line
let prevLives = null
for (const [col, x, y, h, lives, state, mode] of trace) {
    if (col >= 25 && (prevLives === null || lives === prevLives)) console.log(`${col},${x},${y},${h},${lives},${state},${mode}`)
    if (prevLives !== null && lives < prevLives) { console.log(`DIED at col ${col} x=${x} y=${y} h=${h} -> lives ${lives} state=${state}`); prevLives = lives }
    if (prevLives === null) prevLives = lives
}
console.log('final', JSON.stringify(last), 'samples', trace.length)
await clearIntervalOn(page)
await browser.close()
