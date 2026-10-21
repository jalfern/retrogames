import { launch, requireDevServer } from '/Users/jon/Dev/retrogames-qa-615/scripts/lib/harness.mjs'
const URL = `http://localhost:${process.env.DEV_PORT || 5174}/retrogames/ssx?lite=1`
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1400)
const names = await page.evaluate(() => window.__ssxTest.boneNames())
console.log(JSON.stringify(names))
await browser.close()
