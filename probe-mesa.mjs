import { chromium } from 'playwright-core'
const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd?gl=webgl2`
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling'] })
const page = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!(window.__cometHDTest && window.__cometHDTest.ready()), null, { timeout: 30000 })
// attract mode: park the camera on the horizon to inspect the mesa shadow ring
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa1002-mesa.png' })
// also query the geometry to prove the quads sit on the sun line
const G = await page.evaluate(() => window.__cometHDTest.mesaShadows())
console.log(JSON.stringify(G))
await browser.close()
