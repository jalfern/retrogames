// throwaway probe for #615 — compact: grab reach + boot clear per pose
import { launch, requireDevServer } from './lib/harness.mjs'

const URL = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5174}/retrogames/ssx?lite=1`
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1400)
const pressQ = async () => {
    await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift')
}
await pressQ()
await page.waitForTimeout(400)

const read = () => page.evaluate(() => ({
    grab: window.__ssxTest.grabReach(),
    boot: window.__ssxTest.bootClear(),
}))

const settleRead = async () => {
    let prev = null
    for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(300)
        const s = await read()
        const key = JSON.stringify(s)
        if (prev === key) return s
        prev = key
    }
    return read()
}

for (const p of ['stand', 'crouch', 'tuck', 'grab']) {
    await page.evaluate((n) => window.__ssxTest.setPose(n), p)
    const s = await settleRead()
    console.log(p, JSON.stringify(s))
}
await page.evaluate(() => window.__ssxTest.setPose(null))
await pressQ()
await browser.close()
