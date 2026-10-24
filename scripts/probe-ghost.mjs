import { chromium } from 'playwright-core'
const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd?gl=webgl2`
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling'] })
const page = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()) })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!(window.__cometHDTest && window.__cometHDTest.ready()), null, { timeout: 30000 })
await page.waitForFunction(() => !!(window.__cometHDTest && window.__cometHDTest.modelLoaded()), null, { timeout: 15000 }).catch(() => console.log('model not loaded (primitive fallback)'))
await page.keyboard.press('Space')
await page.waitForTimeout(150)
await page.evaluate(() => { window.__cometHDTest.game().count = 1 })
await page.keyboard.down('KeyX')
await page.waitForFunction(() => window.__cometHDTest.fx().v > 4, null, { timeout: 4000 }).catch(() => {})
await page.waitForTimeout(600)
const S = await page.evaluate(() => ({
    ghost0: window.__cometHDTest.ghost(0),
    ghost1: window.__cometHDTest.ghost(1),
    mesa: window.__cometHDTest.mesaShadows(),
    kart: window.__cometHDTest.kartWorld(),
    backend: window.__cometHDTest.backend(),
}))
console.log(JSON.stringify(S, null, 1))
await page.screenshot({ path: '/tmp/qa1002-close.png', clip: { x: 340, y: 220, width: 400, height: 200 } })
await browser.close()
