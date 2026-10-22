// throwaway #615: stand + grab shots in all three themes — paused at the gate,
// overlay hidden for the capture (pose override keeps blending while paused)
import { launch, requireDevServer } from './lib/harness.mjs'
import fs from 'node:fs'

const URL = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5174}/retrogames/ssx`
const OUT = process.env.OUT || '/tmp/qa615'
fs.mkdirSync(OUT, { recursive: true })
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(250)
await page.waitForFunction(() => window.__ssxTest.hero().ready, null, { timeout: 15000 })
await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift')
await page.waitForTimeout(600)
const hideOverlay = () => page.evaluate(() => {
    const o = document.querySelector('div[class*="bg-black/80"]')
    if (o) o.style.display = 'none'
})
await hideOverlay()

for (const t of ['day', 'night', 'dusk']) {
    await page.evaluate((th) => window.__ssxTest.setTheme(th), t)
    await page.waitForTimeout(1800)
    await hideOverlay()
    for (const p of ['stand', 'grab']) {
        await page.evaluate((n) => window.__ssxTest.setPose(n), p)
        await page.waitForTimeout(2400)
        const st = await page.evaluate(() => {
            const q = window.__ssxTest.probe()
            return { air: q.p.air, v: +q.p.v.toFixed(1), tumble: q.p.tumble }
        })
        await page.screenshot({ path: `${OUT}/${t}-${p}.png` })
        console.log(t, p, JSON.stringify(st), JSON.stringify(await page.evaluate(() => window.__ssxTest.shadowInfo())))
    }
}
await browser.close()
