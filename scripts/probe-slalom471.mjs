import { launch, openGame, requireDevServer } from './lib/harness.mjs'
const BASE = 'http://localhost:5179/retrogames/comet-drift-hd?gl=webgl2'
requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: BASE, viewport: { width: 840, height: 420 }, hook: '__cometHDTest', wait: 500 })
await page.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
await page.keyboard.press('Space')
await page.waitForTimeout(150)
await page.evaluate(() => { window.__cometHDTest.game().count = 1 })
await page.keyboard.down('KeyX')
await page.waitForTimeout(1000)
await page.keyboard.down('Space')
const trace = []
for (let i = 0; i < 8; i++) {
    const key = i % 2 ? 'ArrowRight' : 'ArrowLeft'
    await page.keyboard.down(key)
    await page.waitForTimeout(230)
    trace.push(await page.evaluate(() => {
        const g = window.__cometHDTest.game()
        const P = g.karts[0]
        return { t: g.tick, spinT: P.spinT, offroad: P.offroad, v: +P.v.toFixed(2), driftT: P.driftT, charge: P.charge, x: Math.round(P.x), y: Math.round(P.y) }
    }))
    await page.keyboard.up(key)
}
console.log(JSON.stringify(trace, null, 1))
await browser.close()
